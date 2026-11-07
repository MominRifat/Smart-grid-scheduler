"""Glue: raw JSON in -> (HTTP status, output JSON) out. Used by the API and the CLI.

Output format lives entirely in `_roster_json` / `build_output` so it can be
aligned with schema.md in one place.
"""
from __future__ import annotations

import json
from decimal import Decimal
from typing import Any

import logging

from .backup import solve_backup
from .check import rule_errors
from .diagnose import diagnose, static_conflicts
from .explain import explain, local_only
from .model import Solution
from .timebudget import Deadline
from .validate import HOUR_LABELS, InvalidInput, Problem, parse_problem

log = logging.getLogger("who_stays_on")

try:  # main engine; if OR-Tools cannot load, the backup solver carries the app
    from .solver import solve, solve_best_effort

    CPSAT_AVAILABLE = True
except Exception as exc:  # pragma: no cover - exercised by forcing CPSAT_AVAILABLE=False in tests
    log.error("CP-SAT unavailable, using backup solver only: %r", exc)
    CPSAT_AVAILABLE = False


def _litres(cl: int) -> float:
    return round(cl / 100, 2)


def _roster_json(problem: Problem, sol: Solution, reasons: dict[tuple[int, int], str]) -> dict:
    roster = []
    running = 0
    for h in problem.outage_slots:
        powered = [s.id for i, s in enumerate(problem.shops) if sol.on[i, h]]
        dark = [
            {"id": s.id, "reason": reasons.get((i, h), "")}
            for i, s in enumerate(problem.shops) if not sol.on[i, h]
        ]
        load = sum(s.kw for i, s in enumerate(problem.shops) if sol.on[i, h])
        fuel = problem.fuel_for_load(load)
        running += fuel
        roster.append({
            "slot": h,
            "hour": HOUR_LABELS[h],
            "powered": powered,
            "dark": dark,
            "load_kw": load,
            "fuel_litres": _litres(fuel),
            "fuel_running_litres": _litres(running),
            "value": sum(s.values[h] for i, s in enumerate(problem.shops) if sol.on[i, h]),
        })
    # Totals are recomputed from the roster itself (rule 8), never copied from the solver.
    dark_hours = {
        s.id: sum(1 for h in problem.outage_slots if not sol.on[i, h]) for i, s in enumerate(problem.shops)
    }
    return {
        "roster": roster,
        "value_total": sum(r["value"] for r in roster),
        "fuel_total_litres": _litres(running),
        "dark_hours": dark_hours,
    }


REQUEST_SECONDS = 7.5  # hard budget per request; the brief allows 10 s, the rest is safety margin


def _main_solve(problem: Problem, deadline: Deadline) -> tuple[Solution | None, bool]:
    if not CPSAT_AVAILABLE:
        return None, False
    try:
        sol, proven = solve(problem, deadline)
    except Exception:
        log.exception("CP-SAT crashed; falling back to backup solver")
        return None, False
    if sol is not None and rule_errors(problem, sol):
        log.error("CP-SAT roster failed the rule check %s; falling back", rule_errors(problem, sol))
        return None, False
    return sol, proven


def build_output(problem: Problem) -> dict:
    """Main engine first; backup solver if it is missing, crashes, times out or is not proven optimal."""
    deadline = Deadline(REQUEST_SECONDS)
    sol, proven_infeasible = _main_solve(problem, deadline)

    if (sol is None and not proven_infeasible) or (sol is not None and not sol.optimal):
        backup = solve_backup(problem, seconds=min(1.5, deadline.left(reserve=0.5)))
        if backup is not None and (sol is None or backup.value > sol.value):
            sol = backup

    if sol is not None:
        if sol.solver == "cp-sat" and CPSAT_AVAILABLE:
            try:
                reasons = explain(problem, sol, deadline)
            except Exception:
                log.exception("explain failed; using local reasons")
                reasons = local_only(problem, sol)
        else:
            reasons = local_only(problem, sol)
        out = {"status": "ok", **_roster_json(problem, sol, reasons)}
        out["optimal"] = sol.optimal
        out["solver"] = sol.solver
        return out

    return _infeasible(problem, deadline, proven=proven_infeasible)


def _infeasible(problem: Problem, deadline: Deadline, *, proven: bool) -> dict:
    conflicts: list[dict] = []
    best: Solution | None = None
    if CPSAT_AVAILABLE:
        try:
            conflicts = diagnose(problem, deadline)
            best = solve_best_effort(problem, deadline)
        except Exception:
            log.exception("diagnosis failed; using static checks")
    if not conflicts:
        conflicts = static_conflicts(problem) or [{
            "rule": "unknown", "shops": [], "hours": [HOUR_LABELS[h] for h in problem.outage_slots],
            "detail": "No legal roster was found within the time limit" + ("" if proven else " (not proven impossible)"),
        }]
    if best is None or rule_errors(problem, best, best_effort=True):
        best = _safe_best_effort(problem)
    reasons = explain_best_effort(problem, best)
    lead = conflicts[0]
    return {
        "status": "infeasible",
        "message": f"No roster can satisfy every rule. {lead['rule']}: {lead['detail']}",
        "conflicts": conflicts,
        "best_effort": {
            "label": "BEST EFFORT - breaks the rules listed in violations; capacity and diesel are respected",
            **_roster_json(problem, best, reasons),
            "violations": [
                {"rule": v["rule"], "shop": v["shop"], "hours": [HOUR_LABELS[h] for h in v["hours"]]}
                for v in best.violations
            ],
        },
    }


def _safe_best_effort(problem: Problem) -> Solution:
    """Last resort without a solver: mandatory shops on where capacity and diesel allow, others dark."""
    on = {(i, h): False for i in range(len(problem.shops)) for h in problem.outage_slots}
    fuel = 0
    for h in problem.outage_slots:
        load = 0
        for i, s in enumerate(problem.shops):
            if s.mandatory and load + s.kw <= problem.capacity_kw:
                extra = problem.fuel_for_load(load + s.kw) - problem.fuel_for_load(load)
                if fuel + extra <= problem.budget_cl:
                    on[i, h] = True
                    load += s.kw
                    fuel += extra
    sol = Solution(on=on, value=0, fuel_cl=fuel, optimal=False, solver="backup")
    violations = []
    for i, s in enumerate(problem.shops):
        if s.mandatory:
            violations += [{"rule": "mandatory", "shop": s.id, "hours": [h]} for h in problem.outage_slots if not on[i, h]]
        else:
            run: list[int] = []
            for h in range(10):
                run = run + [h] if (not problem.grid[h] and not on[i, h]) else []
                if len(run) == problem.max_dark + 1:
                    violations.append({"rule": "dark_run", "shop": s.id, "hours": list(run)})
    sol.violations = violations
    return sol


def explain_best_effort(problem: Problem, sol: Solution) -> dict[tuple[int, int], str]:
    from .explain import _with_runs, local_reason

    reasons = {}
    for (si, h), on in sol.on.items():
        if not on:
            prefix = "MANDATORY SHOP CUT - " if problem.shops[si].mandatory else ""
            reasons[si, h] = prefix + local_reason(problem, sol, si, h)
    return _with_runs(problem, sol, reasons)


def run(raw: Any) -> tuple[int, dict]:
    """Returns (http_status, body). 200 for ok/infeasible, 400 for invalid_input."""
    try:
        problem = parse_problem(raw)
    except InvalidInput as e:
        return 400, {"status": "invalid_input", "field": e.field, "message": str(e)}
    return 200, build_output(problem)


def run_text(text: str | bytes) -> tuple[int, dict]:
    try:
        raw = json.loads(text, parse_float=Decimal)
    except (ValueError, UnicodeDecodeError) as e:
        return 400, {"status": "invalid_input", "field": "(body)", "message": f"(body): not valid JSON - {e}"}
    return run(raw)

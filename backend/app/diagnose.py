"""Infeasibility diagnosis (rule 5): say WHICH rule and WHICH shops/hours conflict.

Checked from the most obvious cause to the subtlest:
  1. a mandatory shop bigger than the generator, or mandatory shops that together exceed it
  2. a normal shop bigger than the generator facing more outage hours in a row than allowed
  3. capacity vs dark-run rotation: too many shops must be on in the same hour
  4. diesel: the cheapest roster that keeps every other rule still needs more than the budget
"""
from __future__ import annotations

from .timebudget import Deadline
from .validate import HOUR_LABELS, Problem


def _hours(slots) -> list[str]:
    return [HOUR_LABELS[h] for h in slots]


def _dark_windows(p: Problem) -> list[list[int]]:
    w = p.max_dark + 1
    return [list(range(a, a + w)) for a in range(10 - w + 1) if all(not p.grid[h] for h in range(a, a + w))]


def static_conflicts(problem: Problem) -> list[dict]:
    """The checks that need no solver (also used when OR-Tools is unavailable)."""
    return diagnose(problem, Deadline(0.0), static_only=True)


def diagnose(problem: Problem, deadline: Deadline | None = None, static_only: bool = False) -> list[dict]:
    deadline = deadline or Deadline(4.0)
    p = problem
    hours = p.outage_slots
    cap = p.capacity_kw
    conflicts: list[dict] = []

    mand = [s for s in p.shops if s.mandatory]
    for s in mand:
        if s.kw > cap:
            conflicts.append({
                "rule": "capacity",
                "shops": [s.id],
                "hours": _hours(hours),
                "detail": f"Mandatory shop {s.id} needs {s.kw} kW but the generator carries only {cap} kW",
            })
    mand_kw = sum(s.kw for s in mand)
    if mand and mand_kw > cap and not conflicts:
        conflicts.append({
            "rule": "capacity",
            "shops": [s.id for s in mand],
            "hours": _hours(hours),
            "detail": f"Mandatory shops together need {mand_kw} kW every outage hour but capacity is {cap} kW",
        })

    windows = _dark_windows(p)
    for s in p.shops:
        if not s.mandatory and s.kw > cap and windows:
            run = sorted({h for w in windows for h in w})
            conflicts.append({
                "rule": "max_consecutive_dark",
                "shops": [s.id],
                "hours": _hours(run),
                "detail": (
                    f"{s.id} needs {s.kw} kW > {cap} kW capacity so it is dark every outage hour, "
                    f"but the outage runs more than {p.max_dark} hours in a row"
                ),
            })
    if conflicts or static_only:
        return conflicts

    from .solver import min_fuel_without_budget, solve_best_effort  # exact checks need OR-Tools

    cheapest = min_fuel_without_budget(p, deadline)
    if cheapest is None:
        # Capacity cannot host the rotation the dark-run rule demands. Ask the
        # best-effort model which rule instances it had to drop.
        sol = solve_best_effort(p, deadline, enforce_budget=False)
        for v in sol.violations:
            conflicts.append({
                "rule": "max_consecutive_dark" if v["rule"] == "dark_run" else "mandatory",
                "shops": [v["shop"]],
                "hours": _hours(v["hours"]),
                "detail": (
                    f"With {cap} kW capacity, {v['shop']} cannot be given a powered hour in "
                    f"{', '.join(_hours(v['hours']))} without pushing a mandatory or other rotating shop over capacity"
                ),
            })
        if not conflicts:
            conflicts.append({
                "rule": "capacity",
                "shops": [s.id for s in p.shops],
                "hours": _hours(hours),
                "detail": "Capacity cannot host the mandatory shops plus the rotation required by the dark-run rule",
            })
        return conflicts

    if cheapest.fuel_cl > p.budget_cl:
        rotating = sorted({p.shops[si].id for (si, h), on in cheapest.on.items() if on and not p.shops[si].mandatory})
        per_hour = []
        for h in hours:
            load = sum(s.kw for i, s in enumerate(p.shops) if cheapest.on[i, h])
            per_hour.append(f"{HOUR_LABELS[h]} {load} kW={p.fuel_for_load(load) / 100:.2f} L")
        conflicts.append({
            "rule": "fuel_budget",
            "shops": [s.id for s in mand] + rotating,
            "hours": _hours(hours),
            "detail": (
                f"The cheapest roster that keeps mandatory shops on and no shop dark more than {p.max_dark} hours "
                f"in a row needs {cheapest.fuel_cl / 100:.2f} L but the budget is {p.budget_cl / 100:.2f} L "
                f"({'; '.join(per_hour)})"
            ),
        })
        return conflicts

    return [{
        "rule": "unknown",
        "shops": [],
        "hours": _hours(hours),
        "detail": "The solver could not find a roster within its time limit",
    }]

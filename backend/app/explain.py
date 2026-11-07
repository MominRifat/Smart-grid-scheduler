"""Why is each dark shop dark? (rule 8: "every dark entry has a real reason").

Each reason combines
  * the local fact for that hour (generator full, or the extra kW would lift the
    fuel level, or the shop is worth 0 then), and
  * a counterfactual: re-solve the whole day with that shop forced ON in that
    hour and report how much the best achievable value drops.
The counterfactual is what makes the reason honest - it is the real trade-off.
"""
from __future__ import annotations

import os
import time
from concurrent.futures import ThreadPoolExecutor

from .model import Solution
from .timebudget import Deadline
from .validate import HOUR_LABELS, Problem

COUNTERFACTUAL_DEADLINE = 4.0  # seconds for all counterfactuals together


def _l(cl: int) -> str:
    return f"{cl / 100:.2f} L"


def dark_run_at(problem: Problem, sol: Solution, si: int, slot: int) -> int:
    run = 0
    for h in range(slot + 1):
        if problem.grid[h] or sol.on.get((si, h), False):
            run = 0
        else:
            run += 1
    return run


def _counterfactual(problem: Problem, sol: Solution, si: int, h: int, deadline: Deadline) -> tuple[Solution | None, bool]:
    """Best roster for the whole day if this shop is forced ON in this hour.

    Stage 1 only maximises value (it can never beat the best day, so that bound is
    given to the solver). The diesel stage runs only when the value ties.
    """
    from .solver import RosterModel  # imported lazily so local reasons work without OR-Tools

    rm = RosterModel(problem)
    rm.fix(si, h, True)
    rm.hint(sol)
    rm.model.Add(rm.total_value <= sol.value)
    rm.model.Maximize(rm.total_value)
    alt = rm.solve(seconds=deadline.left() * 0.5)
    if alt is None:
        return None, rm.proven_infeasible
    if alt.value == sol.value and alt.optimal:
        rm2 = RosterModel(problem)
        rm2.fix(si, h, True)
        rm2.hint(alt)
        rm2.model.Add(rm2.total_value >= alt.value)
        rm2.model.Minimize(rm2.total_fuel)
        cheaper = rm2.solve(seconds=deadline.left() * 0.5)
        if cheaper is not None and cheaper.fuel_cl <= alt.fuel_cl:
            cheaper.optimal = cheaper.optimal and alt.optimal
            return cheaper, False
    return alt, False


def local_reason(problem: Problem, sol: Solution, si: int, h: int) -> str:
    shop = problem.shops[si]
    cap = problem.capacity_kw
    if shop.kw > cap:
        return f"Needs {shop.kw} kW but the generator carries at most {cap} kW, so it can only run on grid power"
    load = sum(s.kw for i, s in enumerate(problem.shops) if sol.on.get((i, h)))
    v = shop.values[h]
    if load + shop.kw > cap:
        return (
            f"Generator full: {load} kW on + {shop.kw} kW = {load + shop.kw} kW > {cap} kW capacity, "
            f"so it could only come on by switching off shops worth more than its {v}"
        )
    a, b = problem.fuel_for_load(load), problem.fuel_for_load(load + shop.kw)
    if b > a:
        return (
            f"Adding its {shop.kw} kW lifts the hour {load}→{load + shop.kw} kW and fuel {_l(a)}→{_l(b)} "
            f"(+{_l(b - a)}) to earn {v}; diesel left unspent today: {_l(problem.budget_cl - sol.fuel_cl)}"
        )
    if v == 0:
        return f"Worth 0 at {HOUR_LABELS[h]}, so powering it gains nothing"
    return f"Worth {v} at {HOUR_LABELS[h]} but does not fit the best plan"


def explain(problem: Problem, sol: Solution, deadline: Deadline | None = None) -> dict[tuple[int, int], str]:
    dark = [(si, h) for (si, h), on in sol.on.items() if not on]
    reasons = {cell: local_reason(problem, sol, *cell) for cell in dark}
    todo = [(si, h) for si, h in dark if problem.shops[si].kw <= problem.capacity_kw]
    if not todo:
        return _with_runs(problem, sol, reasons)

    deadline = deadline or Deadline(COUNTERFACTUAL_DEADLINE)
    pool = ThreadPoolExecutor(max_workers=min(8, (os.cpu_count() or 2)))
    futures = {cell: pool.submit(_counterfactual, problem, sol, *cell, deadline) for cell in todo}
    try:
        for cell, fut in futures.items():
            if time.monotonic() >= deadline.end and not fut.done():
                continue  # out of time: keep the local reason, don't wait at all
            try:
                alt, impossible = fut.result(timeout=max(deadline.end - time.monotonic(), 0.0))
            except Exception:  # out of time or solver error: keep the local reason (it has numbers)
                continue
            if alt is None:
                if impossible:
                    reasons[cell] += "; forcing it on here leaves no roster that keeps every rule"
                continue
            if not (alt.optimal and sol.optimal) or alt.value > sol.value:
                continue  # search was cut short: only state what we can prove
            loss = sol.value - alt.value
            if loss > 0:
                reasons[cell] += f"; forcing it on would cut the day's best value {sol.value}→{alt.value} (−{loss})"
            elif alt.fuel_cl > sol.fuel_cl:
                reasons[cell] += f"; forcing it on keeps value {sol.value} but burns {_l(alt.fuel_cl - sol.fuel_cl)} more diesel"
            else:
                reasons[cell] += f"; tie: another roster with the same value {alt.value} and diesel powers it here instead"
    finally:
        pool.shutdown(wait=False, cancel_futures=True)
    return _with_runs(problem, sol, reasons)


def _with_runs(problem: Problem, sol: Solution, reasons: dict) -> dict[tuple[int, int], str]:
    out = {}
    for (si, h), text in reasons.items():
        if problem.shops[si].mandatory:
            out[si, h] = text
            continue
        run = dark_run_at(problem, sol, si, h)
        out[si, h] = f"{text} (dark {run} of max {problem.max_dark} in a row)"
    return out


def local_only(problem: Problem, sol: Solution) -> dict[tuple[int, int], str]:
    """Reasons without re-solving (used for backup rosters): local fact with numbers + dark run."""
    reasons = {(si, h): local_reason(problem, sol, si, h) for (si, h), on in sol.on.items() if not on}
    return _with_runs(problem, sol, reasons)

"""Internal rule check run on EVERY roster before it leaves the API (rules 3-6).

If the main solver ever produced something illegal, roster.py would notice here
and fall back to the backup solver instead of returning it.
"""
from __future__ import annotations

from .model import Solution
from .validate import SLOTS, Problem


def rule_errors(problem: Problem, sol: Solution, *, best_effort: bool = False) -> list[str]:
    errors: list[str] = []
    hours = problem.outage_slots
    total = 0
    for h in hours:
        load = sum(s.kw for i, s in enumerate(problem.shops) if sol.on.get((i, h)))
        if load > problem.capacity_kw:
            errors.append(f"slot {h}: load {load} > capacity {problem.capacity_kw}")
            continue
        total += problem.fuel_for_load(load)
    if total > problem.budget_cl:
        errors.append(f"fuel {total} > budget {problem.budget_cl}")
    if best_effort:  # capacity and diesel are the only hard rules for a best-effort roster
        return errors
    for i, s in enumerate(problem.shops):
        run = 0
        for h in range(SLOTS):
            dark = not problem.grid[h] and not sol.on.get((i, h), False)
            if s.mandatory and dark:
                errors.append(f"slot {h}: mandatory {s.id} dark")
            run = run + 1 if dark else 0
            if not s.mandatory and run > problem.max_dark:
                errors.append(f"{s.id}: dark run {run} > {problem.max_dark}")
                break
    return errors


def value_of(problem: Problem, sol: Solution) -> int:
    return sum(s.values[h] for i, s in enumerate(problem.shops) for h in problem.outage_slots if sol.on.get((i, h)))


def fuel_of(problem: Problem, sol: Solution) -> int:
    return sum(
        problem.fuel_for_load(sum(s.kw for i, s in enumerate(problem.shops) if sol.on.get((i, h))))
        for h in problem.outage_slots
    )

"""THE DECISION LOGIC. Start reading here.

The whole day is solved as ONE exact optimisation (CP-SAT integer program),
not hour by hour, so diesel is never burned at noon that the evening needs.

Variables
  on[s, h]     1 if shop s is powered in outage hour h
  lvl[h, k]    1 if hour h is billed at fuel level k (k = 0 means "generator off")

Constraints (numbers = rules in the brief)
  3 capacity   sum(kw * on[., h]) <= capacity, shops bigger than capacity are fixed off
  4 fuel       exactly one level per hour; level k is chosen iff
               table[k-1].load_kw < load <= table[k].load_kw (k = 0 iff load = 0),
               so fuel is charged once per hour on the COMBINED load;
               sum of fuel over the day <= budget (all in hundredths of a litre)
  5 mandatory  on[s, h] = 1 for every mandatory shop
  6 dark runs  for every normal shop and every window of (max_dark + 1)
               consecutive outage hours (grid hours break windows): at least one on

Objective (lexicographic, two solves)
  1. maximise total value
  2. keeping that value, minimise total diesel                (tie-break)
Every request shares one Deadline so the API always answers within 10 s.
"""
from __future__ import annotations

from ortools.sat.python import cp_model

from .model import Solution
from .timebudget import Deadline
from .validate import SLOTS, Problem

SOLVE_SECONDS = 4.0


def dark_windows(problem: Problem) -> list[list[int]]:
    """All runs of (max_dark + 1) consecutive outage slots - a shop may not be dark in all of them."""
    w = problem.max_dark + 1
    out = []
    for start in range(SLOTS - w + 1):
        hours = list(range(start, start + w))
        if all(not problem.grid[h] for h in hours):
            out.append(hours)
    return out


class RosterModel:
    """Builds the CP-SAT model. `soft=True` turns rules 5 and 6 into penalties (best-effort mode)."""

    def __init__(self, problem: Problem, *, soft: bool = False, enforce_budget: bool = True):
        self.p = problem
        self.soft = soft
        m = self.model = cp_model.CpModel()
        hours = problem.outage_slots
        self.hours = hours
        cap = problem.capacity_kw
        table = problem.fuel_table

        self.on: dict[tuple[int, int], cp_model.IntVar] = {}
        for si, shop in enumerate(problem.shops):
            for h in hours:
                v = m.NewBoolVar(f"on_{si}_{h}")
                if shop.kw > cap:
                    m.Add(v == 0)  # rule 3: can never be on during an outage
                self.on[si, h] = v

        self.load: dict[int, cp_model.IntVar] = {}
        self.fuel: dict[int, cp_model.IntVar] = {}
        max_cl = max(l.centilitres for l in table)
        for h in hours:
            load = m.NewIntVar(0, cap, f"load_{h}")
            m.Add(load == sum(s.kw * self.on[si, h] for si, s in enumerate(problem.shops)))
            levels = [m.NewBoolVar(f"lvl_{h}_off")] + [m.NewBoolVar(f"lvl_{h}_{k}") for k in range(len(table))]
            m.AddExactlyOne(levels)
            # Exactly one level is 1, so these two linear rows pin load into
            # (previous level, chosen level]; written linearly (not as
            # implications) because that gives the solver a much tighter bound.
            bounds = [(0, 0)] + [
                ((table[k - 1].load_kw if k else 0) + 1, lv.load_kw) for k, lv in enumerate(table)
            ]
            m.Add(load >= sum(lo * z for (lo, _), z in zip(bounds, levels)))
            m.Add(load <= sum(hi * z for (_, hi), z in zip(bounds, levels)))
            fuel = m.NewIntVar(0, max_cl, f"fuel_{h}")
            m.Add(fuel == sum(lv.centilitres * levels[k + 1] for k, lv in enumerate(table)))
            self.load[h], self.fuel[h] = load, fuel

        self.total_fuel = sum(self.fuel.values()) if hours else 0
        if enforce_budget:
            m.Add(self.total_fuel <= problem.budget_cl)

        self.total_value = sum(
            s.values[h] * self.on[si, h] for si, s in enumerate(problem.shops) for h in hours
        )

        # Rules 5 and 6 - hard normally, penalised in best-effort mode.
        penalties = []
        self.soft_terms: list[tuple[cp_model.IntVar, dict]] = []
        for si, shop in enumerate(problem.shops):
            if shop.mandatory:
                for h in hours:
                    if soft:
                        miss = m.NewBoolVar(f"miss_{si}_{h}")
                        m.Add(self.on[si, h] == 0).OnlyEnforceIf(miss)
                        m.Add(self.on[si, h] == 1).OnlyEnforceIf(miss.Not())
                        penalties.append(1000 * miss)
                        self.soft_terms.append((miss, {"rule": "mandatory", "shop": shop.id, "hours": [h]}))
                    else:
                        m.Add(self.on[si, h] == 1)
            else:
                for win in dark_windows(problem):
                    lits = [self.on[si, h] for h in win]
                    if soft:
                        brk = m.NewBoolVar(f"brk_{si}_{win[0]}")
                        m.AddBoolOr(lits + [brk])
                        penalties.append(100 * brk)
                        self.soft_terms.append((brk, {"rule": "dark_run", "shop": shop.id, "hours": win}))
                    else:
                        m.AddBoolOr(lits)

        self.penalty = sum(penalties) if penalties else 0

    def fix(self, shop_index: int, slot: int, value: bool) -> None:
        self.model.Add(self.on[shop_index, slot] == int(value))

    def hint(self, sol: Solution) -> None:
        for key, var in self.on.items():
            self.model.AddHint(var, int(sol.on.get(key, False)))

    def solve(self, seconds: float = SOLVE_SECONDS) -> Solution | None:
        """Solve whatever objective is set. None = no roster found (see self.proven_infeasible)."""
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = max(0.05, seconds)
        # One worker + full LP linearisation: fastest on this model (~0.1 s for
        # twelve shops) and deterministic - same input, same roster.
        solver.parameters.num_workers = 1
        solver.parameters.linearization_level = 2
        solver.parameters.random_seed = 0
        status = solver.Solve(self.model)
        self.proven_infeasible = status == cp_model.INFEASIBLE
        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            return None
        on = {k: bool(solver.Value(v)) for k, v in self.on.items()}
        violations = [info for lit, info in self.soft_terms if solver.Value(lit)]
        return Solution(
            on=on,
            value=int(solver.Value(self.total_value)) if self.on else 0,
            fuel_cl=int(solver.Value(self.total_fuel)) if self.hours else 0,
            optimal=status == cp_model.OPTIMAL,
            violations=violations,
        )


def lexicographic(problem: Problem, deadline: Deadline, *, fix=None, hint=None, main_share: float = 0.75,
                  reserve: float = 0.0) -> tuple[Solution | None, bool]:
    """Stage 1: maximise value. Stage 2: same value, least diesel.

    Two small objectives instead of one value*BIG - fuel keeps every number far
    from integer overflow. Returns (solution, proven_infeasible).
    """
    rm = RosterModel(problem)
    if not rm.on:  # no outage hours or no shops: nothing to decide
        return Solution(on={}, value=0, fuel_cl=0, optimal=True), False
    for si, h, v in fix or []:
        rm.fix(si, h, v)
    if hint:
        rm.hint(hint)
    rm.model.Maximize(rm.total_value)
    first = rm.solve(seconds=deadline.left(reserve) * main_share)
    if first is None:
        return None, rm.proven_infeasible
    rm2 = RosterModel(problem)
    for si, h, v in fix or []:
        rm2.fix(si, h, v)
    rm2.model.Add(rm2.total_value >= first.value)
    rm2.hint(first)
    rm2.model.Minimize(rm2.total_fuel)
    second = rm2.solve(seconds=min(2.0, deadline.left(reserve) * 0.5))
    if second is None or second.fuel_cl > first.fuel_cl:
        return first, False
    second.optimal = first.optimal and second.optimal
    return second, False


def solve(problem: Problem, deadline: Deadline | None = None) -> tuple[Solution | None, bool]:
    """Best legal roster. Returns (solution, proven_infeasible)."""
    # value is what is judged: the main solve gets ~90% of the request budget
    return lexicographic(problem, deadline or Deadline(8.0), reserve=1.5, main_share=0.9)


def solve_best_effort(problem: Problem, deadline: Deadline | None = None, *, enforce_budget: bool = True) -> Solution:
    """Capacity and diesel stay hard (physics); mandatory/dark-run breaks are minimised, then value maximised."""
    deadline = deadline or Deadline(6.0)
    rm = RosterModel(problem, soft=True, enforce_budget=enforce_budget)
    if not rm.on:
        return Solution(on={}, value=0, fuel_cl=0, optimal=True)
    if not rm.soft_terms:  # nothing soft: plain best roster
        sol, _ = lexicographic(problem, deadline)
        if sol is not None:
            return sol
    rm.model.Minimize(rm.penalty)
    first = rm.solve(seconds=max(0.5, deadline.left() * 0.5))
    if first is None:  # out of time: all dark always respects capacity and diesel
        first = _all_dark(problem, rm)
    rm2 = RosterModel(problem, soft=True, enforce_budget=enforce_budget)
    rm2.model.Add(rm2.penalty <= sum(1000 if v["rule"] == "mandatory" else 100 for v in first.violations))
    rm2.hint(first)
    rm2.model.Maximize(rm2.total_value)
    second = rm2.solve(seconds=deadline.left() * 0.6)
    return second if second is not None and second.value >= first.value else first


def min_fuel_without_budget(problem: Problem, deadline: Deadline | None = None) -> Solution | None:
    """Cheapest roster that keeps rules 3, 5, 6 but ignores the diesel budget."""
    rm = RosterModel(problem, enforce_budget=False)
    rm.model.Minimize(rm.total_fuel)
    return rm.solve(seconds=(deadline or Deadline(4.0)).left() * 0.5)


def _all_dark(problem: Problem, rm: RosterModel) -> Solution:
    on = {k: False for k in rm.on}
    violations = [info for _, info in rm.soft_terms]
    return Solution(on=on, value=0, fuel_cl=0, optimal=False, violations=violations)

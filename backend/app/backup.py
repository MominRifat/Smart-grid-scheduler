"""BACKUP SOLVER - pure Python, no OR-Tools. Used when the main CP-SAT solver
is unavailable, crashes, times out, or cannot prove optimality.

Same rules, different method (heuristic, so not guaranteed optimal):
  1. Rotation:   start with mandatory shops on; walk each normal shop through the
                 day and, whenever it would go dark too long, switch it on in the
                 hour of that window where it costs the least extra diesel.
  2. Greedy add: repeatedly power the (shop, hour) with the best value per extra
                 litre that still fits capacity and the remaining diesel.
  3. Improve:    local search (swap two shops in an hour, move a shop between
                 hours, drop-and-refill) until no move helps or time runs out.
Every move is checked against all rules, so the result is always legal.
"""
from __future__ import annotations

import random
import time

from .check import rule_errors
from .model import Solution
from .validate import SLOTS, Problem


class _State:
    def __init__(self, p: Problem):
        self.p = p
        self.hours = p.outage_slots
        self.on = {(i, h): False for i in range(len(p.shops)) for h in self.hours}
        self.load = {h: 0 for h in self.hours}

    def set(self, i: int, h: int, v: bool) -> None:
        if self.on[i, h] != v:
            self.on[i, h] = v
            self.load[h] += self.p.shops[i].kw if v else -self.p.shops[i].kw

    def fuel(self) -> int:
        return sum(self.p.fuel_for_load(self.load[h]) for h in self.hours)

    def value(self) -> int:
        return sum(self.p.shops[i].values[h] for (i, h), v in self.on.items() if v)

    def fits(self, h: int, extra: int) -> bool:
        return self.load[h] + extra <= self.p.capacity_kw

    def delta_fuel(self, h: int, extra: int) -> int:
        return self.p.fuel_for_load(self.load[h] + extra) - self.p.fuel_for_load(self.load[h])

    def dark_ok(self, i: int) -> bool:
        if self.p.shops[i].mandatory:
            return all(self.on[i, h] for h in self.hours)
        run = 0
        for h in range(SLOTS):
            run = run + 1 if (not self.p.grid[h] and not self.on[i, h]) else 0
            if run > self.p.max_dark:
                return False
        return True

    def solution(self) -> Solution:
        return Solution(on=dict(self.on), value=self.value(), fuel_cl=self.fuel(), optimal=False, solver="backup")


def _rotation(st: _State, order: list[int]) -> bool:
    p = st.p
    for i, s in enumerate(p.shops):
        if s.mandatory:
            for h in st.hours:
                st.set(i, h, True)
    if any(l > p.capacity_kw for l in st.load.values()):
        return False
    for i in order:
        s = p.shops[i]
        if s.mandatory:
            continue
        run_hours: list[int] = []
        for h in range(SLOTS):
            if p.grid[h] or st.on[i, h]:
                run_hours = []
                continue
            run_hours.append(h)
            if len(run_hours) > p.max_dark:
                # must be on somewhere in the last (max_dark + 1) dark hours; pick the cheapest that fits
                window = run_hours[-(p.max_dark + 1):]
                options = [x for x in window if st.fits(x, s.kw)]
                if not options:
                    return False
                best = min(options, key=lambda x: (st.delta_fuel(x, s.kw), -s.values[x], -x))
                st.set(i, best, True)
                run_hours = [x for x in run_hours if x > best]
    return True


def _reduce_fuel(st: _State, deadline: float) -> None:
    """Drop or move rotation hours while that strictly lowers diesel and keeps every rule."""
    p = st.p
    improved = True
    while improved and time.monotonic() < deadline:
        improved = False
        f0 = st.fuel()
        for a, s in enumerate(p.shops):
            if s.mandatory:
                continue
            for h in st.hours:
                if not st.on[a, h]:
                    continue
                st.set(a, h, False)
                if st.dark_ok(a) and st.fuel() < f0:
                    improved = True
                    break
                for g in st.hours:
                    if g == h or st.on[a, g] or not st.fits(g, s.kw):
                        continue
                    st.set(a, g, True)
                    if st.dark_ok(a) and st.fuel() < f0:
                        improved = True
                        break
                    st.set(a, g, False)
                if improved:
                    break
                st.set(a, h, True)
            if improved:
                break


def _greedy_add(st: _State, deadline: float) -> None:
    p = st.p
    budget_left = p.budget_cl - st.fuel()
    while time.monotonic() < deadline:
        best, best_score = None, None
        for (i, h), v in st.on.items():
            s = p.shops[i]
            if v or s.values[h] <= 0 or not st.fits(h, s.kw):
                continue
            df = st.delta_fuel(h, s.kw)
            if df > budget_left:
                continue
            score = (1 if df == 0 else 0, s.values[h] / max(df, 1), s.values[h])
            if best_score is None or score > best_score:
                best, best_score = (i, h, df), score
        if best is None:
            return
        i, h, df = best
        st.set(i, h, True)
        budget_left -= df


def _improve(st: _State, deadline: float) -> None:
    p = st.p
    n = len(p.shops)

    def better(v0: int, f0: int) -> bool:
        v1, f1 = st.value(), st.fuel()
        return f1 <= p.budget_cl and (v1 > v0 or (v1 == v0 and f1 < f0))

    improved = True
    while improved and time.monotonic() < deadline:
        improved = False
        v0, f0 = st.value(), st.fuel()
        for h in st.hours:
            for a in range(n):  # swap: a off, b on in the same hour
                if not st.on[a, h] or p.shops[a].mandatory:
                    continue
                for b in range(n):
                    if st.on[b, h] or p.shops[b].kw > p.capacity_kw:
                        continue
                    st.set(a, h, False)
                    st.set(b, h, True)
                    if st.load[h] <= p.capacity_kw and st.dark_ok(a) and better(v0, f0):
                        improved = True
                        break
                    st.set(b, h, False)
                    st.set(a, h, True)
                if improved or time.monotonic() > deadline:
                    break
            if improved or time.monotonic() > deadline:
                break
        if improved:
            continue
        for a in range(n):  # move: shop a from hour h to hour g
            if p.shops[a].mandatory:
                continue
            for h in st.hours:
                if not st.on[a, h]:
                    continue
                for g in st.hours:
                    if g == h or st.on[a, g] or not st.fits(g, p.shops[a].kw):
                        continue
                    st.set(a, h, False)
                    st.set(a, g, True)
                    if st.dark_ok(a) and better(v0, f0):
                        improved = True
                        break
                    st.set(a, g, False)
                    st.set(a, h, True)
                if improved:
                    break
            if improved or time.monotonic() > deadline:
                break
        if improved:
            continue
        for a in range(n):  # drop-and-refill: free diesel, let greedy spend it better
            if p.shops[a].mandatory:
                continue
            for h in st.hours:
                if not st.on[a, h]:
                    continue
                snapshot = dict(st.on), dict(st.load)
                st.set(a, h, False)
                if st.dark_ok(a):
                    _greedy_add(st, deadline)
                    if better(v0, f0):
                        improved = True
                        break
                st.on, st.load = dict(snapshot[0]), dict(snapshot[1])
            if improved or time.monotonic() > deadline:
                break


def solve_backup(problem: Problem, seconds: float = 1.5) -> Solution | None:
    """Best legal roster found without OR-Tools within `seconds`, or None if none found."""
    deadline = time.monotonic() + seconds
    if not problem.outage_slots or not problem.shops:
        return Solution(on={}, value=0, fuel_cl=0, optimal=True, solver="backup")
    n = len(problem.shops)
    orders = [
        sorted(range(n), key=lambda i: -problem.shops[i].kw),
        sorted(range(n), key=lambda i: problem.shops[i].kw),
        sorted(range(n), key=lambda i: sum(problem.shops[i].values)),
        sorted(range(n), key=lambda i: -sum(problem.shops[i].values)),
    ]
    rnd = random.Random(0)  # deterministic restarts
    best: Solution | None = None
    attempt = 0
    while time.monotonic() < deadline and attempt < 200:
        if attempt < len(orders):
            order = orders[attempt]
        else:
            order = list(range(n))
            rnd.shuffle(order)
        attempt += 1
        st = _State(problem)
        if not _rotation(st, order):
            if attempt >= len(orders) and best is None and attempt > 12:
                break
            continue
        _reduce_fuel(st, deadline)
        if st.fuel() > problem.budget_cl:
            continue
        _greedy_add(st, deadline)
        _improve(st, min(deadline, time.monotonic() + seconds / 4))
        sol = st.solution()
        if rule_errors(problem, sol):
            continue
        if best is None or (sol.value, -sol.fuel_cl) > (best.value, -best.fuel_cl):
            best = sol
    return best

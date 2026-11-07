"""Correctness and optimality of the roster."""
import copy
import itertools
import random

import pytest

from app.roster import run
from validate_output import check


def solve_ok(inp):
    status, out = run(inp)
    assert status == 200, out
    assert out["status"] == "ok", out
    assert check(inp, out) == [], check(inp, out)
    return out


def test_worked_example_matches_brief(worked):
    out = solve_ok(worked)
    assert out["value_total"] == 84
    assert out["fuel_total_litres"] == 8.0
    assert [r["hour"] for r in out["roster"]] == ["12:00", "13:00", "14:00", "17:00", "18:00", "19:00"]
    assert out["dark_hours"]["pharmacy"] == 0
    assert "tea_stall" in out["roster"][0]["powered"]  # never cut, nearly free


def test_sample_is_optimal_and_legal(sample):
    out = solve_ok(sample)
    assert out["value_total"] == 186
    assert out["fuel_total_litres"] <= 17.0
    assert out["optimal"] is True


@pytest.mark.parametrize("slot", [1, 6])
def test_minute_150_extension_is_infeasible_on_diesel(sample, slot):
    """Either afternoon extension needs 17.60 L minimum against a 17.00 L budget."""
    sample["grid_available"][slot] = False
    status, out = run(sample)
    assert status == 200 and out["status"] == "infeasible"
    assert out["conflicts"][0]["rule"] == "fuel_budget"
    assert "17.60 L" in out["conflicts"][0]["detail"]
    best = out["best_effort"]
    assert best["fuel_total_litres"] <= 17.0
    assert best["violations"] and all(v["rule"] == "dark_run" for v in best["violations"])
    assert all(r["load_kw"] <= 20 for r in best["roster"])


def test_every_dark_cell_has_reason_with_numbers(sample):
    out = solve_ok(sample)
    for r in out["roster"]:
        for d in r["dark"]:
            assert any(ch.isdigit() for ch in d["reason"]), d


def test_deterministic(sample):
    a = solve_ok(sample)
    b = solve_ok(copy.deepcopy(sample))
    assert a["roster"] == b["roster"]


def test_no_outage_day_is_empty(worked):
    worked["grid_available"] = [True] * 10
    out = solve_ok(worked)
    assert out["roster"] == [] and out["value_total"] == 0 and out["fuel_total_litres"] == 0


def test_empty_shop_list(worked):
    worked["shops"] = []
    out = solve_ok(worked)
    assert out["value_total"] == 0 and out["fuel_total_litres"] == 0
    assert all(r["powered"] == [] and r["load_kw"] == 0 for r in out["roster"])


def test_zero_load_hour_costs_nothing(worked):
    # only normal shops, all worth 0 -> generator stays off -> zero fuel
    for s in worked["shops"]:
        s["type"] = "normal"
        s["value_per_slot"] = [0] * 10
    worked["max_consecutive_dark"] = 10
    out = solve_ok(worked)
    assert out["fuel_total_litres"] == 0


def test_max_dark_zero_forces_everyone_on(worked):
    worked["max_consecutive_dark"] = 0
    worked["generator_capacity_kw"] = 13
    worked["fuel_table"][-1]["load_kw"] = 13
    worked["fuel_budget_litres"] = 9.6
    out = solve_ok(worked)
    assert all(not r["dark"] for r in out["roster"])


def test_fuel_charged_once_on_combined_load(worked):
    out = solve_ok(worked)
    table = [(t["load_kw"], t["litres_per_hour"]) for t in worked["fuel_table"]]
    kw = {s["id"]: s["kw"] for s in worked["shops"]}
    for r in out["roster"]:
        load = sum(kw[i] for i in r["powered"])
        assert r["load_kw"] == load
        expected = 0 if load == 0 else next(l for k, l in table if k >= load)
        assert r["fuel_litres"] == expected  # one lookup on the combined load, never per shop


@pytest.fixture
def oversized(worked):
    worked["grid_available"] = [True, True, False, False, True, True, True, False, False, True]
    worked["shops"].append({"id": "cold_store", "kw": 11, "type": "normal", "value_per_slot": [9] * 10})
    return worked


def test_oversized_shop_dark_with_capacity_reason(oversized):
    out = solve_ok(oversized)
    for r in out["roster"]:
        d = {x["id"]: x["reason"] for x in r["dark"]}
        assert "11 kW" in d["cold_store"] and "10 kW" in d["cold_store"]


# ---------- exhaustive cross-check: the solver must equal brute force ----------

def brute_force(inp):
    grid, shops = inp["grid_available"], inp["shops"]
    outs = [h for h in range(10) if not grid[h]]
    cap, budget = inp["generator_capacity_kw"], round(inp["fuel_budget_litres"] * 100)
    table = [(t["load_kw"], round(t["litres_per_hour"] * 100)) for t in inp["fuel_table"]]

    def fuel(load):
        return 0 if load == 0 else next(cl for kw, cl in table if kw >= load)

    subsets = list(itertools.product([0, 1], repeat=len(shops)))
    best = None
    for choice in itertools.product(subsets, repeat=len(outs)):
        ok, cl, val = True, 0, 0
        for sub, h in zip(choice, outs):
            load = sum(s["kw"] for s, b in zip(shops, sub) if b)
            if load > cap or any(s["type"] == "mandatory" and not b for s, b in zip(shops, sub)):
                ok = False
                break
            cl += fuel(load)
            val += sum(s["value_per_slot"][h] for s, b in zip(shops, sub) if b)
        if not ok or cl > budget:
            continue
        on = {(i, h): sub[i] for sub, h in zip(choice, outs) for i in range(len(shops))}
        for i, s in enumerate(shops):
            run_ = 0
            for h in range(10):
                run_ = run_ + 1 if (not grid[h] and not on[i, h]) else 0
                if s["type"] == "normal" and run_ > inp["max_consecutive_dark"]:
                    ok = False
        if ok and (best is None or val > best):
            best = val
    return best


def random_instance(rng):
    n = rng.randint(1, 3)
    cap = rng.randint(4, 9)
    levels = sorted(rng.sample(range(1, cap), k=min(2, cap - 1))) + [cap]
    litres = sorted(round(rng.uniform(0.3, 2.0), 2) for _ in levels)
    grid = [True] * 10
    for h in rng.sample(range(10), k=rng.randint(1, 4)):
        grid[h] = False
    return {
        "grid_available": grid,
        "generator_capacity_kw": cap,
        "fuel_budget_litres": round(rng.uniform(0, 6), 2),
        "fuel_table": [{"load_kw": k, "litres_per_hour": l} for k, l in zip(levels, litres)],
        "max_consecutive_dark": rng.randint(0, 2),
        "shops": [
            {
                "id": f"s{i}",
                "kw": rng.randint(1, cap + 1),
                "type": "mandatory" if rng.random() < 0.2 else "normal",
                "value_per_slot": [rng.randint(0, 9) for _ in range(10)],
            }
            for i in range(n)
        ],
    }


@pytest.mark.parametrize("seed", range(60))
def test_matches_brute_force(seed):
    inp = random_instance(random.Random(seed))
    expected = brute_force(inp)
    status, out = run(inp)
    assert status == 200
    if expected is None:
        assert out["status"] == "infeasible", out
        assert out["conflicts"]
        errs = check(inp, {**out["best_effort"], "status": "ok"})
        # best effort never breaks the physical rules: capacity and diesel
        assert not [e for e in errs if "capacity" in e or "budget" in e], errs
    else:
        assert out["status"] == "ok", out
        assert check(inp, out) == []
        assert out["value_total"] == expected

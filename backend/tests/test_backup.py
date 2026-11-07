"""The backup solver and the fallback chain: the API must keep answering correctly
even if the main CP-SAT engine is missing, crashes, returns garbage or runs out of time."""
import copy
import random
import time
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient

import app.roster as roster
from app.backup import solve_backup
from app.main import app
from app.model import Solution
from app.validate import parse_problem
from validate_output import check

from .test_solver import random_instance


def hard_instance(seed: int) -> dict:
    """Twelve shops, rich fuel table, almost every hour an outage."""
    r = random.Random(seed)
    cap = r.randint(10, 40)
    levels = sorted(r.sample(range(1, cap), k=min(r.randint(1, 8) - 1, cap - 1))) + [cap]
    litres = sorted(round(r.uniform(0.2, 4), 2) for _ in levels)
    return {
        "grid_available": [r.random() < 0.15 for _ in range(10)],
        "generator_capacity_kw": cap,
        "fuel_budget_litres": round(r.uniform(5, 30), 2),
        "fuel_table": [{"load_kw": k, "litres_per_hour": l} for k, l in zip(levels, litres)],
        "max_consecutive_dark": r.choice([1, 2, 2, 3]),
        "shops": [
            {"id": f"s{i}", "kw": r.randint(1, 9), "type": "mandatory" if i < r.randint(0, 2) else "normal",
             "value_per_slot": [r.randint(0, 20) for _ in range(10)]}
            for i in range(12)
        ],
    }


# ---------- backup solver on its own ----------

@pytest.mark.parametrize("seed", range(40))
def test_backup_is_always_legal(seed):
    inp = random_instance(random.Random(seed)) if seed % 2 else hard_instance(seed)
    sol = solve_backup(parse_problem(inp), seconds=1.0)
    if sol is None:
        return  # backup may give up; the chain then reports infeasible/unknown
    out = roster._roster_json(parse_problem(inp), sol, {k: "backup reason 123" for k, v in sol.on.items() if not v})
    assert check(inp, {**out, "status": "ok"}) == []


def test_backup_close_to_optimal_on_public_inputs(sample, worked):
    assert solve_backup(parse_problem(sample)).value >= 0.95 * 186
    assert solve_backup(parse_problem(worked)).value >= 0.95 * 84


def test_backup_is_deterministic(sample):
    a = solve_backup(parse_problem(sample))
    b = solve_backup(parse_problem(copy.deepcopy(sample)))
    assert a.value == b.value


# ---------- fallback chain through the API ----------

def test_api_works_without_ortools(monkeypatch, sample):
    monkeypatch.setattr(roster, "CPSAT_AVAILABLE", False)
    status, out = roster.run(sample)
    assert status == 200 and out["status"] == "ok" and out["solver"] == "backup"
    assert check(sample, out) == []
    assert all(d["reason"] for r in out["roster"] for d in r["dark"])


def test_api_survives_solver_crash(monkeypatch, sample):
    def boom(*a, **k):
        raise RuntimeError("solver exploded")
    monkeypatch.setattr(roster, "solve", boom)
    status, out = roster.run(sample)
    assert status == 200 and out["status"] == "ok" and out["solver"] == "backup"
    assert check(sample, out) == []


def test_illegal_main_result_is_never_returned(monkeypatch, sample):
    p = parse_problem(sample)
    everyone_on = Solution(on={(i, h): True for i in range(len(p.shops)) for h in p.outage_slots},
                           value=10**6, fuel_cl=0, optimal=True)
    monkeypatch.setattr(roster, "solve", lambda *a, **k: (everyone_on, False))
    status, out = roster.run(sample)
    assert out["status"] == "ok" and out["solver"] == "backup"
    assert check(sample, out) == []


def test_main_timeout_without_answer_uses_backup(monkeypatch, sample):
    monkeypatch.setattr(roster, "solve", lambda *a, **k: (None, False))
    status, out = roster.run(sample)
    assert out["status"] == "ok" and out["solver"] == "backup"


def test_infeasible_still_reported_without_ortools(monkeypatch, worked):
    monkeypatch.setattr(roster, "CPSAT_AVAILABLE", False)
    worked["shops"][0]["kw"] = 11  # mandatory bigger than generator
    status, out = roster.run(worked)
    assert status == 200 and out["status"] == "infeasible"
    assert out["conflicts"][0]["rule"] == "capacity"
    assert all(r["load_kw"] <= 10 for r in out["best_effort"]["roster"])


# ---------- limits ----------

client = TestClient(app)


@pytest.mark.parametrize("seed", [26, 3, 5])
def test_hardest_known_inputs_answer_within_10_seconds(seed):
    inp = hard_instance(seed)
    t = time.monotonic()
    r = client.post("/api/roster", json=inp)
    assert time.monotonic() - t < 10
    assert r.status_code == 200
    if r.json()["status"] == "ok":
        assert check(inp, r.json()) == []


def test_parallel_requests_all_fast(sample):
    def call(_):
        t = time.monotonic()
        r = client.post("/api/roster", json=sample)
        return r.status_code, time.monotonic() - t
    with ThreadPoolExecutor(4) as pool:
        results = list(pool.map(call, range(4)))
    assert all(code == 200 and dt < 10 for code, dt in results)


def test_huge_but_allowed_numbers(worked):
    worked["fuel_budget_litres"] = 99999999.99
    worked["fuel_table"][-1]["litres_per_hour"] = 99999999.99
    for s in worked["shops"]:
        s["value_per_slot"] = [10**12] * 10
    status, out = roster.run(worked)
    assert status == 200 and out["status"] == "ok"


def test_absurd_numbers_rejected_not_crashing(worked):
    worked["shops"][0]["value_per_slot"][0] = 10**13
    status, out = roster.run(worked)
    assert status == 400 and out["field"] == "shops[0].value_per_slot[0]"


def test_trailing_slash_and_wrong_method():
    assert client.post("/api/roster/", json={}).status_code == 400
    assert client.get("/api/roster").status_code == 405


def test_mandatory_bigger_than_generator_but_no_outage(worked):
    worked["grid_available"] = [True] * 10
    worked["shops"][0]["kw"] = 99
    assert roster.run(worked)[1]["status"] == "ok"

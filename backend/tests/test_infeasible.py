"""Rule 5: valid input whose rules cannot all be met -> status infeasible (HTTP 200)."""
from app.roster import run
from app.solver import min_fuel_without_budget
from app.validate import parse_problem


def infeasible(inp):
    status, out = run(inp)
    assert status == 200
    assert out["status"] == "infeasible", out
    assert out["conflicts"] and out["message"]
    be = out["best_effort"]
    assert "BEST EFFORT" in be["label"]
    for r in be["roster"]:
        assert r["load_kw"] <= inp["generator_capacity_kw"]
    assert be["fuel_total_litres"] <= inp["fuel_budget_litres"]
    return out


def test_mandatory_bigger_than_generator(worked):
    worked["shops"][0]["kw"] = 11
    out = infeasible(worked)
    c = out["conflicts"][0]
    assert c["rule"] == "capacity" and c["shops"] == ["pharmacy"]


def test_mandatory_shops_sum_over_capacity(worked):
    worked["shops"][1]["type"] = "mandatory"
    worked["shops"][2]["type"] = "mandatory"
    worked["shops"][2]["kw"] = 4  # 3 + 4 + 4 = 11 > 10
    out = infeasible(worked)
    assert out["conflicts"][0]["rule"] == "capacity"
    assert set(out["conflicts"][0]["shops"]) == {"pharmacy", "tailor", "mobile"}


def test_zero_budget_with_mandatory(worked):
    worked["fuel_budget_litres"] = 0
    out = infeasible(worked)
    assert out["conflicts"][0]["rule"] == "fuel_budget"
    assert "needs" in out["conflicts"][0]["detail"]


def test_budget_one_hundredth_short(worked):
    """Exactly the minimum diesel is ok; one hundredth of a litre less is infeasible."""
    worked_min = min_fuel_without_budget(parse_problem(worked)).fuel_cl
    assert run({**worked, "fuel_budget_litres": worked_min / 100})[1]["status"] == "ok"
    out = infeasible({**worked, "fuel_budget_litres": (worked_min - 1) / 100})
    assert out["conflicts"][0]["rule"] == "fuel_budget"


def test_oversized_normal_shop_in_long_outage(worked):
    worked["shops"].append({"id": "cold_store", "kw": 11, "type": "normal", "value_per_slot": [9] * 10})
    out = infeasible(worked)
    c = out["conflicts"][0]
    assert c["rule"] == "max_consecutive_dark" and c["shops"] == ["cold_store"]


def test_rotation_cannot_fit_capacity(worked):
    worked["max_consecutive_dark"] = 0  # every normal shop on every outage hour: 13 kW > 10
    worked["fuel_budget_litres"] = 100
    out = infeasible(worked)
    assert out["conflicts"][0]["rule"] in ("max_consecutive_dark", "capacity")
    assert out["best_effort"]["violations"]

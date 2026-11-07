"""Rule 9: anything off-format is invalid_input (HTTP 400) naming the field."""
import copy

import pytest

from app.roster import run, run_text


def mutate(base, path, value):
    inp = copy.deepcopy(base)
    obj = inp
    for key in path[:-1]:
        obj = obj[key]
    if value is DELETE:
        del obj[path[-1]]
    else:
        obj[path[-1]] = value
    return inp


DELETE = object()

CASES = [
    (("grid_available",), DELETE, "grid_available"),
    (("grid_available",), [True] * 9, "grid_available"),
    (("grid_available",), [True] * 11, "grid_available"),
    (("grid_available",), [1, 1, 0, 0, 0, 1, 1, 0, 0, 0], "grid_available[0]"),
    (("grid_available",), "true", "grid_available"),
    (("generator_capacity_kw",), DELETE, "generator_capacity_kw"),
    (("generator_capacity_kw",), -10, "generator_capacity_kw"),
    (("generator_capacity_kw",), 10.5, "generator_capacity_kw"),
    (("generator_capacity_kw",), "10", "generator_capacity_kw"),
    (("generator_capacity_kw",), True, "generator_capacity_kw"),
    (("fuel_budget_litres",), DELETE, "fuel_budget_litres"),
    (("fuel_budget_litres",), -1, "fuel_budget_litres"),
    (("fuel_budget_litres",), 8.001, "fuel_budget_litres"),
    (("fuel_budget_litres",), None, "fuel_budget_litres"),
    (("fuel_table",), [], "fuel_table"),
    (("fuel_table",), DELETE, "fuel_table"),
    (("fuel_table", 0, "litres_per_hour"), 0.805, "fuel_table[0].litres_per_hour"),
    (("fuel_table", 0, "litres_per_hour"), -0.8, "fuel_table[0].litres_per_hour"),
    (("fuel_table", 1, "load_kw"), 4, "fuel_table[1].load_kw"),  # not increasing
    (("fuel_table", 1, "load_kw"), 3, "fuel_table[1].load_kw"),  # decreasing
    (("fuel_table", 2, "load_kw"), 9, "fuel_table"),  # last != capacity
    (("fuel_table", 0, "load_kw"), 0, "fuel_table[0].load_kw"),
    (("max_consecutive_dark",), -1, "max_consecutive_dark"),
    (("max_consecutive_dark",), 1.5, "max_consecutive_dark"),
    (("max_consecutive_dark",), DELETE, "max_consecutive_dark"),
    (("shops",), DELETE, "shops"),
    (("shops",), {}, "shops"),
    (("shops", 1, "id"), "pharmacy", "shops[1].id"),  # duplicate
    (("shops", 1, "id"), "   ", "shops[1].id"),
    (("shops", 1, "id"), 7, "shops[1].id"),
    (("shops", 1, "kw"), 0, "shops[1].kw"),
    (("shops", 1, "kw"), 2.5, "shops[1].kw"),
    (("shops", 1, "kw"), -4, "shops[1].kw"),
    (("shops", 1, "type"), "vip", "shops[1].type"),
    (("shops", 1, "value_per_slot"), [1] * 9, "shops[1].value_per_slot"),
    (("shops", 1, "value_per_slot"), [1] * 9 + [-1], "shops[1].value_per_slot[9]"),
    (("shops", 1, "value_per_slot"), [1] * 9 + [1.5], "shops[1].value_per_slot[9]"),
    (("shops", 1, "value_per_slot"), DELETE, "shops[1].value_per_slot"),
]


@pytest.mark.parametrize("path,value,field", CASES)
def test_invalid(worked, path, value, field):
    status, out = run(mutate(worked, path, value))
    assert status == 400
    assert out["status"] == "invalid_input"
    assert out["field"] == field
    assert field in out["message"]


def test_dropping_a_fuel_level_is_still_valid(worked):
    status, out = run(mutate(worked, ("fuel_table", 0), DELETE))
    assert status == 200


def test_too_many_shops(sample):
    sample["shops"].append({"id": "x13", "kw": 1, "type": "normal", "value_per_slot": [0] * 10})
    status, out = run(sample)
    assert status == 400 and out["field"] == "shops"


def test_root_must_be_object():
    assert run([1, 2])[0] == 400


def test_body_not_json():
    status, out = run_text(b"{not json")
    assert status == 400 and out["status"] == "invalid_input"


def test_whole_number_floats_and_extra_fields_accepted(worked):
    worked["generator_capacity_kw"] = 10.0
    worked["_comment"] = "ignored"
    assert run(worked)[0] == 200


def test_two_decimal_text_is_exact():
    # 8.10 has two decimals even though binary float 8.1 is inexact
    status, _ = run_text(b'{"grid_available":[true,true,true,true,true,true,true,true,true,true],'
                         b'"generator_capacity_kw":5,"fuel_budget_litres":8.10,'
                         b'"fuel_table":[{"load_kw":5,"litres_per_hour":0.70}],'
                         b'"max_consecutive_dark":2,"shops":[]}')
    assert status == 200

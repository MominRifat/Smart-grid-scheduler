#!/usr/bin/env python3
"""Independent rule checker: does an output JSON obey every rule for its input?

Deliberately shares NO code with the solver, so a solver bug cannot hide here.

    python scripts/validate_output.py input.json output.json
"""
from __future__ import annotations

import json
import sys
from decimal import Decimal

HOURS = [f"{10 + i:02d}:00" for i in range(10)]


def check(inp: dict, out: dict) -> list[str]:
    errors: list[str] = []
    if out.get("status") != "ok":
        return [f"status is {out.get('status')!r}, nothing to check"] if out.get("status") not in ("infeasible",) else []

    grid = inp["grid_available"]
    cap = inp["generator_capacity_kw"]
    budget = round(Decimal(str(inp["fuel_budget_litres"])) * 100)
    table = [(t["load_kw"], round(Decimal(str(t["litres_per_hour"])) * 100)) for t in inp["fuel_table"]]
    shops = {s["id"]: s for s in inp["shops"]}
    ids = set(shops)
    outages = [h for h in range(10) if not grid[h]]

    def fuel(load: int) -> int:
        if load == 0:
            return 0
        for kw, cl in table:
            if kw >= load:
                return cl
        raise ValueError("over capacity")

    roster = out.get("roster", [])
    slots = [r.get("slot", HOURS.index(r["hour"]) if r.get("hour") in HOURS else None) for r in roster]
    if sorted(slots) != outages:
        errors.append(f"roster hours {slots} != outage hours {outages}")

    on: dict[tuple[str, int], bool] = {}
    total_cl = 0
    total_value = 0
    for r, h in zip(roster, slots):
        powered = r["powered"]
        dark = [d["id"] for d in r["dark"]]
        if len(set(powered)) != len(powered) or len(set(dark)) != len(dark):
            errors.append(f"{HOURS[h]}: repeated id")
        if set(powered) & set(dark):
            errors.append(f"{HOURS[h]}: overlap {set(powered) & set(dark)}")
        if set(powered) | set(dark) != ids:
            errors.append(f"{HOURS[h]}: powered+dark != all shop ids")
        for d in r["dark"]:
            if not isinstance(d.get("reason"), str) or len(d["reason"].strip()) < 10:
                errors.append(f"{HOURS[h]}: {d['id']} has no real reason")
        load = sum(shops[i]["kw"] for i in powered if i in shops)
        if load > cap:
            errors.append(f"{HOURS[h]}: load {load} kW > capacity {cap} kW")
            continue
        total_cl += fuel(load)
        total_value += sum(shops[i]["value_per_slot"][h] for i in powered if i in shops)
        for i in ids:
            on[i, h] = i in powered
        for s in inp["shops"]:
            if s["type"] == "mandatory" and s["id"] not in powered:
                errors.append(f"{HOURS[h]}: mandatory {s['id']} is dark")

    if total_cl > budget:
        errors.append(f"fuel {total_cl / 100:.2f} L > budget {budget / 100:.2f} L")
    if round(Decimal(str(out["fuel_total_litres"])) * 100) != total_cl:
        errors.append(f"fuel_total_litres {out['fuel_total_litres']} != recomputed {total_cl / 100:.2f}")
    if out["value_total"] != total_value:
        errors.append(f"value_total {out['value_total']} != recomputed {total_value}")

    for s in inp["shops"]:
        run = longest = count = 0
        for h in range(10):
            if not grid[h] and not on.get((s["id"], h), False):
                run += 1
                count += 1
                longest = max(longest, run)
            else:
                run = 0
        if s["type"] == "normal" and longest > inp["max_consecutive_dark"]:
            errors.append(f"{s['id']}: dark {longest} hours in a row > {inp['max_consecutive_dark']}")
        if out["dark_hours"].get(s["id"]) != count:
            errors.append(f"dark_hours[{s['id']}] = {out['dark_hours'].get(s['id'])} != {count}")
    return errors


def main() -> int:
    inp = json.load(open(sys.argv[1]))
    out = json.load(open(sys.argv[2]))
    errors = check(inp, out)
    for e in errors:
        print("FAIL", e)
    if not errors:
        print(f"OK  status={out['status']} value={out.get('value_total')} fuel={out.get('fuel_total_litres')}")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())

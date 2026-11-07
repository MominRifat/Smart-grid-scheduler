#!/usr/bin/env python3
"""v0 - the "obvious start" from the brief: hour by hour, mandatory first, then the
most valuable shops that still fit capacity and the diesel left. Kept only as evidence.

    python greedy_v0.py input.json > output_v0.json
"""
import json
import sys

inp = json.load(open(sys.argv[1]))
shops = inp["shops"]
cap = inp["generator_capacity_kw"]
left = round(inp["fuel_budget_litres"] * 100)
table = [(t["load_kw"], round(t["litres_per_hour"] * 100)) for t in inp["fuel_table"]]


def fuel(load):
    return 0 if load == 0 else next(cl for kw, cl in table if kw >= load)


roster, total_cl, total_v = [], 0, 0
for h, grid in enumerate(inp["grid_available"]):
    if grid:
        continue
    on = [s for s in shops if s["type"] == "mandatory"]
    for s in sorted((s for s in shops if s["type"] == "normal"), key=lambda s: -s["value_per_slot"][h]):
        load = sum(x["kw"] for x in on) + s["kw"]
        if load <= cap and fuel(load) <= left:
            on.append(s)
    load = sum(x["kw"] for x in on)
    if fuel(load) > left:  # cannot even run the mandatory shops: generator stops
        on, load = [], 0
    left -= fuel(load)
    total_cl += fuel(load)
    total_v += sum(s["value_per_slot"][h] for s in on)
    ids = [s["id"] for s in on]
    roster.append({
        "slot": h, "hour": f"{10 + h}:00", "powered": ids,
        "dark": [{"id": s["id"], "reason": "lower value than the shops picked first this hour"} for s in shops if s["id"] not in ids],
        "load_kw": load, "fuel_litres": fuel(load) / 100,
    })

dark_hours = {s["id"]: sum(1 for r in roster if s["id"] not in r["powered"]) for s in shops}
print(json.dumps({"status": "ok", "roster": roster, "value_total": total_v,
                  "fuel_total_litres": total_cl / 100, "dark_hours": dark_hours}, indent=2))

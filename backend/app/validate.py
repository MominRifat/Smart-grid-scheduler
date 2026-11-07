"""Input validation (rule 2, 4, 9).

Turns raw JSON (parsed with Decimal floats so we can count decimals exactly)
into a typed `Problem`, or raises `InvalidInput` naming the offending field.
Litres are converted to integer hundredths here so nothing downstream ever
touches floating point.
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any

SLOTS = 10
MAX_SHOPS = 12
HOUR_LABELS = [f"{10 + i:02d}:00" for i in range(SLOTS)]
MAX_NUMBER = 10**12  # keeps every solver sum far inside 64-bit integers


class InvalidInput(ValueError):
    def __init__(self, field: str, message: str):
        self.field = field
        super().__init__(f"{field}: {message}")


@dataclass(frozen=True)
class Shop:
    id: str
    kw: int
    mandatory: bool
    values: tuple[int, ...]


@dataclass(frozen=True)
class FuelLevel:
    load_kw: int
    centilitres: int  # litres * 100


@dataclass(frozen=True)
class Problem:
    grid: tuple[bool, ...]
    capacity_kw: int
    budget_cl: int  # litres * 100
    fuel_table: tuple[FuelLevel, ...]
    max_dark: int
    shops: tuple[Shop, ...]

    @property
    def outage_slots(self) -> list[int]:
        return [h for h in range(SLOTS) if not self.grid[h]]

    def fuel_for_load(self, load_kw: int) -> int:
        """Rule 4: first level whose load_kw >= load; zero load costs zero."""
        if load_kw <= 0:
            return 0
        for level in self.fuel_table:
            if level.load_kw >= load_kw:
                return level.centilitres
        raise ValueError(f"load {load_kw} kW exceeds capacity {self.capacity_kw} kW")


def _is_number(v: Any) -> bool:
    return isinstance(v, (int, Decimal, float)) and not isinstance(v, bool)


def _whole(v: Any, field: str, *, minimum: int) -> int:
    """A whole number >= minimum. 20 and 20.0 are both accepted as 20."""
    if not _is_number(v):
        raise InvalidInput(field, "must be a whole number")
    d = Decimal(str(v)) if isinstance(v, float) else Decimal(v)
    if not d.is_finite() or d != d.to_integral_value():
        raise InvalidInput(field, "must be a whole number")
    n = int(d)
    if n < minimum:
        raise InvalidInput(field, f"must be >= {minimum}")
    if n > MAX_NUMBER:
        raise InvalidInput(field, f"must be <= {MAX_NUMBER}")
    return n


def _litres(v: Any, field: str) -> int:
    """A non-negative amount of litres with at most two decimals -> hundredths."""
    if not _is_number(v):
        raise InvalidInput(field, "must be a number of litres")
    d = Decimal(str(v)) if isinstance(v, float) else Decimal(v)
    if not d.is_finite():
        raise InvalidInput(field, "must be a finite number")
    if d < 0:
        raise InvalidInput(field, "must not be negative")
    cl = d * 100
    if cl != cl.to_integral_value():
        raise InvalidInput(field, "must have at most two decimals")
    if d > MAX_NUMBER:
        raise InvalidInput(field, f"must be <= {MAX_NUMBER}")
    return int(cl)


def _require(obj: dict, key: str, prefix: str = "") -> Any:
    if key not in obj:
        raise InvalidInput(prefix + key, "is missing")
    return obj[key]


def parse_problem(raw: Any) -> Problem:
    if not isinstance(raw, dict):
        raise InvalidInput("(root)", "input must be a JSON object")

    grid = _require(raw, "grid_available")
    if not isinstance(grid, list) or len(grid) != SLOTS:
        raise InvalidInput("grid_available", f"must be a list of exactly {SLOTS} booleans")
    for i, g in enumerate(grid):
        if not isinstance(g, bool):
            raise InvalidInput(f"grid_available[{i}]", "must be true or false")

    capacity = _whole(_require(raw, "generator_capacity_kw"), "generator_capacity_kw", minimum=1)
    budget = _litres(_require(raw, "fuel_budget_litres"), "fuel_budget_litres")

    table = _require(raw, "fuel_table")
    if not isinstance(table, list) or not table:
        raise InvalidInput("fuel_table", "must be a non-empty list of levels")
    levels: list[FuelLevel] = []
    for i, row in enumerate(table):
        f = f"fuel_table[{i}]"
        if not isinstance(row, dict):
            raise InvalidInput(f, "must be an object with load_kw and litres_per_hour")
        kw = _whole(_require(row, "load_kw", f + "."), f + ".load_kw", minimum=1)
        cl = _litres(_require(row, "litres_per_hour", f + "."), f + ".litres_per_hour")
        if levels and kw <= levels[-1].load_kw:
            raise InvalidInput(f + ".load_kw", "levels must be strictly increasing")
        levels.append(FuelLevel(kw, cl))
    if levels[-1].load_kw != capacity:
        raise InvalidInput(
            "fuel_table",
            f"last level is {levels[-1].load_kw} kW but must equal generator_capacity_kw ({capacity})",
        )

    max_dark = _whole(_require(raw, "max_consecutive_dark"), "max_consecutive_dark", minimum=0)

    shops_raw = _require(raw, "shops")
    if not isinstance(shops_raw, list):
        raise InvalidInput("shops", "must be a list")
    if len(shops_raw) > MAX_SHOPS:
        raise InvalidInput("shops", f"at most {MAX_SHOPS} shops allowed, got {len(shops_raw)}")
    shops: list[Shop] = []
    seen: set[str] = set()
    for i, s in enumerate(shops_raw):
        f = f"shops[{i}]"
        if not isinstance(s, dict):
            raise InvalidInput(f, "must be an object")
        sid = _require(s, "id", f + ".")
        if not isinstance(sid, str) or not sid.strip():
            raise InvalidInput(f + ".id", "must be a non-blank string")
        if sid in seen:
            raise InvalidInput(f + ".id", f"duplicate id '{sid}'")
        seen.add(sid)
        kw = _whole(_require(s, "kw", f + "."), f + ".kw", minimum=1)
        typ = _require(s, "type", f + ".")
        if typ not in ("mandatory", "normal"):
            raise InvalidInput(f + ".type", "must be 'mandatory' or 'normal'")
        vals = _require(s, "value_per_slot", f + ".")
        if not isinstance(vals, list) or len(vals) != SLOTS:
            raise InvalidInput(f + ".value_per_slot", f"must be a list of exactly {SLOTS} numbers")
        values = tuple(_whole(v, f"{f}.value_per_slot[{j}]", minimum=0) for j, v in enumerate(vals))
        shops.append(Shop(sid, kw, typ == "mandatory", values))

    return Problem(
        grid=tuple(grid),
        capacity_kw=capacity,
        budget_cl=budget,
        fuel_table=tuple(levels),
        max_dark=max_dark,
        shops=tuple(shops),
    )

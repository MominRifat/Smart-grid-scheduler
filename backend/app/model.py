"""Plain roster solution shared by both solvers (no third-party imports)."""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Solution:
    on: dict[tuple[int, int], bool]  # (shop index, slot) -> powered
    value: int
    fuel_cl: int
    optimal: bool
    violations: list[dict] = field(default_factory=list)  # best-effort only
    solver: str = "cp-sat"  # which engine produced it: "cp-sat" or "backup"

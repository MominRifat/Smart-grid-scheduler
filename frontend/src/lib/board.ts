import type { RosterBlock, RosterInput } from "./types";

export type CellKind = "grid" | "on" | "off";

export interface Cell {
  kind: CellKind;
  slot: number;
  reason?: string;
  value: number;
}

export interface BoardRow {
  id: string;
  kw: number;
  mandatory: boolean;
  cells: Cell[];
  darkHours: number;
  longestRun: number;
}

export interface HourStat {
  slot: number;
  outage: boolean;
  load: number;
  capacity: number;
  fuel: number;
  running: number;
  budget: number;
  value: number;
}

export interface Board {
  rows: BoardRow[];
  hours: HourStat[];
}

/** Merge input (shop metadata, grid) with an output roster block into a 10-column board. */
export function buildBoard(input: RosterInput, block: RosterBlock): Board {
  const bySlot = new Map(block.roster.map((r) => [r.slot, r]));
  const rows: BoardRow[] = input.shops.map((shop) => {
    let run = 0;
    let longestRun = 0;
    const cells: Cell[] = input.grid_available.map((grid, slot) => {
      const entry = bySlot.get(slot);
      if (grid || !entry) {
        run = 0;
        return { kind: "grid", slot, value: 0 };
      }
      const dark = entry.dark.find((d) => d.id === shop.id);
      if (dark) {
        run += 1;
        longestRun = Math.max(longestRun, run);
        return { kind: "off", slot, reason: dark.reason, value: shop.value_per_slot[slot] };
      }
      run = 0;
      return { kind: "on", slot, value: shop.value_per_slot[slot] };
    });
    return {
      id: shop.id,
      kw: shop.kw,
      mandatory: shop.type === "mandatory",
      cells,
      darkHours: block.dark_hours[shop.id] ?? cells.filter((c) => c.kind === "off").length,
      longestRun,
    };
  });

  let running = 0;
  const hours: HourStat[] = input.grid_available.map((grid, slot) => {
    const entry = bySlot.get(slot);
    if (entry) running = entry.fuel_running_litres;
    return {
      slot,
      outage: !grid,
      load: entry?.load_kw ?? 0,
      capacity: input.generator_capacity_kw,
      fuel: entry?.fuel_litres ?? 0,
      running,
      budget: input.fuel_budget_litres,
      value: entry?.value ?? 0,
    };
  });
  return { rows, hours };
}

export function litres(n: number): string {
  return `${n.toFixed(2)} L`;
}

/** Parse leniently for display only; the API is the source of truth for validity. */
export function tryParseInput(text: string): RosterInput | null {
  try {
    const v = JSON.parse(text);
    if (v && Array.isArray(v.grid_available) && Array.isArray(v.shops)) return v as RosterInput;
  } catch {
    /* shown via API error */
  }
  return null;
}

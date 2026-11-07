import { describe, expect, it } from "vitest";
import { buildBoard } from "../lib/board";
import type { RosterBlock, RosterInput } from "../lib/types";

const input: RosterInput = {
  grid_available: [true, true, false, false, false, true, true, false, false, false],
  generator_capacity_kw: 10,
  fuel_budget_litres: 8,
  fuel_table: [{ load_kw: 10, litres_per_hour: 1.6 }],
  max_consecutive_dark: 2,
  shops: [
    { id: "pharmacy", kw: 3, type: "mandatory", value_per_slot: Array(10).fill(5) },
    { id: "tailor", kw: 4, type: "normal", value_per_slot: Array(10).fill(2) },
  ],
};

const block: RosterBlock = {
  roster: [2, 3, 4, 7, 8, 9].map((slot, i) => ({
    slot,
    hour: `${10 + slot}:00`,
    powered: i < 2 ? ["pharmacy"] : ["pharmacy", "tailor"],
    dark: i < 2 ? [{ id: "tailor", reason: "Generator full: test" }] : [],
    load_kw: i < 2 ? 3 : 7,
    fuel_litres: 1.6,
    fuel_running_litres: 1.6 * (i + 1),
    value: 5,
  })),
  value_total: 30,
  fuel_total_litres: 9.6,
  dark_hours: { pharmacy: 0, tailor: 2 },
};

describe("buildBoard", () => {
  const board = buildBoard(input, block);

  it("marks grid hours neutral and outage hours on/off", () => {
    const tailor = board.rows[1];
    expect(tailor.cells.map((c) => c.kind)).toEqual(["grid", "grid", "off", "off", "on", "grid", "grid", "on", "on", "on"]);
    expect(tailor.cells[2].reason).toContain("Generator full");
  });

  it("tracks dark hours, longest run and mandatory flag", () => {
    expect(board.rows[0].mandatory).toBe(true);
    expect(board.rows[1].darkHours).toBe(2);
    expect(board.rows[1].longestRun).toBe(2);
  });

  it("carries running fuel forward across grid hours", () => {
    expect(board.hours[5].outage).toBe(false);
    expect(board.hours[5].running).toBeCloseTo(4.8);
    expect(board.hours[9].running).toBeCloseTo(9.6);
    expect(board.hours[2].load).toBe(3);
  });
});

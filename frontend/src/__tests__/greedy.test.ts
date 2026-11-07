import { describe, expect, it } from "vitest";
import sample from "../../public/examples/shapla_sample.json";
import { runGreedy } from "../lib/greedy";
import type { RosterInput } from "../lib/types";

describe("runGreedy (baseline for the comparison chart)", () => {
  it("reproduces the brief's failure on the Shapla sample: diesel runs out at 19:00", () => {
    const g = runGreedy(sample as unknown as RosterInput);
    expect(g.exhaustedAt).toBe(9);
    expect(g.hours[9].load).toBe(0);
    expect(g.ruleBreaks).toBeGreaterThan(0);
    expect(g.fuel).toBeLessThanOrEqual(17);
  });

  it("never exceeds capacity", () => {
    const g = runGreedy(sample as unknown as RosterInput);
    expect(Math.max(...g.hours.map((h) => h.load))).toBeLessThanOrEqual(20);
  });
});

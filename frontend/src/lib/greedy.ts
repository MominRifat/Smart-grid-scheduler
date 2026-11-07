import type { RosterInput } from "./types";

/**
 * The naive "most valuable shops, hour by hour" baseline from the brief (same as
 * evidence/01_greedy_v0_broke/greedy_v0.py). Only used to draw the comparison chart.
 */
export interface GreedyHour {
  slot: number;
  outage: boolean;
  load: number;
  fuel: number;
  running: number;
  value: number;
  mandatoryDark: number;
}

export interface GreedyResult {
  hours: GreedyHour[];
  value: number;
  fuel: number;
  ruleBreaks: number;
  exhaustedAt: number | null; // first slot where the generator could not run the mandatory shops
}

export function runGreedy(input: RosterInput): GreedyResult {
  const cl = (l: number) => Math.round(Number(l) * 100);
  const table = input.fuel_table.map((t) => [t.load_kw, cl(t.litres_per_hour)] as const);
  const fuelFor = (load: number) => (load <= 0 ? 0 : (table.find(([kw]) => kw >= load)?.[1] ?? Infinity));
  let left = cl(input.fuel_budget_litres);
  let running = 0;
  let value = 0;
  let exhaustedAt: number | null = null;
  const dark: Record<string, boolean[]> = Object.fromEntries(input.shops.map((s) => [s.id, Array(10).fill(false)]));
  const mandatory = input.shops.filter((s) => s.type === "mandatory");
  const normal = input.shops.filter((s) => s.type === "normal");

  const hours: GreedyHour[] = input.grid_available.map((grid, slot) => {
    if (grid) return { slot, outage: false, load: 0, fuel: 0, running: running / 100, value: 0, mandatoryDark: 0 };
    let on = [...mandatory];
    for (const s of [...normal].sort((a, b) => b.value_per_slot[slot] - a.value_per_slot[slot])) {
      const load = on.reduce((a, x) => a + x.kw, 0) + s.kw;
      if (load <= input.generator_capacity_kw && fuelFor(load) <= left) on.push(s);
    }
    let load = on.reduce((a, x) => a + x.kw, 0);
    if (fuelFor(load) > left || load > input.generator_capacity_kw) {
      on = [];
      load = 0;
      if (exhaustedAt === null) exhaustedAt = slot;
    }
    const fuel = fuelFor(load);
    left -= fuel;
    running += fuel;
    const v = on.reduce((a, x) => a + x.value_per_slot[slot], 0);
    value += v;
    for (const s of input.shops) dark[s.id][slot] = !on.includes(s);
    return { slot, outage: true, load, fuel: fuel / 100, running: running / 100, value: v, mandatoryDark: mandatory.length - on.filter((s) => s.type === "mandatory").length };
  });

  let ruleBreaks = hours.reduce((a, h) => a + h.mandatoryDark, 0);
  for (const s of normal) {
    let run = 0;
    for (let h = 0; h < 10; h++) {
      run = !input.grid_available[h] && dark[s.id][h] ? run + 1 : 0;
      if (run === input.max_consecutive_dark + 1) ruleBreaks++;
    }
  }
  return { hours, value, fuel: running / 100, ruleBreaks, exhaustedAt };
}

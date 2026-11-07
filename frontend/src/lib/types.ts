export interface ShopInput {
  id: string;
  kw: number;
  type: "mandatory" | "normal";
  value_per_slot: number[];
}

export interface RosterInput {
  grid_available: boolean[];
  generator_capacity_kw: number;
  fuel_budget_litres: number;
  fuel_table: { load_kw: number; litres_per_hour: number }[];
  max_consecutive_dark: number;
  shops: ShopInput[];
  _story?: string;
}

export interface DarkEntry {
  id: string;
  reason: string;
}

export interface HourEntry {
  slot: number;
  hour: string;
  powered: string[];
  dark: DarkEntry[];
  load_kw: number;
  fuel_litres: number;
  fuel_running_litres: number;
  value: number;
}

export interface RosterBlock {
  roster: HourEntry[];
  value_total: number;
  fuel_total_litres: number;
  dark_hours: Record<string, number>;
}

export interface Conflict {
  rule: string;
  shops: string[];
  hours: string[];
  detail: string;
}

export type RosterOutput =
  | ({ status: "ok"; optimal?: boolean; solver?: "cp-sat" | "backup" } & RosterBlock)
  | {
      status: "infeasible";
      message: string;
      conflicts: Conflict[];
      best_effort: RosterBlock & {
        label: string;
        violations: { rule: string; shop: string; hours: string[] }[];
      };
    }
  | { status: "invalid_input"; field: string; message: string };

export const HOURS = Array.from({ length: 10 }, (_, i) => `${String(10 + i).padStart(2, "0")}:00`);

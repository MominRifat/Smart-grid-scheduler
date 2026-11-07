import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";

const sample = {
  grid_available: [true, true, false, true, true, true, true, true, true, true],
  generator_capacity_kw: 10,
  fuel_budget_litres: 2,
  fuel_table: [{ load_kw: 10, litres_per_hour: 1 }],
  max_consecutive_dark: 2,
  shops: [
    { id: "pharmacy", kw: 3, type: "mandatory", value_per_slot: Array(10).fill(5) },
    { id: "salon", kw: 9, type: "normal", value_per_slot: Array(10).fill(1) },
  ],
};

const ok = {
  status: "ok",
  optimal: true,
  roster: [{
    slot: 2, hour: "12:00", powered: ["pharmacy"],
    dark: [{ id: "salon", reason: "Generator full: 3 kW on + 9 kW = 12 kW > 10 kW capacity" }],
    load_kw: 3, fuel_litres: 1, fuel_running_litres: 1, value: 5,
  }],
  value_total: 5,
  fuel_total_litres: 1,
  dark_hours: { pharmacy: 0, salon: 1 },
};

function mockFetch(apiBody: unknown, status = 200) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith("/examples/")) return new Response(JSON.stringify(sample));
    expect(url).toBe("/api/roster");
    expect(init?.method).toBe("POST");
    return new Response(JSON.stringify(apiBody), { status });
  });
}

beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  // framer-motion's useInView/whileInView
  (globalThis as any).IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
});
afterEach(() => vi.restoreAllMocks());

describe("App", () => {
  it("loads the sample, calls POST /api/roster and renders the board", async () => {
    globalThis.fetch = mockFetch(ok) as any;
    render(<App />);
    expect(await screen.findByRole("table", { name: "Roster board" })).toBeInTheDocument();
    expect(screen.getAllByText("pharmacy").length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/salon 12:00 dark: Generator full/)).toBeInTheDocument();
    expect(screen.getAllByLabelText(/ grid$/).length).toBe(18);
    expect(screen.getByText("● ok")).toBeInTheDocument();
  });

  it("shows the reason list and selects a cell on click", async () => {
    globalThis.fetch = mockFetch(ok) as any;
    render(<App />);
    const cell = await screen.findByLabelText(/salon 12:00 dark/);
    await userEvent.click(cell);
    expect(cell).toHaveAttribute("data-selected", "true");
    expect(screen.getAllByText(/12 kW > 10 kW capacity/).length).toBeGreaterThan(0);
  });

  it("names the field for invalid input (HTTP 400)", async () => {
    globalThis.fetch = mockFetch({ status: "invalid_input", field: "shops[1].id", message: "shops[1].id: duplicate id 'x'" }, 400) as any;
    render(<App />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("shops[1].id");
    expect(alert).toHaveTextContent("HTTP 400");
  });

  it("shows conflicts and a labelled best-effort board when infeasible", async () => {
    globalThis.fetch = mockFetch({
      status: "infeasible",
      message: "No roster can satisfy every rule. capacity: ...",
      conflicts: [{ rule: "capacity", shops: ["pharmacy"], hours: ["12:00"], detail: "Mandatory shop pharmacy needs 12 kW" }],
      best_effort: { ...ok, label: "BEST EFFORT", violations: [{ rule: "mandatory", shop: "pharmacy", hours: ["12:00"] }] },
    }) as any;
    render(<App />);
    expect(await screen.findByText(/No roster can keep every rule/)).toBeInTheDocument();
    expect(screen.getByText("Mandatory shop pharmacy needs 12 kW", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Best-effort board")).toBeInTheDocument();
  });
});

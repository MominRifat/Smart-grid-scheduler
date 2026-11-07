import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { Architecture } from "../components/Architecture";

beforeEach(() => {
  (globalThis as any).IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
});

describe("Architecture markers", () => {
  it("hovering a marker shows its label and switches the callout + flow", async () => {
    render(<Architecture />);
    expect(screen.getByText("ONE PLAN FOR THE DAY")).toBeInTheDocument();
    const marker = screen.getByRole("button", { name: /Infeasible days/ });
    await userEvent.hover(marker);
    expect(screen.getByText("Infeasible days")).toBeInTheDocument();
    expect(marker).toHaveAttribute("aria-pressed", "true");
    expect(await screen.findByText("INFEASIBLE, NOT SILENT")).toBeInTheDocument();
  });

  it("is keyboard operable", async () => {
    render(<Architecture />);
    const marker = screen.getByRole("button", { name: /Same endpoint/ });
    fireEvent.focus(marker);
    expect(marker).toHaveAttribute("aria-pressed", "true");
  });
});

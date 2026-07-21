import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DashboardLayout } from "./dashboard-layout";

const requiredContent = {
  overview: <div>概要</div>,
  assetHistory: <div>資産推移</div>,
  cashFlow: <div>収支推移</div>,
};

describe("DashboardLayout", () => {
  it("renders the dashboard information hierarchy", () => {
    render(<DashboardLayout {...requiredContent} dailyChange={<div>前日比</div>} />);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "お金の現在地を、ひと目で。",
    );
    expect(screen.getByRole("heading", { level: 2, name: "資産のいま" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "お金の流れ" })).toBeTruthy();
    expect(screen.getByText("前日比")).toBeTruthy();
  });

  it("keeps the overview and trends visible without investment data", () => {
    render(<DashboardLayout {...requiredContent} />);

    expect(screen.queryByText("前日比")).toBeNull();
    expect(screen.getByText("概要")).toBeTruthy();
    expect(screen.getByText("資産推移")).toBeTruthy();
    expect(screen.getByText("収支推移")).toBeTruthy();
  });
});

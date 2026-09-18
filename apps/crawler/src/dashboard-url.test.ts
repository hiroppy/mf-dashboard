import { describe, expect, it } from "vitest";
import { getDashboardUrl } from "./dashboard-url.js";

describe("getDashboardUrl", () => {
  it("returns undefined when the dashboard URL is not configured", () => {
    expect(getDashboardUrl({})).toBeUndefined();
  });

  it("preserves root deployment URLs", () => {
    expect(getDashboardUrl({ DASHBOARD_URL: "https://dashboard.example.com" })).toBe(
      "https://dashboard.example.com",
    );
  });

  it("appends the configured base path", () => {
    expect(
      getDashboardUrl({
        DASHBOARD_URL: "https://dashboard.example.com/",
        NEXT_PUBLIC_BASE_PATH: "/dashboard/",
      }),
    ).toBe("https://dashboard.example.com/dashboard");
  });

  it("does not append a base path that is already present", () => {
    expect(
      getDashboardUrl({
        DASHBOARD_URL: "https://dashboard.example.com/dashboard/",
        NEXT_PUBLIC_BASE_PATH: "/dashboard",
      }),
    ).toBe("https://dashboard.example.com/dashboard");
  });
});

import { describe, expect, it } from "vitest";
import { formatChartLabel } from "./chart-tooltip";

describe("formatChartLabel", () => {
  it.each([
    ["2026年7月", "2026年7月"],
    [2026, "2026"],
  ])("formats primitive label %j", (label, expected) => {
    expect(formatChartLabel(label)).toBe(expected);
  });

  it.each([null, undefined, { month: "7月" }, ["7月"]])(
    "does not expose object stringification for %j",
    (label) => {
      expect(formatChartLabel(label)).toBe("");
    },
  );
});

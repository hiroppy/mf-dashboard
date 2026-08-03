import { describe, expect, it } from "vitest";
import { formatProjectionLabel } from "./projection-chart";

const projections = [
  { year: 0 },
  { year: 1, isContributing: true },
  { year: 2, isWithdrawing: true },
  { year: 3, isContributing: true, isWithdrawing: true },
];

describe("formatProjectionLabel", () => {
  it.each([
    [0, undefined, "0年後"],
    [1, 35, "36歳（1年後）"],
    [2, undefined, "2年後（切り崩し）"],
    [3, 35, "38歳（3年後・積立+切り崩し）"],
  ])("formats year %d with age %j", (label, currentAge, expected) => {
    expect(formatProjectionLabel(label, projections, currentAge)).toBe(expected);
  });

  it.each([null, undefined, Number.NaN, "2", { year: 2 }])(
    "returns an empty label for invalid input %j",
    (label) => {
      expect(formatProjectionLabel(label, projections, 35)).toBe("");
    },
  );
});

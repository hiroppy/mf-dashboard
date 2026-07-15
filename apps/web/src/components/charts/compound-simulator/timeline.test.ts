import { describe, expect, it } from "vitest";
import { buildTimelineSegments } from "./timeline";

describe("buildTimelineSegments", () => {
  it("builds contribution, idle, and withdrawal phases", () => {
    expect(buildTimelineSegments(10, 15, 20)).toEqual([
      { type: "contribution", start: 0, end: 10 },
      { type: "idle", start: 10, end: 15 },
      { type: "withdrawal", start: 15, end: 35 },
    ]);
  });

  it("marks overlapping contribution and withdrawal years", () => {
    expect(buildTimelineSegments(10, 5, 10)).toEqual([
      { type: "contribution", start: 0, end: 5 },
      { type: "overlap", start: 5, end: 10 },
      { type: "withdrawal", start: 10, end: 15 },
    ]);
  });
});

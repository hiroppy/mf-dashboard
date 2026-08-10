import { describe, expect, it } from "vitest";
import { getManualEventMaxDate } from "./bank-forecast-manual-event";

describe("getManualEventMaxDate", () => {
  it("returns the same month and day ten years later", () => {
    expect(getManualEventMaxDate("2026-08-10")).toBe("2036-08-10");
  });

  it("clamps a leap day to the last valid day of the target month", () => {
    expect(getManualEventMaxDate("2024-02-29")).toBe("2034-02-28");
  });
});

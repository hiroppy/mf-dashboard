import { describe, expect, it } from "vitest";
import { shouldShowTransactionKpiTotals } from "./transaction-kpi-summary";

const unfilteredMonth = {
  isMonthView: true,
  selectedDate: null,
  searchText: "",
  selectedCategories: [],
  selectedTypes: [],
  selectedAccounts: [],
};

describe("shouldShowTransactionKpiTotals", () => {
  it("hides duplicate totals on an unfiltered monthly page", () => {
    expect(shouldShowTransactionKpiTotals(unfilteredMonth)).toBe(false);
  });

  it.each([
    { selectedDate: "2026-06-10" },
    { searchText: "スーパー" },
    { selectedCategories: ["食費"] },
    { selectedTypes: ["expense"] },
    { selectedAccounts: ["Account A"] },
  ])("shows totals when the monthly table is filtered: %o", (filter) => {
    expect(shouldShowTransactionKpiTotals({ ...unfilteredMonth, ...filter })).toBe(true);
  });

  it("keeps totals on non-monthly transaction pages", () => {
    expect(shouldShowTransactionKpiTotals({ ...unfilteredMonth, isMonthView: false })).toBe(true);
  });
});

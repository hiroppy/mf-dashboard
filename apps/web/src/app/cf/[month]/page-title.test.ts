import { describe, expect, it } from "vitest";
import { formatCashFlowPageTitle } from "./page-title";

describe("formatCashFlowPageTitle", () => {
  it("月キーを含むページタイトルを返す", () => {
    expect(formatCashFlowPageTitle("2025-04")).toBe("収支 - 2025年4月");
  });

  it("fallback month param では月キーを parse せずベースタイトルを返す", () => {
    expect(formatCashFlowPageTitle("_")).toBe("収支");
  });

  it("fallback 以外の不正な月キーは例外にする", () => {
    expect(() => formatCashFlowPageTitle("invalid")).toThrow("Invalid year-month key: invalid");
  });
});

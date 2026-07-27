import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AssetHistoryTooltip } from "./asset-history-chart.client";

afterEach(cleanup);

describe("AssetHistoryTooltip", () => {
  it("総資産が選択されている場合は日付の横に総資産額を表示する", () => {
    render(
      <AssetHistoryTooltip
        active
        label="2026-07-26"
        period="1m"
        payload={[
          { dataKey: "totalAssets", name: "総資産", value: 1000 },
          { dataKey: "投資信託", name: "投資信託", value: 400 },
        ]}
      />,
    );

    expect(screen.getByText("2026/7/26")).toBeTruthy();
    expect(screen.getByText("1,000円")).toBeTruthy();
    expect(screen.getByText("投資信託")).toBeTruthy();
    expect(screen.getByText("400円")).toBeTruthy();
    expect(screen.queryByText("総資産")).toBeNull();
  });

  it("総資産が選択されていない場合は総資産額を表示しない", () => {
    render(
      <AssetHistoryTooltip
        active
        label="2026-07-26"
        period="1m"
        payload={[{ dataKey: "投資信託", name: "投資信託", value: 400 }]}
      />,
    );

    expect(screen.getByText("2026/7/26")).toBeTruthy();
    expect(screen.getByText("投資信託")).toBeTruthy();
    expect(screen.getByText("400円")).toBeTruthy();
    expect(screen.queryByText("1,000円")).toBeNull();
  });

  it("カテゴリを金額の降順で表示する", () => {
    render(
      <AssetHistoryTooltip
        active
        label="2026-07-26"
        period="1m"
        payload={[
          { dataKey: "預金・現金", name: "預金・現金", value: 100 },
          { dataKey: "暗号資産", name: "暗号資産", value: 300 },
          { dataKey: "年金", name: "年金", value: 200 },
        ]}
      />,
    );

    expect(
      screen.getAllByText(/^(暗号資産|年金|預金・現金)$/).map((element) => element.textContent),
    ).toEqual(["暗号資産", "年金", "預金・現金"]);
  });
});

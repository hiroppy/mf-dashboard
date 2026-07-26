import { getHoldingsWithLatestValues } from "@mf-dashboard/db";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SimulatorContent } from "./page";

vi.mock("@mf-dashboard/db", () => ({
  getHoldingsWithLatestValues: vi.fn<typeof getHoldingsWithLatestValues>(),
}));

vi.mock("../../components/charts/compound-simulator/compound-simulator", () => ({
  CompoundSimulator: ({ defaultInitialAmount }: { defaultInitialAmount: number }) => (
    <div>初期投資額: {defaultInitialAmount}</div>
  ),
}));

const mockedGetHoldings = vi.mocked(getHoldingsWithLatestValues);

describe("SimulatorContent", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("demo 環境でも投資信託の合計を初期投資額に設定する", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    mockedGetHoldings.mockResolvedValue([
      { categoryName: "投資信託", amount: 1_200_000 },
      { categoryName: "投資信託", amount: 799_859 },
      { categoryName: "預金・現金", amount: 500_000 },
    ] as Awaited<ReturnType<typeof getHoldingsWithLatestValues>>);

    render(await SimulatorContent({}));

    expect(screen.getByText("初期投資額: 1999859")).toBeTruthy();
  });

  it("通常環境でも投資信託の合計を初期投資額に設定する", async () => {
    vi.stubEnv("DEMO_MODE", "false");
    mockedGetHoldings.mockResolvedValue([
      { categoryName: "投資信託", amount: 2_000_000 },
      { categoryName: "株式(現物)", amount: 1_000_000 },
    ] as Awaited<ReturnType<typeof getHoldingsWithLatestValues>>);

    render(await SimulatorContent({}));

    expect(screen.getByText("初期投資額: 2000000")).toBeTruthy();
  });
});

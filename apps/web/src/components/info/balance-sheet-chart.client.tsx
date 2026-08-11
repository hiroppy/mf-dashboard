"use client";

import { Scale } from "lucide-react";
import { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { sortByAmountDescending } from "../../lib/amount-order";
import { CHART_INITIAL_DIMENSION } from "../../lib/chart";
import { getAssetCategoryColor, semanticColors } from "../../lib/colors";
import { ChartTooltipContent } from "../charts/chart-tooltip";
import { AmountDisplay } from "../ui/amount-display";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";

interface BalanceSheetChartProps {
  assets: Array<{ category: string; amount: number }>;
  liabilities: Array<{ category: string; amount: number }>;
  netAssets: number;
  totalAssets: number;
}

export function formatBalanceSheetShare(amount: number, total: number) {
  const percentage = total === 0 ? 0 : (amount / total) * 100;
  const sign = percentage < 0 ? "-" : "";
  const paddedPercentage = Math.abs(percentage).toFixed(1).padStart(4, "0");
  return `(${sign}${paddedPercentage}%)`;
}

export function getBalanceSheetChartOrder(
  assets: BalanceSheetChartProps["assets"],
  totalLiabilities: number,
  netAssets: number,
) {
  const orderedAssets = sortByAmountDescending(
    assets,
    (asset) => asset.amount,
    (asset) => asset.category,
  );
  const orderedBalanceItems = sortByAmountDescending(
    [
      ...orderedAssets.map(({ category, amount }) => ({ key: category, amount })),
      { key: "負債", amount: totalLiabilities },
      { key: "純資産", amount: netAssets },
    ],
    (item) => item.amount,
    (item) => item.key,
  );

  return {
    orderedAssets,
    stackedAssetKeys: orderedAssets.map((asset) => asset.category).reverse(),
    legendKeys: orderedBalanceItems.map((item) => item.key),
    stackedBalanceKeys: orderedBalanceItems
      .filter((item) => item.key === "負債" || item.key === "純資産")
      .reverse(),
  };
}

export function BalanceSheetChartClient({
  assets,
  liabilities,
  netAssets,
  totalAssets,
}: BalanceSheetChartProps) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const totalLiabilities = liabilities.reduce((sum, l) => sum + l.amount, 0);
  const { orderedAssets, stackedAssetKeys, legendKeys, stackedBalanceKeys } =
    getBalanceSheetChartOrder(assets, totalLiabilities, netAssets);

  // チャートデータ: 左=資産、右=負債+純資産
  const assetData: Record<string, string | number> = { name: "資産" };
  orderedAssets.forEach((a) => {
    assetData[a.category] = a.amount;
  });

  const liabilityData: Record<string, string | number> = {
    name: "負債・純資産",
  };
  liabilityData["負債"] = totalLiabilities;
  liabilityData["純資産"] = netAssets;

  const chartData = [assetData, liabilityData];
  const getLegendOrder = (name: string) => {
    const index = legendKeys.indexOf(name);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };

  // カスタムツールチップ
  const CustomTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: Array<{ name: string; value: number; fill: string }>;
    label?: string;
  }) => {
    if (!active || !payload || payload.length === 0) return null;

    const isAssetSide = label === "資産";
    const total = isAssetSide ? totalAssets : totalLiabilities + netAssets;

    return (
      <ChartTooltipContent>
        <div className="font-bold mb-2">{label}</div>
        {sortByAmountDescending(
          payload.filter((item) => Number.isFinite(item.value)),
          (item) => item.value,
          (item) => item.name,
        ).map((p) => (
          <div key={p.name} className="flex justify-between gap-4">
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: p.fill }} />
              {p.name}
            </span>
            <span className="flex items-baseline gap-1">
              <AmountDisplay amount={p.value} weight="medium" />
              <span className="text-muted-foreground lining-nums tabular-nums">
                {formatBalanceSheetShare(p.value, total)}
              </span>
            </span>
          </div>
        ))}
        <div className="flex justify-between gap-4 mt-2 pt-2 border-t font-bold">
          <span>合計</span>
          <AmountDisplay amount={total} weight="bold" />
        </div>
      </ChartTooltipContent>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle icon={Scale}>バランスシート</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer
          width="100%"
          height={isMobile ? 280 : 400}
          initialDimension={CHART_INITIAL_DIMENSION}
        >
          <BarChart
            data={chartData}
            margin={{ top: 10, right: 10, left: 10, bottom: 5 }}
            barCategoryGap="30%"
          >
            <XAxis
              dataKey="name"
              tick={{ fontSize: 12, fill: "#4B5563", fontWeight: 500 }}
              axisLine={{ stroke: "#E2E8F0" }}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(value) => `${(value / 10000).toFixed(0)}万`}
              tick={{ fontSize: 12, fill: "#4B5563" }}
              axisLine={{ stroke: "#E2E8F0" }}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              itemSorter={(item) => getLegendOrder(String(item.value))}
              verticalAlign="bottom"
              iconType="square"
              iconSize={10}
              wrapperStyle={{
                fontSize: 11,
                paddingTop: 16,
                lineHeight: "22px",
              }}
            />
            {/* 資産カテゴリ */}
            {stackedAssetKeys.map((key) => (
              <Bar
                key={key}
                dataKey={key}
                stackId="stack"
                fill={getAssetCategoryColor(key)}
                name={key}
              />
            ))}
            {/* 負債・純資産 */}
            {stackedBalanceKeys.map(({ key }) => (
              <Bar
                key={key}
                dataKey={key}
                stackId="stack"
                fill={key === "負債" ? semanticColors.liability : semanticColors.netAssets}
                name={key}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

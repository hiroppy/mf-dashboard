"use client";

import { TrendingDown, TrendingUp } from "lucide-react";
import { createContext, type ReactNode, useContext, useMemo, useState } from "react";
import { TreemapChart } from "../charts/treemap-chart";
import { AmountDisplay } from "../ui/amount-display";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { MetricLabel } from "../ui/metric-label";
import { Select } from "../ui/select";

interface HoldingData {
  name: string;
  amount: number;
  unrealizedGain: number;
  unrealizedGainPct: number | null;
  institution: string | null;
  categoryName: string | null;
}

interface FilterOption {
  value: string;
  label: string;
}

interface UnrealizedGainCardClientProps {
  holdings: HoldingData[];
  filterOptions: FilterOption[];
  hideFilter?: boolean;
}

function getGainColor(gain: number): string {
  return gain >= 0 ? "var(--color-balance-positive)" : "var(--color-balance-negative)";
}

// Group small holdings into "その他" and sort by value descending
function groupSmallHoldings(
  holdings: HoldingData[],
  totalValue: number,
  threshold = 0.02,
): Array<{ name: string; value: number; color: string }> {
  const result: Array<{ name: string; value: number; color: string }> = [];
  let othersValue = 0;
  let othersGain = 0;

  // Sort by amount descending first
  const sorted = [...holdings].sort((a, b) => b.amount - a.amount);

  for (const h of sorted) {
    const ratio = h.amount / totalValue;
    if (ratio >= threshold) {
      result.push({
        name: h.name,
        value: h.amount,
        color: getGainColor(h.unrealizedGain),
      });
    } else {
      othersValue += h.amount;
      othersGain += h.unrealizedGain;
    }
  }

  if (othersValue > 0) {
    result.push({
      name: "その他",
      value: othersValue,
      color: getGainColor(othersGain),
    });
  }

  return result;
}

const ALL_FILTER = "__all__";

interface HoldingsFilterContextValue {
  selectedFilter: string;
  setSelectedFilter: (value: string) => void;
}

const HoldingsFilterContext = createContext<HoldingsFilterContextValue | null>(null);

export function HoldingsFilterProvider({ children }: { children: ReactNode }) {
  const [selectedFilter, setSelectedFilter] = useState(ALL_FILTER);

  return (
    <HoldingsFilterContext value={{ selectedFilter, setSelectedFilter }}>
      {children}
    </HoldingsFilterContext>
  );
}

export function useHoldingsFilter() {
  return useContext(HoldingsFilterContext);
}

export function UnrealizedGainCardClient({
  holdings,
  filterOptions,
  hideFilter = false,
}: UnrealizedGainCardClientProps) {
  const sharedFilter = useHoldingsFilter();
  const [localFilter, setLocalFilter] = useState(ALL_FILTER);
  const selectedFilter = sharedFilter?.selectedFilter ?? localFilter;
  const setSelectedFilter = sharedFilter?.setSelectedFilter ?? setLocalFilter;

  const filteredHoldings = useMemo(() => {
    if (selectedFilter === ALL_FILTER) {
      return holdings;
    }
    // "金融機関|種別" の形式かどうかをチェック
    if (selectedFilter.includes("|")) {
      const [institution, categoryName] = selectedFilter.split("|");
      return holdings.filter(
        (h) => h.institution === institution && h.categoryName === categoryName,
      );
    }
    // 金融機関のみ
    return holdings.filter((h) => h.institution === selectedFilter);
  }, [holdings, selectedFilter]);

  const totalGain = filteredHoldings.reduce((sum, h) => sum + h.unrealizedGain, 0);
  const totalMarketValue = filteredHoldings.reduce((sum, h) => sum + h.amount, 0);
  const totalCostBasis = totalMarketValue - totalGain;

  const treemapData = groupSmallHoldings(filteredHoldings, totalMarketValue);

  const selectOptions = [{ value: ALL_FILTER, label: "すべて" }, ...filterOptions];

  // Sort by gain for top/bottom lists
  const sortedByGain = [...filteredHoldings].sort((a, b) => b.unrealizedGain - a.unrealizedGain);
  const topGainers = sortedByGain.filter((h) => h.unrealizedGain > 0).slice(0, 3);
  const topLosers = sortedByGain
    .filter((h) => h.unrealizedGain < 0)
    .slice(-3)
    .reverse();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle icon={TrendingUp}>含み損益</CardTitle>
          {!hideFilter && filterOptions.length > 1 && (
            <Select
              options={selectOptions}
              value={selectedFilter}
              onChange={setSelectedFilter}
              className="w-auto min-w-[140px] h-8 text-xs"
              aria-label="フィルターを選択"
            />
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary row */}
        <div className="grid grid-cols-3 gap-4 text-xs sm:text-sm">
          <div>
            <MetricLabel title="含み損益合計" className="text-xs sm:text-sm" />
            <AmountDisplay
              amount={totalGain}
              type="balance"
              size="lg"
              weight="bold"
              className="text-base sm:text-lg"
            />
          </div>
          <div>
            <MetricLabel title="評価額合計" className="text-xs sm:text-sm" />
            <AmountDisplay amount={totalMarketValue} size="lg" className="text-base sm:text-lg" />
          </div>
          <div>
            <MetricLabel title="取得価額合計" className="text-xs sm:text-sm" />
            <AmountDisplay amount={totalCostBasis} size="lg" className="text-base sm:text-lg" />
          </div>
        </div>

        {/* Treemap and Lists side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Treemap */}
          <div>
            <p className="text-sm font-bold mb-2">保有銘柄 (評価額)</p>
            <TreemapChart data={treemapData} height={180} />
          </div>

          {/* Holdings lists */}
          <div className="space-y-4">
            {/* Top gainers */}
            {topGainers.length > 0 && (
              <div>
                <p className="text-sm font-bold mb-2 flex items-center gap-1">
                  <TrendingUp className="h-3 w-3 text-balance-positive" />
                  含み益上位
                </p>
                <div className="space-y-1.5">
                  {topGainers.map((h, i) => (
                    <div key={`${h.name}-${i}`} className="flex items-center text-sm">
                      <span className="truncate min-w-0 flex-1">{h.name}</span>
                      <AmountDisplay
                        amount={h.unrealizedGain}
                        type="balance"
                        showSign
                        size="sm"
                        percentage={h.unrealizedGainPct ?? undefined}
                        fixedWidth
                        className="shrink-0"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Top losers */}
            {topLosers.length > 0 && (
              <div>
                <p className="text-sm font-bold mb-2 flex items-center gap-1">
                  <TrendingDown className="h-3 w-3 text-balance-negative" />
                  含み損上位
                </p>
                <div className="space-y-1.5">
                  {topLosers.map((h, i) => (
                    <div key={`${h.name}-${i}`} className="flex items-center text-sm">
                      <span className="truncate min-w-0 flex-1">{h.name}</span>
                      <AmountDisplay
                        amount={h.unrealizedGain}
                        type="balance"
                        size="sm"
                        percentage={h.unrealizedGainPct ?? undefined}
                        fixedWidth
                        className="shrink-0"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

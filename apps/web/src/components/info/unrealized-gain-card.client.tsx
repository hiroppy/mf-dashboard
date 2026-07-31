"use client";

import { TrendingDown, TrendingUp } from "lucide-react";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
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

export type GainFilter = "all" | "gain" | "loss";

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
const GAIN_FILTER_OPTIONS: Array<{ value: GainFilter; label: string }> = [
  { value: "all", label: "損益すべて" },
  { value: "gain", label: "含み益" },
  { value: "loss", label: "含み損" },
];

export function matchesGainFilter(gain: number | null, gainFilter: GainFilter): boolean {
  if (gainFilter === "all") return true;
  if (gain === null) return false;
  return gainFilter === "gain" ? gain > 0 : gain < 0;
}

export function getRankingLimit(gainFilter: GainFilter, institutionFilter: string): number {
  return gainFilter === "all" && institutionFilter === ALL_FILTER ? 3 : 6;
}

export function filterHoldings(
  holdings: HoldingData[],
  gainFilter: GainFilter,
  institutionFilter: string,
): HoldingData[] {
  return holdings.filter((holding) => {
    if (!matchesGainFilter(holding.unrealizedGain, gainFilter)) return false;

    if (institutionFilter === ALL_FILTER) return true;
    if (institutionFilter.includes("|")) {
      const [institution, categoryName] = institutionFilter.split("|");
      return holding.institution === institution && holding.categoryName === categoryName;
    }
    return holding.institution === institutionFilter;
  });
}

interface HoldingsFilterContextValue {
  selectedFilter: string;
  setSelectedFilter: (value: string) => void;
  gainFilter: GainFilter;
  setGainFilter: (value: GainFilter) => void;
}

const HoldingsFilterContext = createContext<HoldingsFilterContextValue | null>(null);

export function HoldingsFilterProvider({
  children,
  filterAvailable = true,
}: {
  children: ReactNode;
  filterAvailable?: boolean;
}) {
  const [selectedFilter, setSelectedFilter] = useState(ALL_FILTER);
  const [gainFilter, setGainFilter] = useState<GainFilter>("all");

  useEffect(() => {
    if (!filterAvailable) {
      setSelectedFilter(ALL_FILTER);
      setGainFilter("all");
    }
  }, [filterAvailable]);

  return (
    <HoldingsFilterContext value={{ selectedFilter, setSelectedFilter, gainFilter, setGainFilter }}>
      {children}
    </HoldingsFilterContext>
  );
}

export function useHoldingsFilter() {
  return useContext(HoldingsFilterContext);
}

export function HoldingsFilterReset() {
  const setSelectedFilter = useHoldingsFilter()?.setSelectedFilter;
  const setGainFilter = useHoldingsFilter()?.setGainFilter;

  useEffect(() => {
    setSelectedFilter?.(ALL_FILTER);
    setGainFilter?.("all");
  }, [setGainFilter, setSelectedFilter]);

  return null;
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
  const [localGainFilter, setLocalGainFilter] = useState<GainFilter>("all");
  const gainFilter = sharedFilter?.gainFilter ?? localGainFilter;
  const setGainFilter = sharedFilter?.setGainFilter ?? setLocalGainFilter;

  useEffect(() => {
    if (
      selectedFilter !== ALL_FILTER &&
      !filterOptions.some((option) => option.value === selectedFilter)
    ) {
      setSelectedFilter(ALL_FILTER);
    }
  }, [filterOptions, selectedFilter, setSelectedFilter]);

  const filteredHoldings = useMemo(
    () => filterHoldings(holdings, gainFilter, selectedFilter),
    [gainFilter, holdings, selectedFilter],
  );

  const totalGain = filteredHoldings.reduce((sum, h) => sum + h.unrealizedGain, 0);
  const totalMarketValue = filteredHoldings.reduce((sum, h) => sum + h.amount, 0);
  const totalCostBasis = totalMarketValue - totalGain;

  const treemapData = groupSmallHoldings(filteredHoldings, totalMarketValue);

  const selectOptions = [{ value: ALL_FILTER, label: "金融機関すべて" }, ...filterOptions];
  const rankingLimit = getRankingLimit(gainFilter, selectedFilter);

  // Sort by gain for top/bottom lists
  const sortedByGain = [...filteredHoldings].sort((a, b) => b.unrealizedGain - a.unrealizedGain);
  const topGainers = sortedByGain.filter((h) => h.unrealizedGain > 0).slice(0, rankingLimit);
  const topLosers = sortedByGain
    .filter((h) => h.unrealizedGain < 0)
    .slice(-rankingLimit)
    .reverse();

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
          <CardTitle icon={TrendingUp}>含み損益</CardTitle>
          {!hideFilter && (
            <div className="flex items-center gap-2 self-end sm:self-auto">
              <Select
                options={GAIN_FILTER_OPTIONS}
                value={gainFilter}
                onChange={(value) => setGainFilter(value as GainFilter)}
                className="w-auto min-w-[100px] h-8 text-xs"
                aria-label="損益を選択"
              />
              {filterOptions.length > 1 && (
                <Select
                  options={selectOptions}
                  value={selectedFilter}
                  onChange={setSelectedFilter}
                  className="w-auto min-w-[140px] h-8 text-xs"
                  aria-label="金融機関を選択"
                />
              )}
            </div>
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

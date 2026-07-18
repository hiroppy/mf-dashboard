"use client";

import { ChevronDown } from "lucide-react";
import { useRef, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { CHART_INITIAL_DIMENSION } from "../../lib/chart";
import { getChartColorArray } from "../../lib/colors";
import { formatCurrency, formatPercent } from "../../lib/format";
import { cn } from "../../lib/utils";
import { chartTooltipStyle } from "../charts/chart-tooltip";
import { AmountDisplay, getAmountColorClass } from "../ui/amount-display";
import { CardContent } from "../ui/card";
import { Pagination } from "../ui/pagination";

const PAGE_SIZE = 10;

interface HoldingItem {
  id: number;
  name: string;
  accountName: string | null;
  amount: number | null;
  unrealizedGain: number | null;
  unrealizedGainPct: number | null;
  dailyChange: number | null;
  avgCostPrice: number | null;
  quantity: number | null;
  unitPrice: number | null;
}

interface CategoryGroup {
  category: string;
  items: HoldingItem[];
  total: number;
}

interface HoldingsTableClientProps {
  categories: CategoryGroup[];
  hideAccountName?: boolean;
}

export function HoldingsTableClient({
  categories,
  hideAccountName = false,
}: HoldingsTableClientProps) {
  return (
    <CardContent className="space-y-4">
      {categories.map(({ category, items, total: categoryTotal }) => (
        <CategoryCard
          key={category}
          category={category}
          items={items}
          categoryTotal={categoryTotal}
          hideAccountName={hideAccountName}
        />
      ))}
    </CardContent>
  );
}

function CategoryCard({
  category,
  items,
  categoryTotal,
  hideAccountName,
}: {
  category: string;
  items: HoldingItem[];
  categoryTotal: number;
  hideAccountName: boolean;
}) {
  const [currentPage, setCurrentPage] = useState(0);
  const scrollTargetRef = useRef<HTMLDivElement>(null);
  const totalPages = Math.ceil(items.length / PAGE_SIZE);

  // Colors are generated for all items (for chart consistency)
  const colors = getChartColorArray(items.length);

  const chartData = items.map((item, i) => ({
    name: item.name,
    value: item.amount || 0,
    color: colors[i],
  }));

  // Paginate items for the list display
  const startIndex = currentPage * PAGE_SIZE;
  const paginatedItems = items.slice(startIndex, startIndex + PAGE_SIZE);

  return (
    <div
      ref={scrollTargetRef}
      className="rounded-lg border border-border overflow-hidden scroll-mt-20"
    >
      {/* Category header */}
      <div className="flex flex-col gap-0.5 px-4 py-2.5 bg-muted/50 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
        <div className="flex items-center gap-2">
          <span className="font-bold text-foreground">{category}</span>
          <span className="text-sm text-muted-foreground">({items.length}件)</span>
        </div>
        <AmountDisplay amount={categoryTotal} weight="bold" />
      </div>

      {/* Chart + Legend area */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-6 p-4">
        {/* Donut chart */}
        <div className="w-56 h-56 shrink-0 self-center sm:self-auto">
          <ResponsiveContainer
            width="100%"
            height="100%"
            initialDimension={CHART_INITIAL_DIMENSION}
          >
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                dataKey="value"
                strokeWidth={0}
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => formatCurrency(value as number)}
                contentStyle={chartTooltipStyle}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Holdings list */}
        <div className="flex-1 min-w-0">
          <div className="space-y-3 mb-4">
            {paginatedItems.map((holding, i) => {
              const originalIndex = startIndex + i;
              const ratio = categoryTotal > 0 ? ((holding.amount || 0) / categoryTotal) * 100 : 0;

              return (
                <HoldingRow
                  key={holding.id}
                  holding={holding}
                  color={colors[originalIndex]}
                  ratio={ratio}
                  hideAccountName={hideAccountName}
                />
              );
            })}
          </div>

          {/* Pagination */}
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={PAGE_SIZE}
            totalItems={items.length}
            onPageChange={setCurrentPage}
            scrollTargetRef={scrollTargetRef}
          />
        </div>
      </div>
    </div>
  );
}

function HoldingRow({
  holding,
  color,
  ratio,
  hideAccountName,
}: {
  holding: HoldingItem;
  color: string;
  ratio: number;
  hideAccountName: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const hasMainDetails =
    holding.unrealizedGain !== null ||
    holding.unrealizedGainPct !== null ||
    holding.dailyChange !== null;

  // 展開時に表示するコンテンツがあるかどうかで判定
  const hasExpandableContent =
    holding.avgCostPrice !== null ||
    holding.unitPrice !== null ||
    holding.quantity !== null ||
    (!hideAccountName && holding.accountName !== null);

  const isClickable = hasExpandableContent;

  return (
    <div className="text-sm">
      {/* Main row */}
      {isClickable ? (
        <button
          type="button"
          className="flex items-center gap-2 w-full text-left cursor-pointer"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: color }}
          />
          <span className="font-medium flex-1 min-w-0 truncate">{holding.name}</span>
          <div className="flex items-center gap-1 shrink-0">
            <div className="text-right tabular-nums">
              {holding.amount ? (
                <AmountDisplay
                  amount={holding.amount}
                  weight="semibold"
                  percentage={ratio}
                  percentageDecimals={1}
                  fixedWidth
                  percentageClassName="hidden sm:inline-block"
                />
              ) : (
                "-"
              )}
            </div>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform",
                isExpanded && "rotate-180",
              )}
            />
          </div>
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <div
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: color }}
          />
          <span className="font-medium flex-1 min-w-0 truncate">{holding.name}</span>
          <div className="text-right shrink-0 tabular-nums">
            {holding.amount ? (
              <AmountDisplay
                amount={holding.amount}
                weight="semibold"
                percentage={ratio}
                percentageDecimals={1}
                fixedWidth
              />
            ) : (
              "-"
            )}
          </div>
        </div>
      )}

      {/* Main details (always visible): 含み損益、評価損益率、前日比、割合（モバイルのみ） */}
      {hasMainDetails && (
        <div className="pl-[18px] pt-1.5">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3 lg:grid-cols-4">
            {holding.unrealizedGain !== null && (
              <div className="flex flex-col">
                <span className="text-muted-foreground">含み損益</span>
                <AmountDisplay
                  amount={holding.unrealizedGain}
                  type="balance"
                  showSign
                  size="sm"
                  className="tabular-nums"
                />
              </div>
            )}
            {holding.unrealizedGainPct !== null && (
              <div className="flex flex-col">
                <span className="text-muted-foreground">評価損益率</span>
                <span
                  className={cn(
                    "font-medium tabular-nums",
                    getAmountColorClass({ value: holding.unrealizedGainPct, type: "balance" }),
                  )}
                >
                  {formatPercent(holding.unrealizedGainPct)}
                </span>
              </div>
            )}
            {holding.dailyChange !== null && (
              <div className="flex flex-col">
                <span className="text-muted-foreground">前日比</span>
                <AmountDisplay
                  amount={holding.dailyChange}
                  type="balance"
                  showSign
                  size="sm"
                  className="tabular-nums"
                />
              </div>
            )}
            <div className="sm:hidden">
              <DetailItem label="割合" value={formatPercent(ratio)} />
            </div>
          </div>
        </div>
      )}

      {/* Expandable details */}
      {isClickable && isExpanded && (
        <div className="pl-[18px] pt-1.5">
          {hasMainDetails ? (
            // 含み損益等がある場合：平均取得単価、現在単価、数量、保有金融機関
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3 lg:grid-cols-4">
              {holding.avgCostPrice !== null && (
                <DetailItem label="平均取得単価" value={holding.avgCostPrice.toLocaleString()} />
              )}
              {holding.unitPrice !== null && (
                <DetailItem label="現在単価" value={holding.unitPrice.toLocaleString()} />
              )}
              {holding.quantity !== null && (
                <DetailItem label="数量" value={holding.quantity.toLocaleString()} />
              )}
              {!hideAccountName && holding.accountName && (
                <DetailItem label="保有金融機関" value={holding.accountName} truncate />
              )}
            </div>
          ) : (
            // 含み損益等がない場合：割合（モバイルのみ）と保有金融機関を横並び
            <div className="flex gap-x-4 text-sm">
              <div className="sm:hidden">
                <DetailItem label="割合" value={formatPercent(ratio)} />
              </div>
              {!hideAccountName && holding.accountName && (
                <DetailItem label="保有金融機関" value={holding.accountName} truncate />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DetailItem({
  label,
  value,
  valueClassName,
  truncate,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  truncate?: boolean;
}) {
  return (
    <div className={cn("flex flex-col", truncate && "min-w-0")}>
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-medium tabular-nums", truncate && "truncate", valueClassName)}>
        {value}
      </span>
    </div>
  );
}

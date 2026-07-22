"use client";

import { ChevronDown, List, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { CHART_INITIAL_DIMENSION } from "../../../lib/chart";
import { getChartColorArray } from "../../../lib/colors";
import { formatCurrency, formatDateShort } from "../../../lib/format";
import { cn } from "../../../lib/utils";
import { chartTooltipStyle } from "../../charts/chart-tooltip";
import { AmountDisplay, getAmountColorClass } from "../../ui/amount-display";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { CategoryAccordion } from "./category-accordion";
import type { CategoryData, SubCategoryData } from "./types";
import { useCategoryExpansion } from "./use-category-expansion";

interface CategoryBreakdownClientProps {
  title: string;
  icon?: LucideIcon;
  data: CategoryData[];
  type: "income" | "expense";
  prevAmountByCategory?: Record<string, number>;
}

export function CategoryBreakdownClient({
  title,
  icon,
  data,
  type,
  prevAmountByCategory,
}: CategoryBreakdownClientProps) {
  const { toggleCategory, toggleSubCategory, isCategoryExpanded, isSubCategoryExpanded } =
    useCategoryExpansion();

  const total = data.reduce((sum, item) => sum + item.amount, 0);
  const hasPrevData = !!(prevAmountByCategory && Object.keys(prevAmountByCategory).length > 0);

  // Calculate total delta
  const totalDelta = hasPrevData
    ? total - Object.values(prevAmountByCategory!).reduce((s, v) => s + v, 0)
    : null;

  // For income, use sub-categories for chart (since there's only one large category)
  const incomeSubCategories =
    type === "income"
      ? data.flatMap((item) => item.subCategories ?? []).sort((a, b) => b.amount - a.amount)
      : [];
  const incomeChartData = incomeSubCategories.map((sub) => ({
    name: sub.subCategory,
    value: sub.amount,
  }));
  const incomeChartTotal = incomeSubCategories.reduce((sum, sub) => sum + sub.amount, 0);
  const incomeColors = getChartColorArray(incomeChartData.length);

  return (
    <Card>
      <CardHeader>
        <CardTitle icon={icon ?? List}>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {type === "income" && incomeChartData.length > 0 ? (
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6">
            <div className="w-32 h-32 shrink-0">
              <ResponsiveContainer
                width="100%"
                height="100%"
                initialDimension={CHART_INITIAL_DIMENSION}
              >
                <PieChart>
                  <Pie
                    data={incomeChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={35}
                    outerRadius={60}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {incomeChartData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={incomeColors[index]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => formatCurrency(value as number)}
                    contentStyle={chartTooltipStyle}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 min-w-0 w-full space-y-3 text-sm">
              {incomeSubCategories.map((sub, index) => (
                <IncomeSubCategoryRow
                  key={sub.subCategory}
                  subCategory={sub}
                  color={incomeColors[index]}
                  total={incomeChartTotal}
                  isExpanded={isSubCategoryExpanded(sub.subCategory)}
                  onToggle={() => toggleSubCategory(sub.subCategory)}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {data.map((item) => (
              <CategoryAccordion
                key={item.category}
                item={item}
                total={total}
                type={type}
                prevAmount={prevAmountByCategory?.[item.category]}
                hasPrevData={hasPrevData}
                isExpanded={isCategoryExpanded(item.category)}
                onToggle={() => toggleCategory(item.category)}
                isSubCategoryExpanded={isSubCategoryExpanded}
                onToggleSubCategory={toggleSubCategory}
              />
            ))}
          </div>
        )}
        <div className="mt-4 pt-4 border-t flex justify-end items-center">
          <div className="flex items-center gap-3">
            <AmountDisplay amount={total} type={type} size="lg" weight="bold" />
            {totalDelta !== null && totalDelta !== 0 && (
              <span className="flex items-center gap-0.5 text-sm">
                {totalDelta > 0 ? (
                  <TrendingUp
                    className={cn(
                      "h-3 w-3",
                      getAmountColorClass({
                        value: totalDelta,
                        type: "balance",
                        inverse: type === "expense",
                      }),
                    )}
                  />
                ) : (
                  <TrendingDown
                    className={cn(
                      "h-3 w-3",
                      getAmountColorClass({
                        value: totalDelta,
                        type: "balance",
                        inverse: type === "expense",
                      }),
                    )}
                  />
                )}
                <AmountDisplay
                  amount={totalDelta}
                  type="balance"
                  inverse={type === "expense"}
                  size="sm"
                />
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function IncomeSubCategoryRow({
  subCategory,
  color,
  total,
  isExpanded,
  onToggle,
}: {
  subCategory: SubCategoryData;
  color: string;
  total: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const percentage = total > 0 ? (subCategory.amount / total) * 100 : 0;
  const hasTransactions = subCategory.transactions.length > 0;

  return (
    <div className="text-sm">
      {hasTransactions ? (
        <button
          type="button"
          className="flex items-center gap-2 w-full text-left cursor-pointer"
          onClick={onToggle}
        >
          <div
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: color }}
          />
          <span className="font-medium flex-1 min-w-0 truncate">{subCategory.subCategory}</span>
          <div className="flex items-center gap-1 shrink-0">
            <AmountDisplay
              amount={subCategory.amount}
              type="income"
              weight="semibold"
              percentage={percentage}
              percentageDecimals={0}
              fixedWidth
              percentageClassName="hidden sm:inline-block"
            />
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
          <span className="font-medium flex-1 min-w-0 truncate">{subCategory.subCategory}</span>
          <div className="shrink-0">
            <AmountDisplay
              amount={subCategory.amount}
              type="income"
              weight="semibold"
              percentage={percentage}
              percentageDecimals={0}
              fixedWidth
            />
          </div>
        </div>
      )}

      {/* Transaction list */}
      {hasTransactions && isExpanded && (
        <div className="pl-[18px] pt-1.5 space-y-1">
          {subCategory.transactions.map((tx, idx) => (
            <div
              key={`${tx.date}-${tx.description}-${idx}`}
              className="flex items-center justify-between text-sm text-muted-foreground"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="shrink-0">{formatDateShort(tx.date)}</span>
                <span className="truncate">{tx.description}</span>
              </div>
              <AmountDisplay
                amount={tx.amount}
                type="income"
                size="sm"
                className="shrink-0 ml-2 tabular-nums"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export type { CategoryData };

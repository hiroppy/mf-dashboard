"use client";

import { ResponsiveSankey } from "@nivo/sankey";
import { GitBranch } from "lucide-react";
import { useEffect, useState } from "react";
import { getCategoryColor, semanticColors } from "../../lib/colors";
import { ChartTooltipContent } from "../charts/chart-tooltip";
import { AmountDisplay } from "../ui/amount-display";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { EmptyState } from "../ui/empty-state";

interface SankeyDiagramClientProps {
  income: Array<{ category: string; amount: number }>;
  expense: Array<{ category: string; amount: number }>;
  height?: number;
}

export function SankeyDiagramClient({ income, expense, height = 600 }: SankeyDiagramClientProps) {
  const totalIncome = income.reduce((sum, i) => sum + i.amount, 0);
  const totalExpense = expense.reduce((sum, e) => sum + e.amount, 0);
  const balance = totalIncome - totalExpense;
  const totalFlow = Math.max(totalIncome, totalExpense);

  if (totalIncome === 0 && totalExpense === 0) {
    return (
      <EmptyState icon={GitBranch} title="キャッシュフロー" message="データが不足しています" />
    );
  }

  // Build 3-column sankey data
  // Column 1: 収入カテゴリ (individual income sources)
  // Column 2: 収入支出 (central total)
  // Column 3: 支出カテゴリ (individual expense categories) + 収支
  // Note: Use ASCII-only IDs for Safari SVG gradient compatibility
  const buildSankeyData = () => {
    const nodes: Array<{ id: string; color: string }> = [];
    const links: Array<{ source: string; target: string; value: number }> = [];
    const labelMap = new Map<string, string>();

    const centralNodeId = "n-central";
    const balanceNodeId = "n-balance";
    const deficitNodeId = "n-deficit";

    labelMap.set(centralNodeId, "収入支出");
    labelMap.set(balanceNodeId, "収支");
    labelMap.set(deficitNodeId, "赤字");

    // Column 1: Income categories → Column 2: central
    income.forEach((item, index) => {
      const nodeId = `n-in-${index}`;
      labelMap.set(nodeId, item.category);
      nodes.push({
        id: nodeId,
        color: semanticColors.income,
      });
      links.push({
        source: nodeId,
        target: centralNodeId,
        value: item.amount,
      });
    });

    // Column 2: central (収入支出)
    nodes.push({ id: centralNodeId, color: semanticColors.transfer });

    // Handle balance (positive = savings, negative = deficit)
    if (balance > 0) {
      // Positive balance: central → balance
      nodes.push({ id: balanceNodeId, color: semanticColors.balancePositive });
      links.push({
        source: centralNodeId,
        target: balanceNodeId,
        value: balance,
      });
    } else if (balance < 0) {
      // Deficit: Need additional source to fund expenses
      nodes.push({ id: deficitNodeId, color: semanticColors.balanceNegative });
      links.push({
        source: deficitNodeId,
        target: centralNodeId,
        value: Math.abs(balance),
      });
    }

    // Column 3: central → Expense categories
    expense.forEach((item, index) => {
      const nodeId = `n-out-${index}`;
      labelMap.set(nodeId, item.category);
      nodes.push({
        id: nodeId,
        color: getCategoryColor(item.category),
      });
      links.push({
        source: centralNodeId,
        target: nodeId,
        value: item.amount,
      });
    });

    return { nodes, links, labelMap };
  };

  const sankeyData = buildSankeyData();

  // Animate on mount: start with zero-value links, then transition to real data
  const initialData = {
    nodes: sankeyData.nodes,
    links: sankeyData.links.map((l) => ({ ...l, value: 1 })),
  };
  const [data, setData] = useState(initialData);

  useEffect(() => {
    const id = requestAnimationFrame(() =>
      setData({ nodes: sankeyData.nodes, links: sankeyData.links }),
    );
    return () => cancelAnimationFrame(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Color mapping for nodes
  const nodeColorMap = new Map(sankeyData.nodes.map((n) => [n.id, n.color]));

  // Custom label for nodes
  const getLabel = (id: string) => {
    return sankeyData.labelMap.get(id) || id;
  };

  // Calculate percentage for each node
  const getPercentage = (id: string, value: number): string => {
    if (id.startsWith("n-in-")) {
      return totalIncome > 0 ? ((value / totalIncome) * 100).toFixed(0) : "0";
    } else if (id.startsWith("n-out-")) {
      return totalExpense > 0 ? ((value / totalExpense) * 100).toFixed(0) : "0";
    } else if (id === "n-central") {
      return "100";
    } else if (id === "n-balance") {
      return totalFlow > 0 ? ((balance / totalFlow) * 100).toFixed(0) : "0";
    } else if (id === "n-deficit") {
      return totalFlow > 0 ? ((Math.abs(balance) / totalFlow) * 100).toFixed(0) : "0";
    }
    return "100";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle icon={GitBranch}>キャッシュフロー</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6">
          <div
            className="p-3 sm:p-4 rounded-lg border"
            style={{
              borderColor: semanticColors.income,
              backgroundColor: `color-mix(in srgb, ${semanticColors.income} 10%, transparent)`,
            }}
          >
            <div className="text-xs sm:text-sm font-medium text-foreground">収入総額</div>
            <AmountDisplay
              amount={totalIncome}
              type="income"
              size="2xl"
              weight="bold"
              className="text-lg sm:text-2xl"
            />
          </div>
          <div
            className="p-3 sm:p-4 rounded-lg border"
            style={{
              borderColor: semanticColors.expense,
              backgroundColor: `color-mix(in srgb, ${semanticColors.expense} 10%, transparent)`,
            }}
          >
            <div className="text-xs sm:text-sm font-medium text-foreground">支出総額</div>
            <AmountDisplay
              amount={totalExpense}
              type="expense"
              size="2xl"
              weight="bold"
              className="text-lg sm:text-2xl"
            />
          </div>
          <div
            className="p-3 sm:p-4 rounded-lg border"
            style={{
              borderColor:
                balance >= 0 ? semanticColors.balancePositive : semanticColors.balanceNegative,
              backgroundColor: `color-mix(in srgb, ${balance >= 0 ? semanticColors.balancePositive : semanticColors.balanceNegative} 10%, transparent)`,
            }}
          >
            <div className="text-xs sm:text-sm font-medium text-foreground">
              {balance >= 0 ? "収支" : "赤字"}
            </div>
            <AmountDisplay
              amount={balance}
              type="balance"
              size="2xl"
              weight="bold"
              className="text-lg sm:text-2xl"
            />
          </div>
        </div>

        {/* Sankey diagram */}
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="キャッシュフロー図">
          <div className="min-w-150" style={{ height }}>
            <ResponsiveSankey
              data={data}
              ariaLabel="キャッシュフロー図"
              margin={{ top: 20, right: 160, bottom: 20, left: 160 }}
              align="justify"
              colors={(node) => nodeColorMap.get(node.id as string) || "#6b7280"}
              nodeOpacity={1}
              nodeHoverOpacity={1}
              nodeThickness={20}
              nodeSpacing={24}
              nodeBorderWidth={0}
              nodeBorderRadius={3}
              linkOpacity={0.5}
              linkHoverOpacity={0.8}
              linkContract={3}
              enableLinkGradient={true}
              labelPosition="outside"
              labelOrientation="horizontal"
              labelPadding={16}
              labelTextColor={{ from: "color", modifiers: [["darker", 1.2]] }}
              label={(node) => {
                const id = node.id as string;
                const label = getLabel(id);
                const value = node.value || 0;
                const pct = getPercentage(id, value);

                return `${label} ${pct}%`;
              }}
              nodeTooltip={({ node }) => (
                <ChartTooltipContent>
                  <strong>{getLabel(node.id as string)}</strong>
                  <br />
                  <AmountDisplay amount={node.value || 0} />
                </ChartTooltipContent>
              )}
              linkTooltip={({ link }) => (
                <ChartTooltipContent>
                  <strong>{getLabel(link.source.id as string)}</strong>
                  {" → "}
                  <strong>{getLabel(link.target.id as string)}</strong>
                  <br />
                  <AmountDisplay amount={link.value} />
                </ChartTooltipContent>
              )}
            />
          </div>
        </div>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap gap-4 justify-center text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: semanticColors.income }} />
            <span>収入</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded" style={{ backgroundColor: semanticColors.expense }} />
            <span>支出</span>
          </div>
          {balance >= 0 ? (
            <div className="flex items-center gap-2">
              <div
                className="w-4 h-4 rounded"
                style={{ backgroundColor: semanticColors.balancePositive }}
              />
              <span>黒字</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div
                className="w-4 h-4 rounded"
                style={{ backgroundColor: semanticColors.balanceNegative }}
              />
              <span>赤字</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

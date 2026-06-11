"use client";

import { Calculator, CircleHelp, ClipboardCopy } from "lucide-react";
import { Fragment, useMemo, useRef, useState } from "react";
import {
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Line,
  ComposedChart,
  ReferenceLine,
} from "recharts";
import { formatCurrency } from "../../../lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { MetricLabel } from "../../ui/metric-label";
import { NumberField } from "../../ui/number-field";
import { Select } from "../../ui/select";
import { Slider } from "../../ui/slider";
import { Switch } from "../../ui/switch";
import { Tooltip as UiTooltip } from "../../ui/tooltip";
import { chartTooltipStyle } from "../chart-tooltip";
import {
  getLabelMap,
  selectMilestones,
  computeSummaryYear,
  computeMonthlyWithdrawalForSummary,
  computeMcDrawdownEndValue,
  computeTotalWithdrawalAmount,
  buildFanChartData,
  computeTotalYears,
  computeWithdrawalMilestones,
  computeSecurityScore,
  computeRateWithdrawalBasis,
} from "./compound-simulator-utils";
import { generateSummary } from "./generate-summary";
import { adjustedPension } from "./pension-utils";
import { SecurityScore } from "./security-score";
import { SensitivityTable } from "./sensitivity-table";
import { useCompoundCalculator } from "./use-compound-calculator";
import { useMonteCarloSimulator } from "./use-monte-carlo-simulator";

function envNum(value: string | undefined): number | undefined {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  return Number.isNaN(n) ? undefined : n;
}

interface PortfolioContext {
  initialAmountSource?: string;
  monthlyContributionSource?: string;
  annualReturnRateSource?: string;
  currentTotalAssets?: number;
  savingsRate?: number;
}

type WithdrawalMode = "rate" | "amount";

interface CompoundSimulatorProps {
  defaultInitialAmount?: number;
  defaultMonthlyContribution?: number;
  defaultAnnualReturnRate?: number;
  defaultInflationRate?: number;
  defaultWithdrawalMode?: WithdrawalMode;
  defaultWithdrawalRate?: number;
  defaultMonthlyWithdrawal?: number;
  defaultWithdrawalYears?: number;
  defaultCurrentAge?: number;
  defaultContributionYears?: number;
  defaultWithdrawalStartYear?: number;
  defaultExpenseRatio?: number;
  defaultVolatility?: number;
  defaultBasePension?: number;
  defaultPensionStartAge?: number;
  defaultMonthlyOtherIncome?: number;
  title?: string;
  portfolioContext?: PortfolioContext;
}

type PhaseType = "contribution" | "idle" | "withdrawal" | "overlap";

function buildTimelineSegments(
  contributionYears: number,
  withdrawalStartYear: number,
  withdrawalYears: number,
): Array<{ type: PhaseType; start: number; end: number }> {
  const withdrawalEnd = withdrawalStartYear + withdrawalYears;
  const totalYears = Math.max(contributionYears, withdrawalEnd);
  const segments: Array<{ type: PhaseType; start: number; end: number }> = [];

  for (let y = 0; y < totalYears; y++) {
    const isContrib = y < contributionYears;
    const isWithdraw = withdrawalYears > 0 && y >= withdrawalStartYear && y < withdrawalEnd;

    let type: PhaseType;
    if (isContrib && isWithdraw) type = "overlap";
    else if (isContrib) type = "contribution";
    else if (isWithdraw) type = "withdrawal";
    else type = "idle";

    const last = segments.at(-1);
    if (last && last.type === type) {
      last.end = y + 1;
    } else {
      segments.push({ type, start: y, end: y + 1 });
    }
  }

  return segments;
}

const phaseChipStyles: Record<PhaseType, string> = {
  contribution: "bg-blue-50 text-blue-800",
  idle: "bg-gray-100 text-gray-600",
  withdrawal: "bg-orange-50 text-orange-800",
  overlap: "bg-purple-50 text-purple-800",
};

const phaseLabels: Record<PhaseType, string> = {
  contribution: "積立",
  idle: "据え置き",
  withdrawal: "切り崩し",
  overlap: "積立+切り崩し",
};

function TimelinePhaseChips({
  contributionYears,
  withdrawalStartYear,
  withdrawalYears,
  currentYear,
  currentAge,
}: {
  contributionYears: number;
  withdrawalStartYear: number;
  withdrawalYears: number;
  currentYear: number;
  currentAge?: number;
}) {
  const segments = buildTimelineSegments(contributionYears, withdrawalStartYear, withdrawalYears);
  if (segments.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1.5 text-xs">
      {segments.map((seg, i) => {
        const years = seg.end - seg.start;
        const period =
          currentAge != null
            ? `${currentAge + seg.start}〜${currentAge + seg.end}歳`
            : `${currentYear + seg.start}〜${currentYear + seg.end}`;
        return (
          <Fragment key={`${seg.type}-${seg.start}`}>
            {i > 0 && <span className="text-muted-foreground/40">→</span>}
            <span
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 ${phaseChipStyles[seg.type]}`}
            >
              <span className="inline-flex items-center">
                {phaseLabels[seg.type]}
                {seg.type === "idle" && (
                  <UiTooltip
                    content="追加投資せず、既存の資産を運用のみ続ける期間"
                    aria-label="据え置きの説明"
                  >
                    <CircleHelp className="ml-0.5 h-3 w-3 text-muted-foreground/60" />
                  </UiTooltip>
                )}
              </span>
              <span className="tabular-nums">{years}年</span>
              <span className="text-muted-foreground tabular-nums">({period})</span>
            </span>
          </Fragment>
        );
      })}
    </div>
  );
}

type DragHandle = "contribution" | "withdrawalStart" | "withdrawalEnd";

function InteractiveTimelineBar({
  contributionYears,
  withdrawalStartYear,
  withdrawalYears,
  onContributionYearsChange,
  onWithdrawalStartYearChange,
  onWithdrawalYearsChange,
  currentAge,
}: {
  contributionYears: number;
  withdrawalStartYear: number;
  withdrawalYears: number;
  onContributionYearsChange: (v: number) => void;
  onWithdrawalStartYearChange: (v: number) => void;
  onWithdrawalYearsChange: (v: number) => void;
  currentAge?: number;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<DragHandle | null>(null);
  const [activeDrag, setActiveDrag] = useState<DragHandle | null>(null);

  const displayMax = 70;
  const currentYear = new Date().getFullYear();
  const withdrawalEnd = withdrawalStartYear + withdrawalYears;

  const yearToPercent = (year: number) => (year / displayMax) * 100;

  function getYearFromClientX(clientX: number) {
    if (!barRef.current) return 0;
    const rect = barRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round(ratio * displayMax);
  }

  const segments = buildTimelineSegments(contributionYears, withdrawalStartYear, withdrawalYears);

  const barColorMap: Record<PhaseType, string> = {
    contribution: "bg-blue-700",
    withdrawal: "bg-orange-700",
    overlap: "bg-purple-700",
    idle: "bg-gray-600",
  };

  const handles: Array<{ id: DragHandle; pos: number; color: string }> = [
    { id: "contribution", pos: contributionYears, color: "bg-blue-700" },
    { id: "withdrawalStart", pos: withdrawalStartYear, color: "bg-orange-700" },
    { id: "withdrawalEnd", pos: withdrawalEnd, color: "bg-orange-700" },
  ];

  function handlePointerDown(e: React.PointerEvent) {
    if (!barRef.current) return;
    const year = getYearFromClientX(e.clientX);

    let closest = handles[0];
    for (const h of handles) {
      if (Math.abs(year - h.pos) < Math.abs(year - closest.pos)) {
        closest = h;
      }
    }

    e.preventDefault();
    barRef.current.setPointerCapture(e.pointerId);
    draggingRef.current = closest.id;
    setActiveDrag(closest.id);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!draggingRef.current) return;
    const year = getYearFromClientX(e.clientX);

    switch (draggingRef.current) {
      case "contribution":
        onContributionYearsChange(Math.max(0, Math.min(displayMax, year)));
        break;
      case "withdrawalStart":
        onWithdrawalStartYearChange(Math.max(0, Math.min(displayMax - 5, year)));
        break;
      case "withdrawalEnd": {
        const newYears = year - withdrawalStartYear;
        onWithdrawalYearsChange(Math.max(5, Math.min(displayMax - withdrawalStartYear, newYears)));
        break;
      }
    }
  }

  function handlePointerUp() {
    draggingRef.current = null;
    setActiveDrag(null);
  }

  return (
    <div className="space-y-1">
      <div
        ref={barRef}
        className={`relative h-9 w-full overflow-hidden rounded-md bg-muted select-none touch-none ${activeDrag ? "cursor-col-resize" : "cursor-pointer"}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        aria-label="タイムライン設定"
      >
        {segments.map((seg) => {
          const widthPercent = yearToPercent(seg.end - seg.start);
          const years = seg.end - seg.start;
          return (
            <div
              key={`${seg.type}-${seg.start}`}
              className={`absolute top-0 h-full flex items-center justify-center text-xs font-medium text-white ${barColorMap[seg.type]}`}
              style={{
                left: `${yearToPercent(seg.start)}%`,
                width: `${widthPercent}%`,
              }}
            >
              {widthPercent > 12 ? `${phaseLabels[seg.type]} ${years}年` : ""}
            </div>
          );
        })}
        {handles.map((h) => (
          <div
            key={h.id}
            className="absolute top-0 h-full pointer-events-none"
            style={{ left: `${yearToPercent(h.pos)}%` }}
          >
            <div
              className={`absolute -translate-x-1/2 top-0 h-full ${activeDrag === h.id ? "w-1" : "w-0.5"} ${h.color} transition-[width]`}
            />
            <div
              className={`absolute -translate-x-1/2 top-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow ${activeDrag === h.id ? "h-4 w-4" : "h-3 w-3"} ${h.color} transition-[width,height]`}
            />
          </div>
        ))}
      </div>
      <div className="relative h-5 text-xs text-muted-foreground">
        <span className="absolute left-0">
          {currentAge != null ? `${currentAge}歳` : `${currentYear}年`}
        </span>
        {handles.map((h) => {
          const pct = yearToPercent(h.pos);
          if (pct < 3 || pct > 97) return null;
          return (
            <span
              key={h.id}
              className="absolute -translate-x-1/2 font-medium"
              style={{ left: `${pct}%` }}
            >
              {currentAge != null ? `${currentAge + h.pos}歳` : `${currentYear + h.pos}年`}
            </span>
          );
        })}
        <span className="absolute right-0">
          {currentAge != null ? `${currentAge + displayMax}歳` : `${currentYear + displayMax}年`}
        </span>
      </div>
      <TimelinePhaseChips
        contributionYears={contributionYears}
        withdrawalStartYear={withdrawalStartYear}
        withdrawalYears={withdrawalYears}
        currentYear={currentYear}
        currentAge={currentAge}
      />
    </div>
  );
}

const PRODUCT_PRESETS = [
  { value: "custom", label: "カスタム" },
  {
    value: "all-country",
    label: "オルカン",
    annualReturnRate: 7.5,
    expenseRatio: 0.05775,
    volatility: 15,
  },
  {
    value: "sp500",
    label: "S&P 500",
    annualReturnRate: 10,
    expenseRatio: 0.0814,
    volatility: 18,
  },
  {
    value: "qqq",
    label: "QQQ",
    annualReturnRate: 12,
    expenseRatio: 0.2,
    volatility: 22,
  },
  {
    value: "nikkei225",
    label: "日経平均",
    annualReturnRate: 7.5,
    expenseRatio: 0.143,
    volatility: 20,
  },
  {
    value: "topix",
    label: "TOPIX",
    annualReturnRate: 6,
    expenseRatio: 0.143,
    volatility: 18,
  },
] as const;

export function CompoundSimulator({
  defaultInitialAmount = envNum(process.env.NEXT_PUBLIC_SIMULATOR_INITIAL_AMOUNT) ?? 0,
  defaultMonthlyContribution = envNum(process.env.NEXT_PUBLIC_SIMULATOR_MONTHLY_CONTRIBUTION) ?? 0,
  defaultAnnualReturnRate = envNum(process.env.NEXT_PUBLIC_SIMULATOR_ANNUAL_RETURN_RATE) ?? 5,
  defaultInflationRate = envNum(process.env.NEXT_PUBLIC_SIMULATOR_INFLATION_RATE) ?? 2,
  defaultWithdrawalMode = (process.env.NEXT_PUBLIC_SIMULATOR_WITHDRAWAL_MODE === "rate"
    ? "rate"
    : "amount") as WithdrawalMode,
  defaultWithdrawalRate = envNum(process.env.NEXT_PUBLIC_SIMULATOR_WITHDRAWAL_RATE) ?? 4,
  defaultMonthlyWithdrawal = envNum(process.env.NEXT_PUBLIC_SIMULATOR_MONTHLY_WITHDRAWAL) ?? 250000,
  defaultWithdrawalYears = envNum(process.env.NEXT_PUBLIC_SIMULATOR_WITHDRAWAL_YEARS) ?? 30,
  defaultCurrentAge = envNum(process.env.NEXT_PUBLIC_SIMULATOR_CURRENT_AGE),
  defaultContributionYears = envNum(process.env.NEXT_PUBLIC_SIMULATOR_CONTRIBUTION_YEARS) ?? 30,
  defaultWithdrawalStartYear = envNum(process.env.NEXT_PUBLIC_SIMULATOR_WITHDRAWAL_START_YEAR) ??
    30,
  defaultExpenseRatio = envNum(process.env.NEXT_PUBLIC_SIMULATOR_EXPENSE_RATIO) ?? 0.1,
  defaultVolatility = envNum(process.env.NEXT_PUBLIC_SIMULATOR_VOLATILITY) ?? 15,
  defaultBasePension = envNum(process.env.NEXT_PUBLIC_SIMULATOR_BASE_PENSION) ?? 0,
  defaultPensionStartAge = envNum(process.env.NEXT_PUBLIC_SIMULATOR_PENSION_START_AGE) ?? 65,
  defaultMonthlyOtherIncome = envNum(process.env.NEXT_PUBLIC_SIMULATOR_MONTHLY_OTHER_INCOME) ?? 0,
  title = "複利シミュレーター",
  portfolioContext,
}: CompoundSimulatorProps) {
  const [initialAmount, setInitialAmount] = useState(defaultInitialAmount);
  const [monthlyContribution, setMonthlyContribution] = useState(defaultMonthlyContribution);
  const [annualReturnRate, setAnnualReturnRate] = useState(defaultAnnualReturnRate);
  const [expenseRatio, setExpenseRatio] = useState(defaultExpenseRatio);
  const [inflationRate, setInflationRate] = useState(defaultInflationRate);
  const [contributionYears, setContributionYears] = useState(defaultContributionYears);
  const [withdrawalStartYear, setWithdrawalStartYear] = useState(defaultWithdrawalStartYear);
  const [withdrawalYears, setWithdrawalYears] = useState(defaultWithdrawalYears);
  const [volatility, setVolatility] = useState(defaultVolatility);
  const [taxFree, setTaxFree] = useState(false);
  const [withdrawalMode, setWithdrawalMode] = useState<WithdrawalMode>(defaultWithdrawalMode);
  const [withdrawalRate, setWithdrawalRate] = useState(defaultWithdrawalRate);
  const [fixedMonthlyWithdrawal, setFixedMonthlyWithdrawal] = useState(defaultMonthlyWithdrawal);
  const [inflationAdjustedWithdrawal, setInflationAdjustedWithdrawal] = useState(false);
  const [currentAge, setCurrentAge] = useState<number | undefined>(defaultCurrentAge);
  const [selectedPreset, setSelectedPreset] = useState("custom");
  const [basePension, setBasePension] = useState(defaultBasePension);
  const [pensionStartAge, setPensionStartAge] = useState(defaultPensionStartAge);
  const [monthlyOtherIncome, setMonthlyOtherIncome] = useState(defaultMonthlyOtherIncome);
  const [drawdownPercentile, setDrawdownPercentile] = useState<
    "p10" | "p25" | "p50" | "p75" | "p90"
  >("p50");

  const PENSION_NET_RATE = 0.85;
  const adjustedMonthlyPension = useMemo(
    () => Math.round(adjustedPension(basePension, pensionStartAge) * PENSION_NET_RATE),
    [basePension, pensionStartAge],
  );
  const pensionStartYear = useMemo(
    () => (currentAge != null ? Math.max(0, pensionStartAge - currentAge) : undefined),
    [currentAge, pensionStartAge],
  );

  const handlePresetChange = (value: string) => {
    setSelectedPreset(value);
    const preset = PRODUCT_PRESETS.find((p) => p.value === value);
    if (preset && "annualReturnRate" in preset) {
      setAnnualReturnRate(preset.annualReturnRate);
      setExpenseRatio(preset.expenseRatio);
      setVolatility(preset.volatility);
    }
  };

  const projections = useCompoundCalculator({
    initialAmount,
    monthlyContribution,
    annualReturnRate,
    contributionYears,
    withdrawalStartYear,
    withdrawalYears,
    taxFree,
    ...(withdrawalMode === "rate"
      ? { annualWithdrawalRate: withdrawalRate }
      : { monthlyWithdrawal: fixedMonthlyWithdrawal }),
    expenseRatio,
    inflationRate,
    inflationAdjustedWithdrawal: withdrawalMode === "amount" ? inflationAdjustedWithdrawal : false,
    monthlyPensionIncome: currentAge != null ? adjustedMonthlyPension : 0,
    pensionStartYear,
    monthlyOtherIncome,
  });

  const currentYear = new Date().getFullYear();
  const summaryYear = computeSummaryYear(contributionYears, withdrawalStartYear, withdrawalYears);
  const contributionEnd =
    projections.find((p) => p.year === summaryYear) ?? projections.find((p) => p.year === 0);

  const SENSITIVITY_CONTRIBUTION_DELTAS = [
    -20_000, -10_000, 0, 10_000, 20_000, 30_000, 50_000, 100_000, 200_000, 300_000,
  ];
  const SENSITIVITY_RATE_DELTAS = [-3, -2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2];

  const [monteCarlo, requestImmediateMC] = useMonteCarloSimulator({
    initialAmount,
    monthlyContribution,
    annualReturnRate,
    volatility,
    inflationRate,
    contributionYears,
    withdrawalStartYear,
    withdrawalYears,
    taxFree,
    ...(withdrawalMode === "rate"
      ? { annualWithdrawalRate: withdrawalRate }
      : { monthlyWithdrawal: fixedMonthlyWithdrawal }),
    expenseRatio,
    inflationAdjustedWithdrawal: withdrawalMode === "amount" ? inflationAdjustedWithdrawal : false,
    monthlyPensionIncome: currentAge != null ? adjustedMonthlyPension : 0,
    pensionStartYear,
    monthlyOtherIncome,
    ...(withdrawalYears > 0 && contributionYears > 0 && withdrawalMode === "amount"
      ? { contributionDeltas: SENSITIVITY_CONTRIBUTION_DELTAS }
      : {}),
    ...(withdrawalYears > 0 && withdrawalMode === "rate"
      ? { rateDeltas: SENSITIVITY_RATE_DELTAS }
      : {}),
  });

  const fanChartData = buildFanChartData(monteCarlo.yearlyData);

  const mcMedianIsZero =
    monteCarlo.yearlyData.length > 0 && (monteCarlo.yearlyData.at(-1)?.p50 ?? 0) <= 0;
  const securityScore = computeSecurityScore(
    monteCarlo.depletionProbability,
    monteCarlo.failureProbability,
    mcMedianIsZero,
  );

  const sensitivityRows = monteCarlo.sensitivityRows ?? [];
  const sensitivityTableRows =
    withdrawalMode === "rate"
      ? sensitivityRows.filter((r) => r.delta >= -0.5)
      : sensitivityRows.filter((r) => Math.abs(r.delta) <= 30_000);

  const labelMap = getLabelMap(taxFree);

  const mcDrawdownEndValue = computeMcDrawdownEndValue(
    withdrawalYears,
    monteCarlo.yearlyData,
    drawdownPercentile,
  );

  const monthlyWithdrawalForSummary = computeMonthlyWithdrawalForSummary(
    withdrawalMode,
    projections,
    withdrawalStartYear,
    fixedMonthlyWithdrawal,
  );
  const rateWithdrawalBasis = computeRateWithdrawalBasis(contributionEnd);
  const initialAnnualWithdrawal = Math.round((rateWithdrawalBasis * withdrawalRate) / 100);
  const initialMonthlyWithdrawal = Math.round((rateWithdrawalBasis * withdrawalRate) / 100 / 12);

  const withdrawalMilestones =
    withdrawalMode === "rate"
      ? computeWithdrawalMilestones(withdrawalYears, withdrawalStartYear, projections)
      : undefined;

  const summary = contributionEnd
    ? generateSummary({
        initialAmount,
        monthlyContribution,
        annualReturnRate,
        contributionYears,
        withdrawalStartYear,
        withdrawalYears,
        finalTotal: contributionEnd.total,
        finalPrincipal: contributionEnd.principal,
        finalInterest: contributionEnd.interest,
        monthlyWithdrawal: monthlyWithdrawalForSummary,
        grossMonthlyExpense: withdrawalMode === "amount" ? fixedMonthlyWithdrawal : undefined,
        monthlyPensionIncome: currentAge != null ? adjustedMonthlyPension : 0,
        monthlyOtherIncome,
        drawdownFinalTotal: mcDrawdownEndValue,
        depletionProbability: monteCarlo.depletionProbability,
        pensionStartYear,
        taxFree,
        withdrawalMode,
        withdrawalRate,
        expenseRatio,
        withdrawalMilestones,
        currentAge,
      })
    : null;

  const milestones = selectMilestones(contributionEnd?.total ?? 0);

  const totalWithdrawalAmount = computeTotalWithdrawalAmount(withdrawalYears, projections);

  const totalYears = computeTotalYears(contributionYears, withdrawalStartYear, withdrawalYears);

  return (
    <Card>
      <CardHeader>
        <CardTitle icon={Calculator}>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-lg border p-4 space-y-4">
          <div className="sm:max-w-48 space-y-2">
            <MetricLabel
              title="現在の年齢"
              description="設定すると、グラフやサマリーが年齢で表示され、年金の受給設定が有効になります"
            />
            <NumberField
              value={currentAge}
              onValueChange={(v) => setCurrentAge(v ?? undefined)}
              min={0}
              max={100}
              step={1}
              suffix="歳"
              aria-label="現在の年齢"
            />
          </div>
          <InteractiveTimelineBar
            contributionYears={contributionYears}
            withdrawalStartYear={withdrawalStartYear}
            withdrawalYears={withdrawalYears}
            onContributionYearsChange={setContributionYears}
            onWithdrawalStartYearChange={setWithdrawalStartYear}
            onWithdrawalYearsChange={setWithdrawalYears}
            currentAge={currentAge}
          />

          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">積立設定</h2>
            <div className="w-36">
              <Select
                options={PRODUCT_PRESETS.map((p) => ({
                  value: p.value,
                  label: p.label,
                }))}
                value={selectedPreset}
                onChange={handlePresetChange}
                aria-label="商品プリセット"
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
            <div className="space-y-2">
              <MetricLabel
                title="初期投資額"
                description="一括で投資する金額。0円でも積立のみで運用できます"
              />
              <NumberField
                value={initialAmount}
                onValueChange={(v) => setInitialAmount(v ?? 0)}
                min={0}
                step={10000}
                largeStep={100000}
                suffix="円"
                aria-label="初期投資額"
              />
            </div>

            <div className="space-y-2">
              <MetricLabel title="月額積立額" description="毎月定額で積み立てる金額" />
              <NumberField
                value={monthlyContribution}
                onValueChange={(v) => setMonthlyContribution(v ?? 0)}
                min={0}
                step={1000}
                largeStep={10000}
                suffix="円"
                aria-label="月額積立額"
                disabled={contributionYears === 0}
              />
              {portfolioContext?.monthlyContributionSource && (
                <p className="text-xs text-muted-foreground">
                  {portfolioContext.monthlyContributionSource}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <MetricLabel
                  title="想定利回り"
                  description={
                    <div className="space-y-1.5">
                      <p>配当再投資込みのトータルリターン（年率）を入力してください。</p>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b">
                            <th className="pb-1 text-left font-medium">指数</th>
                            <th className="pb-1 text-right font-medium">過去平均</th>
                          </tr>
                        </thead>
                        <tbody className="tabular-nums">
                          <tr>
                            <td>S&amp;P500（配当込み）</td>
                            <td className="text-right">約10%</td>
                          </tr>
                          <tr>
                            <td>全世界株式（配当込み）</td>
                            <td className="text-right">約7〜8%</td>
                          </tr>
                          <tr>
                            <td>バランス型（株60/債40）</td>
                            <td className="text-right">約5〜6%</td>
                          </tr>
                          <tr>
                            <td>債券中心</td>
                            <td className="text-right">約2〜4%</td>
                          </tr>
                        </tbody>
                      </table>
                      <p className="text-xs text-muted-foreground">
                        ※過去実績であり将来を保証するものではありません
                      </p>
                    </div>
                  }
                />
                <span className="text-sm font-semibold text-primary">{annualReturnRate}%</span>
              </div>
              <Slider
                value={annualReturnRate}
                onValueChange={(v) => {
                  setAnnualReturnRate(v);
                  setSelectedPreset("custom");
                }}
                min={0}
                max={15}
                step={0.5}
                aria-label="想定利回り"
                ticks={[
                  { value: 0, label: "0%" },
                  { value: 5, label: "5%" },
                  { value: 10, label: "10%" },
                  { value: 15, label: "15%" },
                ]}
              />
              {portfolioContext?.annualReturnRateSource && (
                <p className="text-xs text-muted-foreground">
                  {portfolioContext.annualReturnRateSource}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <MetricLabel
                  title="信託報酬"
                  description={
                    <div className="space-y-1.5">
                      <p>
                        投資信託の年間運用コスト。想定利回りから差し引かれて実質リターンを計算します。
                      </p>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b">
                            <th className="pb-1 text-left font-medium">ファンド</th>
                            <th className="pb-1 text-right font-medium">信託報酬</th>
                          </tr>
                        </thead>
                        <tbody className="tabular-nums">
                          <tr>
                            <td>eMAXIS Slim 全世界株式</td>
                            <td className="text-right">0.05775%</td>
                          </tr>
                          <tr>
                            <td>eMAXIS Slim S&amp;P500</td>
                            <td className="text-right">0.0814%</td>
                          </tr>
                          <tr>
                            <td>SBI・V・S&amp;P500</td>
                            <td className="text-right">0.0938%</td>
                          </tr>
                          <tr>
                            <td>たわらノーロード 先進国株式</td>
                            <td className="text-right">0.0989%</td>
                          </tr>
                        </tbody>
                      </table>
                      <p className="text-xs text-muted-foreground">※税込、2026年時点</p>
                    </div>
                  }
                />
                <span className="text-sm text-right">
                  <span className="font-semibold text-primary">{expenseRatio}%</span>
                  <span className="text-xs text-muted-foreground">
                    （実質 {(annualReturnRate - expenseRatio).toFixed(1)}%）
                  </span>
                </span>
              </div>
              <Slider
                value={expenseRatio}
                onValueChange={(v) => {
                  setExpenseRatio(v);
                  setSelectedPreset("custom");
                }}
                min={0}
                max={3}
                step={0.01}
                aria-label="信託報酬"
                ticks={[
                  { value: 0, label: "0%" },
                  { value: 1, label: "1%" },
                  { value: 2, label: "2%" },
                  { value: 3, label: "3%" },
                ]}
              />
            </div>
          </div>

          <h2 className="text-base font-semibold">切り崩し設定</h2>
          {/* Row 1: 引出設定 */}
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                {withdrawalMode === "rate" ? (
                  <MetricLabel
                    title="年間引出率"
                    description={
                      <div className="space-y-1.5">
                        <p>
                          切り崩し開始時の資産 ×
                          引出率で初年度の引出額を決定し、翌年以降はインフレ率に応じて増額します（トリニティ・スタディ準拠）。
                        </p>
                        <table className="w-full text-xs">
                          <tbody>
                            <tr>
                              <td className="pr-2 text-muted-foreground">初年度</td>
                              <td>開始時資産 × 引出率</td>
                            </tr>
                            <tr>
                              <td className="pr-2 text-muted-foreground">N年目</td>
                              <td>
                                初年度額 × (1+インフレ率)
                                <sup>N</sup>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                        {!taxFree && (
                          <>
                            <p className="font-medium">税金の影響</p>
                            <p>
                              設定した引出率の分を手取りとして受け取りますが、引き出す際に利益部分へ課税（20.315%）されます。税金分もポートフォリオから差し引かれるため、ポートフォリオからの実際の引出率は設定値を上回ります。
                            </p>
                            <p>
                              例: 引出率4%・利益率30%の場合
                              <br />→ 手取り4% + 税金(4%×30%×20.315%) ≈ 実質4.2%
                            </p>
                          </>
                        )}
                        <p>
                          米国株式中心・税引前が前提のため、日本では課税（20.315%）や為替リスクを考慮して3%程度に抑えると安全とされています。
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          モンテカルロの結果はインフレ調整済み（実質値）で表示
                        </p>
                      </div>
                    }
                  />
                ) : (
                  <MetricLabel
                    title="月額生活費総額"
                    description={
                      <div className="space-y-1.5">
                        <p>
                          毎月の消費支出額（食費・住居費・光熱費など実際に使う金額）。税金・社会保険料は含みません。ここから年金（手取り）等を差し引いた額がポートフォリオからの取崩し額になります
                        </p>
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b">
                              <th className="pb-1 text-left font-medium">水準</th>
                              <th className="pb-1 text-right font-medium">独身</th>
                              <th className="pb-1 text-right font-medium">夫婦</th>
                            </tr>
                          </thead>
                          <tbody className="tabular-nums">
                            <tr>
                              <td>最低限</td>
                              <td className="text-right">12.0万</td>
                              <td className="text-right">23.9万</td>
                            </tr>
                            <tr>
                              <td>平均</td>
                              <td className="text-right">14.9万</td>
                              <td className="text-right">25.7万</td>
                            </tr>
                            <tr>
                              <td>ゆとり</td>
                              <td className="text-right">20.0万</td>
                              <td className="text-right">39.1万</td>
                            </tr>
                          </tbody>
                        </table>
                        <p className="text-xs text-muted-foreground">
                          ※総務省家計調査(2024年)・生命保険文化センター調査(2025年度)ベース
                        </p>
                      </div>
                    }
                  />
                )}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className={`rounded-md px-2 py-0.5 text-xs font-medium transition-colors ${
                      withdrawalMode === "amount"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                    onClick={() => {
                      requestImmediateMC();
                      setWithdrawalMode("amount");
                    }}
                  >
                    金額指定
                  </button>
                  <button
                    type="button"
                    className={`rounded-md px-2 py-0.5 text-xs font-medium transition-colors ${
                      withdrawalMode === "rate"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                    onClick={() => {
                      requestImmediateMC();
                      setWithdrawalMode("rate");
                    }}
                  >
                    %指定
                  </button>
                </div>
              </div>
              {withdrawalMode === "rate" ? (
                <>
                  <NumberField
                    value={withdrawalRate}
                    onValueChange={(v) => setWithdrawalRate(v ?? 0)}
                    min={0}
                    max={20}
                    step={0.5}
                    suffix="%"
                    aria-label="年間引出率"
                  />
                  <p className="text-xs text-muted-foreground">
                    初年度年額{" "}
                    <span className="font-semibold">
                      約{formatCurrency(initialAnnualWithdrawal)}
                    </span>
                    （{formatCurrency(initialMonthlyWithdrawal)}/月）
                  </p>
                  {currentAge != null && (adjustedMonthlyPension > 0 || monthlyOtherIncome > 0) && (
                    <p className="text-xs text-muted-foreground">
                      取崩し {formatCurrency(monthlyWithdrawalForSummary)}/月 ={" "}
                      {formatCurrency(initialMonthlyWithdrawal)} - 年金
                      {formatCurrency(adjustedMonthlyPension)}
                      {monthlyOtherIncome > 0 && <> - その他{formatCurrency(monthlyOtherIncome)}</>}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <NumberField
                    value={fixedMonthlyWithdrawal}
                    onValueChange={(v) => setFixedMonthlyWithdrawal(v ?? 0)}
                    min={0}
                    step={10000}
                    largeStep={50000}
                    suffix="円"
                    aria-label="月額生活費総額"
                  />
                  <p className="text-xs text-muted-foreground">
                    年額 {formatCurrency(fixedMonthlyWithdrawal * 12)}
                  </p>
                  {currentAge != null && (adjustedMonthlyPension > 0 || monthlyOtherIncome > 0) && (
                    <p className="text-xs font-medium text-muted-foreground">
                      取崩し{" "}
                      {formatCurrency(
                        Math.max(
                          fixedMonthlyWithdrawal - adjustedMonthlyPension - monthlyOtherIncome,
                          0,
                        ),
                      )}
                      /月 = {formatCurrency(fixedMonthlyWithdrawal)} - 年金
                      {formatCurrency(adjustedMonthlyPension)}
                      {monthlyOtherIncome > 0 && <> - その他{formatCurrency(monthlyOtherIncome)}</>}
                    </p>
                  )}
                </>
              )}
            </div>
            <div className="space-y-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <MetricLabel
                    title="年金月額(65歳基準)"
                    description="税引前の額面額を入力してください。手取り率85%を自動適用します。厚生年金の平均受給額は約14.6万円/月、国民年金のみの場合は約5.8万円/月が目安です（厚生労働省統計）"
                  />
                  <div className="flex items-center gap-1">
                    {[
                      {
                        type: "single" as const,
                        label: "独身",
                        pension: 146_000,
                      },
                      {
                        type: "couple" as const,
                        label: "夫婦",
                        pension: 292_000,
                      },
                    ].map(({ type, label, pension }) => (
                      <button
                        key={type}
                        type="button"
                        disabled={currentAge == null}
                        onClick={() => setBasePension(pension)}
                        className={`rounded-md px-2 py-0.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                          basePension === pension
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <NumberField
                  value={basePension}
                  onValueChange={(v) => setBasePension(v ?? 0)}
                  min={0}
                  step={10000}
                  largeStep={50000}
                  suffix="円"
                  aria-label="年金月額(65歳基準)"
                  disabled={currentAge == null}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <MetricLabel
                    title="受給開始年齢"
                    description={
                      <div className="space-y-1">
                        <p>繰上げ（60〜64歳）: 月あたり -0.4%</p>
                        <p>繰下げ（66〜75歳）: 月あたり +0.7%</p>
                        <p>65歳が標準受給開始年齢です</p>
                      </div>
                    }
                  />
                  <span className="text-sm font-semibold text-primary">{pensionStartAge}歳</span>
                </div>
                <Slider
                  value={pensionStartAge}
                  onValueChange={setPensionStartAge}
                  min={60}
                  max={75}
                  step={1}
                  aria-label="受給開始年齢"
                  disabled={currentAge == null}
                  ticks={[
                    { value: 60, label: "60歳" },
                    { value: 65, label: "65歳" },
                    { value: 70, label: "70歳" },
                    { value: 75, label: "75歳" },
                  ]}
                />
              </div>
              {currentAge == null ? (
                <p className="text-xs text-destructive">年齢を設定すると年金が有効になります</p>
              ) : (
                <p className="text-xs font-medium text-muted-foreground">
                  手取り {formatCurrency(adjustedMonthlyPension)}/月（額面の
                  {Math.round((adjustedMonthlyPension / (basePension || 1)) * 100)}% 税金控除後）
                </p>
              )}
            </div>
            <div className="space-y-2">
              <MetricLabel
                title="その他の月収"
                description="パート収入、家賃収入などの手取り額。切り崩し開始時から常に適用されます"
              />
              <NumberField
                value={monthlyOtherIncome}
                onValueChange={(v) => setMonthlyOtherIncome(v ?? 0)}
                min={0}
                step={10000}
                largeStep={50000}
                suffix="円"
                aria-label="その他の月収"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div className="flex items-center gap-3">
              <Switch
                checked={!taxFree}
                onCheckedChange={(v) => {
                  requestImmediateMC();
                  setTaxFree(!v);
                }}
                aria-label="税金を含めて計算"
              />
              <MetricLabel
                title="税金を含めて計算"
                description="運用益にかかる税金（20.315%）を含めてシミュレーション"
              />
            </div>
            {withdrawalMode === "amount" && (
              <div className="flex items-center gap-3">
                <Switch
                  checked={inflationAdjustedWithdrawal}
                  onCheckedChange={(v) => {
                    requestImmediateMC();
                    setInflationAdjustedWithdrawal(v);
                  }}
                  aria-label="引出額を物価上昇に連動"
                />
                <MetricLabel
                  title="引出額を物価上昇に連動"
                  description={
                    <div className="space-y-1">
                      <p>
                        ONにすると、引出額が毎年インフレ率（{inflationRate}
                        %）分だけ増額され、購買力を維持します。
                      </p>
                      <p>OFFの場合、引出額は名目で固定され、実質的な購買力は年々低下します。</p>
                    </div>
                  }
                />
              </div>
            )}
          </div>
        </div>

        <div className="rounded-lg bg-muted/50 p-4 space-y-4">
          {withdrawalYears > 0 && (
            <SecurityScore
              score={securityScore}
              currentMonthly={monthlyContribution}
              currentRate={withdrawalRate}
              sensitivityRows={sensitivityRows}
              onApplyMonthly={(amount) => {
                setMonthlyContribution(amount);
                requestImmediateMC();
              }}
              onApplyRate={(rate) => {
                setWithdrawalRate(rate);
                requestImmediateMC();
              }}
            />
          )}
          {withdrawalYears > 0 && (
            <SensitivityTable
              rows={sensitivityTableRows}
              currentMonthly={monthlyContribution}
              currentRate={withdrawalRate}
            />
          )}
          {/* Timeline header */}
          <TimelinePhaseChips
            contributionYears={contributionYears}
            withdrawalStartYear={withdrawalStartYear}
            withdrawalYears={withdrawalYears}
            currentYear={currentYear}
            currentAge={currentAge}
          />

          {/* Accumulation results */}
          <div
            className={`grid gap-4 grid-cols-2 ${taxFree ? "md:grid-cols-3" : "md:grid-cols-4"}`}
          >
            <div>
              <MetricLabel title="元本合計" description="初期投資額 + 月額積立額の合計" />
              <div className="text-lg font-semibold">
                {formatCurrency(contributionEnd?.principal ?? 0)}
              </div>
            </div>
            <div>
              <MetricLabel
                title={taxFree ? "運用益" : "運用益（税引後）"}
                description={
                  taxFree
                    ? "複利で得られる利益（非課税）"
                    : "複利で得られる利益から税金を差し引いた額"
                }
              />
              <div className="text-lg font-semibold text-balance-positive">
                {formatCurrency(contributionEnd?.interest ?? 0)}
              </div>
            </div>
            {!taxFree && (
              <div>
                <MetricLabel
                  title="税金"
                  description={
                    <>
                      運用益 × 20.315%
                      <br />
                      （所得税15.315% + 住民税5%）
                    </>
                  }
                />
                <div className="text-lg font-semibold text-expense">
                  {formatCurrency(contributionEnd?.tax ?? 0)}
                </div>
              </div>
            )}
            <div>
              <MetricLabel
                title={taxFree ? "合計" : "手取り合計"}
                description={taxFree ? "元本合計 + 運用益" : "元本合計 + 運用益（税引後）"}
              />
              <div className="text-lg font-semibold">
                {formatCurrency(contributionEnd?.total ?? 0)}
              </div>
            </div>
          </div>

          {/* Drawdown results */}
          {withdrawalYears > 0 && (
            <>
              <div className="border-t pt-4" />
              <div className="flex items-center justify-end gap-1">
                <span className="mr-1 text-xs text-muted-foreground">悲観</span>
                {(["p10", "p25", "p50", "p75", "p90"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setDrawdownPercentile(p)}
                    className={`px-2 py-0.5 text-xs rounded transition-colors ${
                      drawdownPercentile === p
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted-foreground/10 text-muted-foreground hover:bg-muted-foreground/20"
                    }`}
                  >
                    {p}
                  </button>
                ))}
                <span className="ml-1 text-xs text-muted-foreground">楽観</span>
                <UiTooltip
                  content="p50（中央値）は半数のシナリオがこの値以上になることを意味します。p10は最悪に近いケース、p90は最良に近いケースです"
                  aria-label="パーセンタイルの説明"
                >
                  <CircleHelp className="ml-1 h-3.5 w-3.5 text-muted-foreground/60" />
                </UiTooltip>
              </div>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <div>
                  <MetricLabel
                    title="切り崩し後の残額"
                    description="5,000回モンテカルロ・シミュレーションの結果。選択したパーセンタイルに応じた残額を表示します"
                  />
                  <div className="text-lg font-semibold">
                    {formatCurrency(mcDrawdownEndValue ?? 0)}
                  </div>
                </div>
                <div>
                  <MetricLabel
                    title="総引出額"
                    description="各年の引出額の合計（税引前の手取り額）"
                  />
                  <div className="text-lg font-semibold text-expense">
                    {formatCurrency(totalWithdrawalAmount)}
                  </div>
                </div>
                <div>
                  <MetricLabel
                    title="元本割れ確率"
                    description="投資した元本を回収できない確率。5,000回シミュレーションのうち、残額と累計引出額の合計が投入元本を下回ったシナリオの割合"
                  />
                  <div
                    className={`text-lg font-semibold ${
                      monteCarlo.failureProbability > 0.2
                        ? "text-expense"
                        : monteCarlo.failureProbability > 0.05
                          ? "text-amber-800"
                          : "text-balance-positive"
                    }`}
                  >
                    {(monteCarlo.failureProbability * 100).toFixed(1)}%
                  </div>
                </div>
                <div>
                  <MetricLabel
                    title="枯渇確率"
                    description={
                      <div className="space-y-1.5">
                        <p>
                          資金が完全にゼロになる確率。5,000回シミュレーションのうち、切り崩し期間中に資金がゼロになったシナリオの割合。
                        </p>
                        <p className="font-medium">枯渇リスクが高まる要因</p>
                        <ul className="list-disc space-y-0.5 pl-3">
                          {!taxFree && <li>手取り額に加え課税分が追加で引かれ、実引出率が上昇</li>}
                          <li>
                            実質リターン = 名目リターン − インフレ率 − σ²/2
                            のため、見た目の利回りより低い
                          </li>
                          <li>引出率が実質リターンを上回ると元本が目減り</li>
                          <li>30年超の長期では下落の影響が累積</li>
                        </ul>
                        <p className="text-muted-foreground">
                          4%ルールは米国株式中心・30年・税引前が前提です
                        </p>
                      </div>
                    }
                  />
                  <div
                    className={`text-lg font-semibold ${
                      monteCarlo.depletionProbability > 0.2
                        ? "text-expense"
                        : monteCarlo.depletionProbability > 0.05
                          ? "text-amber-800"
                          : "text-balance-positive"
                    }`}
                  >
                    {(monteCarlo.depletionProbability * 100).toFixed(1)}%
                  </div>
                </div>
              </div>
              {monteCarlo.distribution.length > 1 && (
                <div className="mt-4">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    シミュレーション終了時の資産分布（5,000パス）
                  </p>
                  <div
                    key={monteCarlo.distribution.map((b) => b.count).join(",")}
                    className="space-y-0.5"
                  >
                    {(() => {
                      const bins = monteCarlo.distribution.filter((b) => b.count > 0);
                      const maxCount = Math.max(...bins.map((b) => b.count));
                      const selectedVal = mcDrawdownEndValue ?? 0;
                      const formatBin = (v: number) =>
                        v >= 100_000_000
                          ? `${(v / 100_000_000).toFixed(1)}億`
                          : `${Math.round(v / 10_000).toLocaleString("ja-JP")}万`;
                      // Find which bin the selected percentile falls into
                      let activeBinIdx = -1;
                      for (let idx = 0; idx < bins.length; idx++) {
                        const b = bins[idx];
                        if (b.isDepleted && selectedVal <= 0) {
                          activeBinIdx = idx;
                          break;
                        }
                        if (!b.isDepleted) {
                          const prevEnd =
                            idx > 0 && !bins[idx - 1].isDepleted ? bins[idx - 1].rangeEnd : 0;
                          if (selectedVal > prevEnd && selectedVal <= b.rangeEnd) {
                            activeBinIdx = idx;
                            break;
                          }
                        }
                      }
                      // If not found (value exceeds last bin), highlight last bin
                      if (activeBinIdx === -1 && bins.length > 0) {
                        activeBinIdx = bins.length - 1;
                      }
                      return bins.map((bin, i) => {
                        const pct = (bin.count / 5000) * 100;
                        const isActive = i === activeBinIdx;
                        const isLastBin = !bin.isDepleted && i === bins.length - 1;
                        const label = bin.isDepleted
                          ? "0円(枯渇)"
                          : isLastBin
                            ? `${formatBin(bin.rangeEnd)}〜`
                            : `〜${formatBin(bin.rangeEnd)}`;
                        return (
                          <div key={i} className="flex items-center gap-2 text-xs">
                            <span
                              className={`w-20 shrink-0 text-right tabular-nums ${isActive ? "font-semibold text-foreground" : "text-muted-foreground"}`}
                            >
                              {label}
                            </span>
                            <div className="h-3.5 flex-1 overflow-hidden rounded-sm bg-muted/30">
                              <div
                                className={`h-full origin-left rounded-sm ${
                                  bin.isDepleted
                                    ? "bg-destructive"
                                    : isActive
                                      ? "bg-primary"
                                      : "bg-primary/40"
                                }`}
                                style={{
                                  width: `${maxCount > 0 ? (bin.count / maxCount) * 100 : 0}%`,
                                  animation: `grow-bar 0.6s ease-out ${i * 40}ms both`,
                                }}
                              />
                            </div>
                            <span
                              className={`w-10 shrink-0 text-right tabular-nums ${isActive ? "font-semibold text-foreground" : "text-muted-foreground"}`}
                            >
                              {pct >= 1 ? `${pct.toFixed(0)}%` : pct > 0 ? "<1%" : "0%"}
                            </span>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {summary && (
          <div className="rounded-lg border bg-muted/30 p-4 text-sm leading-relaxed">{summary}</div>
        )}

        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={projections} margin={{ top: 20, right: 10, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="year"
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) =>
                currentAge != null ? `${currentAge + value}歳` : `${value}年`
              }
            />
            <YAxis
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `${(value / 10000).toFixed(0)}万`}
            />
            <Tooltip
              formatter={(value, name) => [
                formatCurrency(value as number),
                labelMap[name as string] ?? name,
              ]}
              labelFormatter={(label) => {
                const entry = projections.find((p) => p.year === label);
                let phase = "";
                if (entry?.isContributing && entry?.isWithdrawing) phase = "・積立+切り崩し";
                else if (entry?.isWithdrawing) phase = "・切り崩し";
                if (currentAge != null)
                  return `${currentAge + (label as number)}歳（${label}年後${phase}）`;
                return `${label}年後${phase ? `（${phase.slice(1)}）` : ""}`;
              }}
              contentStyle={chartTooltipStyle}
            />
            <Legend formatter={(value) => labelMap[value] ?? value} />
            <Area
              type="monotone"
              dataKey="principal"
              stackId="1"
              stroke="var(--color-chart-1)"
              fill="color-mix(in oklch, var(--color-chart-1) 30%, transparent)"
              name="principal"
            />
            <Area
              type="monotone"
              dataKey="interest"
              stackId="1"
              stroke="var(--color-chart-2)"
              fill="color-mix(in oklch, var(--color-chart-2) 40%, transparent)"
              name="interest"
            />
            <Area
              type="monotone"
              dataKey="tax"
              stackId="1"
              stroke="var(--color-chart-4)"
              fill="color-mix(in oklch, var(--color-chart-4) 35%, transparent)"
              name="tax"
            />
            {contributionYears > 0 && contributionYears < withdrawalStartYear && (
              <ReferenceLine
                x={contributionYears}
                stroke="var(--color-muted-foreground)"
                strokeDasharray="4 4"
                label={{
                  value:
                    currentAge != null
                      ? `積立終了（${currentAge + contributionYears}歳）`
                      : "積立終了",
                  position: "top",
                  fontSize: 11,
                  fill: "var(--color-muted-foreground)",
                }}
              />
            )}
            {withdrawalYears > 0 && withdrawalStartYear < totalYears && (
              <ReferenceLine
                x={withdrawalStartYear}
                stroke="var(--color-muted-foreground)"
                strokeDasharray="4 4"
                label={{
                  value:
                    currentAge != null
                      ? `切り崩し開始（${currentAge + withdrawalStartYear}歳）`
                      : "切り崩し開始",
                  position: "top",
                  fontSize: 11,
                  fill: "var(--color-muted-foreground)",
                }}
              />
            )}
            {milestones.map((m) => (
              <ReferenceLine
                key={m}
                y={m}
                stroke="var(--color-muted-foreground)"
                strokeDasharray="6 4"
                strokeOpacity={0.5}
                label={{
                  value: `${(m / 10_000).toLocaleString("ja-JP")}万円`,
                  position: "right",
                  fontSize: 11,
                  fill: "var(--color-muted-foreground)",
                }}
              />
            ))}
            {portfolioContext?.currentTotalAssets != null && (
              <ReferenceLine
                y={portfolioContext.currentTotalAssets}
                stroke="var(--color-primary)"
                strokeDasharray="6 4"
                strokeOpacity={0.6}
                label={{
                  value: "現在の総資産",
                  position: "insideBottomLeft",
                  fontSize: 11,
                  fill: "var(--color-primary)",
                  offset: 6,
                }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
        <p className="text-xs text-muted-foreground">
          ※
          このグラフは名目値（将来の金額そのもの）で表示しています。インフレによる購買力の変化は反映されていません
        </p>

        {/* Monte Carlo section */}
        <div className="space-y-4 border-t pt-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h3 className="text-sm font-semibold">モンテカルロ・シミュレーション</h3>
              <p className="text-xs text-muted-foreground">
                5,000通りのランダムなシナリオに基づく将来予測。インフレを差し引いた実質値（今の貨幣価値に換算
                {taxFree ? "・非課税" : withdrawalYears > 0 ? "・切り崩し税引後" : ""}
                ）で表示しています。
                <br />
                薄い帯が全シナリオの80%、その内側の濃い帯が中央50%を示します（残り20%は帯の外側）
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 md:flex md:items-center md:gap-4">
              <div className="space-y-1 md:w-32">
                <div className="flex items-center justify-between">
                  <MetricLabel
                    title="インフレ率"
                    description="今の100万円が将来いくらの価値になるかに影響します。日本の直近インフレ率は約2〜3%です。名目リターンから差し引いて実質リターンを算出し、グラフは購買力ベース（実質値）で表示されます"
                  />
                  <span className="text-xs font-semibold text-primary">{inflationRate}%</span>
                </div>
                <Slider
                  value={inflationRate}
                  onValueChange={setInflationRate}
                  min={0}
                  max={10}
                  step={0.5}
                  aria-label="インフレ率"
                  ticks={[
                    { value: 0, label: "0%" },
                    { value: 5, label: "5%" },
                    { value: 10, label: "10%" },
                  ]}
                />
              </div>
              <div className="space-y-1 md:w-40">
                <div className="flex items-center justify-between">
                  <MetricLabel
                    title="ボラティリティ"
                    description={
                      <div className="space-y-1.5">
                        <p>年率の価格変動幅。値が大きいほどリターンのばらつきが大きくなります。</p>
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b">
                              <th className="pb-1 text-left font-medium">資産クラス</th>
                              <th className="pb-1 text-right font-medium">目安</th>
                            </tr>
                          </thead>
                          <tbody className="tabular-nums">
                            <tr>
                              <td>全世界株式 (MSCI ACWI)</td>
                              <td className="text-right">14〜17%</td>
                            </tr>
                            <tr>
                              <td>先進国株式 (S&amp;P500等)</td>
                              <td className="text-right">15〜19%</td>
                            </tr>
                            <tr>
                              <td>バランス型 (株60/債40)</td>
                              <td className="text-right">8〜11%</td>
                            </tr>
                            <tr>
                              <td>債券中心</td>
                              <td className="text-right">3〜8%</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    }
                  />
                  <span className="text-xs font-semibold text-primary">{volatility}%</span>
                </div>
                <Slider
                  value={volatility}
                  onValueChange={(v) => {
                    setVolatility(v);
                    setSelectedPreset("custom");
                  }}
                  min={5}
                  max={30}
                  step={1}
                  aria-label="ボラティリティ"
                  ticks={[
                    { value: 5, label: "5%" },
                    { value: 10, label: "10%" },
                    { value: 20, label: "20%" },
                    { value: 30, label: "30%" },
                  ]}
                />
              </div>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={fanChartData} margin={{ top: 20, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="year"
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) =>
                  currentAge != null ? `${currentAge + value}歳` : `${value}年`
                }
              />
              <YAxis
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `${(value / 10000).toFixed(0)}万`}
              />
              <Tooltip content={<FanChartTooltip currentAge={currentAge} />} />
              {/* Stacked bands: base (invisible) → outer lower → inner lower → inner upper → outer upper */}
              <Area type="monotone" dataKey="base" stackId="fan" fill="transparent" stroke="none" />
              <Area
                type="monotone"
                dataKey="band_outer_lower"
                stackId="fan"
                fill="var(--color-chart-5)"
                fillOpacity={0.12}
                stroke="none"
              />
              <Area
                type="monotone"
                dataKey="band_inner_lower"
                stackId="fan"
                fill="var(--color-chart-5)"
                fillOpacity={0.22}
                stroke="none"
              />
              <Area
                type="monotone"
                dataKey="band_inner_upper"
                stackId="fan"
                fill="var(--color-chart-5)"
                fillOpacity={0.22}
                stroke="none"
              />
              <Area
                type="monotone"
                dataKey="band_outer_upper"
                stackId="fan"
                fill="var(--color-chart-5)"
                fillOpacity={0.12}
                stroke="none"
              />
              <Line
                type="monotone"
                dataKey="p50"
                stroke="var(--color-chart-5)"
                strokeWidth={2}
                dot={false}
                name="中央値"
              />
              <Line
                type="monotone"
                dataKey="principal"
                stroke="var(--color-muted-foreground)"
                strokeWidth={1}
                strokeDasharray="4 4"
                dot={false}
                name="元本"
              />
              {contributionYears > 0 && contributionYears < withdrawalStartYear && (
                <ReferenceLine
                  x={contributionYears}
                  stroke="var(--color-muted-foreground)"
                  strokeDasharray="4 4"
                  label={{
                    value:
                      currentAge != null
                        ? `積立終了（${currentAge + contributionYears}歳）`
                        : "積立終了",
                    position: "top",
                    fontSize: 11,
                    fill: "var(--color-muted-foreground)",
                  }}
                />
              )}
              {withdrawalYears > 0 && withdrawalStartYear < totalYears && (
                <ReferenceLine
                  x={withdrawalStartYear}
                  stroke="var(--color-muted-foreground)"
                  strokeDasharray="4 4"
                  label={{
                    value:
                      currentAge != null
                        ? `切り崩し開始（${currentAge + withdrawalStartYear}歳）`
                        : "切り崩し開始",
                    position: "top",
                    fontSize: 11,
                    fill: "var(--color-muted-foreground)",
                  }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
          <div className="flex justify-end">
            <button
              type="button"
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => {
                const effectiveReturn = annualReturnRate - expenseRatio;
                const mcPercentiles =
                  withdrawalYears > 0 && monteCarlo.yearlyData.length > 0
                    ? (() => {
                        const last = monteCarlo.yearlyData.at(-1)!;
                        return {
                          p10: last.p10,
                          p25: last.p25,
                          p50: last.p50,
                          p75: last.p75,
                          p90: last.p90,
                        };
                      })()
                    : null;
                const data = {
                  settings: {
                    currentAge,
                    initialAmount,
                    monthlyContribution,
                    annualReturnRate,
                    expenseRatio,
                    effectiveReturn: Math.round(effectiveReturn * 100) / 100,
                    inflationRate,
                    realReturn: Math.round((effectiveReturn - inflationRate) * 100) / 100,
                    volatility,
                    contributionYears,
                    withdrawalStartYear,
                    withdrawalYears,
                    withdrawalMode,
                    ...(withdrawalMode === "rate"
                      ? { withdrawalRate }
                      : {
                          fixedMonthlyWithdrawal,
                          inflationAdjustedWithdrawal,
                        }),
                    taxFree,
                    basePension,
                    pensionStartAge,
                    adjustedMonthlyPension: currentAge != null ? adjustedMonthlyPension : 0,
                    pensionStartYear,
                    monthlyOtherIncome,
                    selectedPreset,
                  },
                  results: {
                    principal: contributionEnd?.principal ?? 0,
                    interest: contributionEnd?.interest ?? 0,
                    tax: contributionEnd?.tax ?? 0,
                    total: contributionEnd?.total ?? 0,
                    monthlyWithdrawal: monthlyWithdrawalForSummary,
                    totalWithdrawalAmount,
                  },
                  monteCarlo: {
                    drawdownPercentile,
                    mcDrawdownEndValue: mcDrawdownEndValue ?? 0,
                    depletionProbability: monteCarlo.depletionProbability,
                    failureProbability: monteCarlo.failureProbability,
                    securityScore,
                    finalPercentiles: mcPercentiles,
                    distribution: monteCarlo.distribution,
                  },
                  ...(sensitivityRows.length > 0
                    ? {
                        sensitivity: sensitivityRows.map((r) => ({
                          monthlyContribution: r.monthlyContribution,
                          medianFinalBalance: r.medianFinalBalance,
                          depletionProbability: r.depletionProbability,
                        })),
                      }
                    : {}),
                };
                void navigator.clipboard.writeText(JSON.stringify(data, null, 2));
              }}
              aria-label="設定をJSONでコピー"
            >
              <ClipboardCopy className="h-3.5 w-3.5" />
              設定をコピー
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FanChartTooltip({
  active,
  payload,
  label,
  currentAge,
}: {
  active?: boolean;
  payload?: Array<{ payload?: Record<string, number | string | boolean> }>;
  label?: string | number;
  currentAge?: number;
}) {
  if (!active || !payload?.length) return null;

  const data = payload[0]?.payload;
  if (!data) return null;

  const rows = [
    { label: "90%タイル", value: data.p90 as number },
    { label: "75%タイル", value: data.p75 as number },
    { label: "中央値", value: data.p50 as number },
    { label: "25%タイル", value: data.p25 as number },
    { label: "10%タイル", value: data.p10 as number },
    { label: "元本", value: data.principal as number },
  ];

  const isContributing = data.isContributing as boolean;
  const isWithdrawing = data.isWithdrawing as boolean;

  let phase = "";
  if (isContributing && isWithdrawing) phase = "・積立+切り崩し";
  else if (isWithdrawing) phase = "・切り崩し";

  let labelText: string;
  if (currentAge != null) {
    labelText = `${currentAge + (label as number)}歳（${label}年後${phase}）`;
  } else {
    labelText = `${label}年後${phase ? `（${phase.slice(1)}）` : ""}`;
  }

  const depletionRate = data.depletionRate as number | undefined;

  return (
    <div style={chartTooltipStyle} className="rounded-md border p-2 text-xs shadow-md">
      <div className="mb-1 font-medium">{labelText}</div>
      {rows.map((row) => (
        <div key={row.label} className="flex justify-between gap-4">
          <span className="text-muted-foreground">{row.label}</span>
          <span className="font-medium">{formatCurrency(row.value)}</span>
        </div>
      ))}
      {depletionRate != null && depletionRate > 0 && (
        <div className="mt-1 flex justify-between gap-4 border-t pt-1">
          <span className="text-muted-foreground">枯渇率</span>
          <span className="font-medium text-expense">{(depletionRate * 100).toFixed(1)}%</span>
        </div>
      )}
    </div>
  );
}

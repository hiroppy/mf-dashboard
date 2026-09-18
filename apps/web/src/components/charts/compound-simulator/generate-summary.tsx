import type { ReactNode } from "react";
import { computeSummaryYear } from "./compound-simulator-utils";
import { TAX_RATE } from "./constants";

export interface SummaryInput {
  initialAmount: number;
  monthlyContribution: number;
  annualReturnRate: number;
  contributionYears: number;
  withdrawalStartYear: number;
  withdrawalYears: number;
  finalTotal: number;
  finalPrincipal: number;
  finalInterest: number;
  monthlyWithdrawal?: number;
  grossMonthlyExpense?: number;
  monthlyPensionIncome?: number;
  monthlyOtherIncome?: number;
  drawdownFinalTotal?: number;
  depletionProbability?: number;
  pensionStartYear?: number;
  taxFree?: boolean;
  withdrawalMode?: "rate" | "amount";
  withdrawalRate?: number;
  expenseRatio?: number;
  withdrawalMilestones?: { year: number; annual: number }[];
  currentAge?: number;
}

function formatMan(amount: number): string {
  const absAmount = Math.abs(amount);
  if (absAmount >= 100_000_000) {
    const oku = absAmount / 100_000_000;
    return `${oku.toFixed(1)}億`;
  }
  const man = Math.round(absAmount / 10_000);
  return `${man.toLocaleString("ja-JP")}万`;
}

export function generateSummary(input: SummaryInput): ReactNode {
  const {
    initialAmount,
    monthlyContribution,
    annualReturnRate,
    contributionYears,
    withdrawalStartYear,
    withdrawalYears,
    finalTotal,
    finalPrincipal,
    finalInterest,
    monthlyWithdrawal,
    grossMonthlyExpense,
    monthlyPensionIncome = 0,
    monthlyOtherIncome = 0,
    drawdownFinalTotal,
    depletionProbability,
    pensionStartYear,
    taxFree,
    withdrawalMode = "amount",
    withdrawalRate = 0,
    expenseRatio = 0,
    withdrawalMilestones,
    currentAge,
  } = input;

  const parts: ReactNode[] = [];

  // 1. Start amount
  if (initialAmount > 0) {
    parts.push(`現在の投資総額 ${formatMan(initialAmount)}円をスタートに、`);
  }

  // 2. Monthly contribution
  const returnDesc =
    expenseRatio > 0
      ? `年利${annualReturnRate}%（信託報酬${expenseRatio}%控除後）`
      : `年利${annualReturnRate}%`;
  const idleYears = withdrawalYears > 0 ? Math.max(0, withdrawalStartYear - contributionYears) : 0;
  if (monthlyContribution > 0 && contributionYears > 0) {
    if (idleYears > 0) {
      parts.push(
        `毎月${formatMan(monthlyContribution)}円を${returnDesc}で${contributionYears}年間積み立て、さらに${idleYears}年間運用を続けた場合、`,
      );
    } else {
      parts.push(`毎月${formatMan(monthlyContribution)}円を${returnDesc}で積み立てた場合、`);
    }
  } else {
    parts.push(`${returnDesc}で運用した場合、`);
  }

  // 3. Result with bold total
  const summaryYear = computeSummaryYear(contributionYears, withdrawalStartYear, withdrawalYears);
  const yearLabel =
    currentAge != null
      ? `${currentAge + summaryYear}歳時点（${summaryYear}年後）には`
      : `${summaryYear}年後には`;

  if (summaryYear > 0) {
    parts.push(
      <span key="result">
        {yearLabel}
        {taxFree ? "" : "税引後で"}
        <strong className="font-semibold text-foreground">約{formatMan(finalTotal)}円</strong>
        になる見込みです。
      </span>,
    );
  } else if (initialAmount > 0) {
    // initialAmount is already mentioned in Part 1, skip redundant mention
  } else {
    parts.push(
      <span key="result">
        初期資産
        <strong className="font-semibold text-foreground">約{formatMan(finalTotal)}円</strong>
        から運用を開始します。
      </span>,
    );
  }

  // 4. Interest breakdown
  if (finalInterest > 0 && finalPrincipal > 0) {
    const gainPct = Math.round((finalInterest / finalPrincipal) * 100);
    parts.push(
      `そのうち約${formatMan(finalInterest)}円が${taxFree ? "" : "税引後の"}運用益で、元本に対して約${gainPct}%の利益です。`,
    );
  }

  // 5. Drawdown summary
  const hasWithdrawal =
    withdrawalMode === "rate"
      ? withdrawalRate > 0 && withdrawalYears > 0
      : monthlyWithdrawal != null && monthlyWithdrawal > 0 && withdrawalYears > 0;

  if (hasWithdrawal) {
    const overlap =
      contributionYears > 0 ? Math.max(0, contributionYears - withdrawalStartYear) : 0;

    const overlapPrefix =
      withdrawalStartYear === 0
        ? "積み立てながら開始時から"
        : `積み立てながら${withdrawalStartYear}年目から`;

    let preamble: string;
    if (withdrawalMode === "rate") {
      const ratePrefix =
        contributionYears === 0 && withdrawalStartYear === 0
          ? ""
          : overlap > 0
            ? overlapPrefix
            : "その後、";
      preamble =
        overlap > 0
          ? `${ratePrefix}年${withdrawalRate}%を${withdrawalYears}年間取り崩した場合、`
          : `${ratePrefix}開始時の資産から年${withdrawalRate}%を${withdrawalYears}年間取り崩した場合、`;
    } else {
      const totalIncome = monthlyPensionIncome + monthlyOtherIncome;
      const gross = grossMonthlyExpense ?? monthlyWithdrawal!;
      let monthlyDesc: string;
      if (totalIncome > 0 && gross > totalIncome) {
        const incomeParts: string[] = [];
        if (monthlyPensionIncome > 0) incomeParts.push(`年金${formatMan(monthlyPensionIncome)}円`);
        if (monthlyOtherIncome > 0)
          incomeParts.push(`その他収入${formatMan(monthlyOtherIncome)}円`);
        const netWithdrawal = Math.max(gross - totalIncome, 0);
        monthlyDesc = `毎月の生活費${formatMan(gross)}円のうち${incomeParts.join("・")}を除いた${taxFree ? "" : "手取り"}${formatMan(netWithdrawal)}円を`;
      } else {
        monthlyDesc = `毎月${taxFree ? "" : "手取り"}${formatMan(monthlyWithdrawal!)}円ずつ`;
      }
      if (contributionYears === 0 && withdrawalStartYear === 0) {
        preamble = `${monthlyDesc}${withdrawalYears}年間取り崩した場合、`;
      } else if (overlap > 0) {
        preamble = `${overlapPrefix}${monthlyDesc}${withdrawalYears}年間取り崩した場合、`;
      } else {
        preamble = `その後、${monthlyDesc}${withdrawalYears}年間取り崩した場合、`;
      }
    }

    const depPct = depletionProbability != null ? depletionProbability : 0;

    let rateSuffix: string;
    if (withdrawalMode === "rate") {
      const rateMonthly = monthlyWithdrawal ?? 0;
      const rateAnnual = rateMonthly * 12;

      const withdrawalText =
        rateMonthly > 0 ? `${!taxFree ? "手取り" : ""}年額約${formatMan(rateAnnual)}円` : "";

      let milestonesText = "";
      if (withdrawalMilestones && withdrawalMilestones.length > 0) {
        const parts = withdrawalMilestones.map(
          (m) => `${m.year}年後: 約${formatMan(m.annual)}円/年`,
        );
        milestonesText = `（${parts.join("、")}）`;
      }

      if (withdrawalText && !taxFree && finalTotal > 0) {
        const grossInterest = finalInterest > 0 ? finalInterest / (1 - TAX_RATE) : 0;
        const grossPortfolio = finalPrincipal + grossInterest;
        const gainRatio =
          grossPortfolio > finalPrincipal && grossPortfolio > 0
            ? (grossPortfolio - finalPrincipal) / grossPortfolio
            : 0;
        const effectiveRate = withdrawalRate / (1 - gainRatio * TAX_RATE);
        const taxImpact =
          effectiveRate > withdrawalRate * 1.01
            ? `手取り年${withdrawalRate}%に利益部分への課税が加わり、`
            : "";
        rateSuffix = `初年度は${withdrawalText}で、${taxImpact}実質引出率は約${effectiveRate.toFixed(1)}%です。以降インフレ率に応じて増額します${milestonesText}。`;
      } else if (withdrawalText) {
        rateSuffix = `初年度は${withdrawalText}で、以降インフレ率に応じて増額します${milestonesText}。`;
      } else {
        rateSuffix = "";
      }
    } else {
      const annualWithdrawal = monthlyWithdrawal! * 12;
      const computedWithdrawalRate = finalTotal > 0 ? (annualWithdrawal / finalTotal) * 100 : 0;
      const grossInterest =
        !taxFree && finalInterest > 0 ? finalInterest / (1 - TAX_RATE) : finalInterest;
      const grossPortfolio = finalPrincipal + Math.max(0, grossInterest);
      const gainRatio =
        !taxFree && grossPortfolio > finalPrincipal && grossPortfolio > 0
          ? (grossPortfolio - finalPrincipal) / grossPortfolio
          : 0;
      const effectiveReturn = taxFree
        ? annualReturnRate
        : annualReturnRate * (1 - gainRatio * TAX_RATE);
      const effectiveReturnStr = effectiveReturn.toFixed(1);
      const returnLabel = taxFree
        ? `想定利回り${annualReturnRate}%`
        : `税引後の実効利回り${effectiveReturnStr}%（税引前${annualReturnRate}%）`;
      const diff = computedWithdrawalRate - effectiveReturn;
      const rateComparison =
        diff > 1
          ? `${returnLabel}を上回るため元本が減少します`
          : diff >= -1
            ? `${returnLabel}とほぼ同水準のため、市場の変動次第で元本が目減りする可能性があります`
            : `${returnLabel}を下回るため資産を維持しやすい水準です`;
      rateSuffix = `年間引出率は${computedWithdrawalRate.toFixed(1)}%（年間${formatMan(annualWithdrawal)}円 ÷ 資産${formatMan(finalTotal)}円）で、${rateComparison}。`;
    }

    const boldRemaining = (
      <strong key="drawdown-remaining" className="font-semibold text-foreground">
        約{formatMan(drawdownFinalTotal ?? 0)}円
      </strong>
    );

    const remainLabel = taxFree ? "が残る" : "（税引後）が残る";

    if (drawdownFinalTotal != null && drawdownFinalTotal > 0) {
      if (depPct > 0.2) {
        parts.push(
          <span key="drawdown">
            {preamble}中央値では{boldRemaining}
            {remainLabel}見込みですが、約{(depPct * 100).toFixed(1)}
            %の確率で資金が枯渇するリスクがあります。{rateSuffix}
          </span>,
        );
      } else if (depPct > 0.05) {
        parts.push(
          <span key="drawdown">
            {preamble}中央値では{boldRemaining}
            {remainLabel}見込みです。ただし約{(depPct * 100).toFixed(1)}
            %の確率で枯渇するリスクがあります。{rateSuffix}
          </span>,
        );
      } else if (depPct > 0) {
        parts.push(
          <span key="drawdown">
            {preamble}
            {boldRemaining}
            {remainLabel}見込みです。枯渇リスクは約{(depPct * 100).toFixed(1)}
            %と低水準です。{rateSuffix}
          </span>,
        );
      } else {
        parts.push(
          <span key="drawdown">
            {preamble}
            {boldRemaining}
            {remainLabel}見込みです。{rateSuffix}
          </span>,
        );
      }
    } else {
      parts.push(
        `${preamble}約${(depPct * 100).toFixed(1)}%の確率で資金が枯渇する見込みです。${rateSuffix}`,
      );
    }
  }

  // Calculation breakdown
  const effectiveRate = annualReturnRate - expenseRatio;
  const monthlyRate = Math.pow(1 + effectiveRate / 100, 1 / 12) - 1;
  const taxRateUsed = taxFree ? 0 : TAX_RATE;

  const formulaRows: ReactNode[] = [];

  // Accumulation formulas
  formulaRows.push(
    <li key="rate">
      実質年利: {annualReturnRate}% - {expenseRatio}% = {effectiveRate.toFixed(2)}%{" → "}月利: (1 +{" "}
      {effectiveRate.toFixed(2)}%)^(1/12) - 1 = {(monthlyRate * 100).toFixed(4)}%
    </li>,
  );

  if (finalPrincipal > 0) {
    const contribTotal = monthlyContribution * 12 * contributionYears;
    formulaRows.push(
      <li key="principal">
        元本: {formatMan(initialAmount)}
        {contribTotal > 0 && (
          <>
            {" "}
            + {formatMan(monthlyContribution)} × 12 × {contributionYears}年 ={" "}
            {formatMan(finalPrincipal)}円
          </>
        )}
      </li>,
    );
  }

  if (summaryYear > 0) {
    const totalMonths = summaryYear * 12;
    const contribMonths = contributionYears * 12;
    const r = (monthlyRate * 100).toFixed(4);

    // FV of initial amount
    if (initialAmount > 0) {
      const fvInitial = initialAmount * Math.pow(1 + monthlyRate, totalMonths);
      formulaRows.push(
        <li key="fv-initial">
          初期投資の複利: {formatMan(initialAmount)}円 × (1 + {r}%)^{totalMonths}ヶ月 ={" "}
          {formatMan(Math.round(fvInitial))}円
        </li>,
      );
    }

    // FV of monthly contributions
    if (monthlyContribution > 0 && contributionYears > 0) {
      const fvAnnuity =
        monthlyRate > 0
          ? monthlyContribution * ((Math.pow(1 + monthlyRate, contribMonths) - 1) / monthlyRate)
          : monthlyContribution * contribMonths;
      const idleMonths = totalMonths - contribMonths;
      const fvContrib =
        idleMonths > 0 ? fvAnnuity * Math.pow(1 + monthlyRate, idleMonths) : fvAnnuity;
      if (idleMonths > 0) {
        formulaRows.push(
          <li key="fv-contrib">
            積立の複利: {formatMan(monthlyContribution)}円 × ((1 + {r}%)^{contribMonths} - 1) / {r}%
            × (1 + {r}%)^{idleMonths} = {formatMan(Math.round(fvContrib))}円
          </li>,
        );
      } else {
        formulaRows.push(
          <li key="fv-contrib">
            積立の複利: {formatMan(monthlyContribution)}円 × ((1 + {r}%)^{contribMonths} - 1) / {r}%
            = {formatMan(Math.round(fvContrib))}円
          </li>,
        );
      }
    }

    const grossInterest =
      taxRateUsed > 0 && finalInterest > 0
        ? Math.round(finalInterest / (1 - taxRateUsed))
        : finalInterest;
    const grossTotal = finalPrincipal + grossInterest;
    formulaRows.push(
      <li key="compound">
        {summaryYear}年後の税引前資産: 約{formatMan(grossTotal)}円
      </li>,
    );
    if (!taxFree && grossInterest > 0) {
      formulaRows.push(
        <li key="tax">
          税金: {formatMan(grossInterest)}円 × {(taxRateUsed * 100).toFixed(3)}% ={" "}
          {formatMan(Math.round(grossInterest * taxRateUsed))}円{" → "}税引後:{" "}
          {formatMan(finalTotal)}円
        </li>,
      );
    }
  }

  // Withdrawal formulas
  if (hasWithdrawal && withdrawalMode === "amount") {
    const gross = grossMonthlyExpense ?? monthlyWithdrawal!;
    const hasPension = monthlyPensionIncome > 0;
    const pensionStartsAfterWithdrawal =
      hasPension && pensionStartYear != null && pensionStartYear > withdrawalStartYear;

    // Pre-pension period (if pension starts after withdrawal)
    const prePensionYears = pensionStartsAfterWithdrawal
      ? Math.min(pensionStartYear - withdrawalStartYear, withdrawalYears)
      : 0;
    const postPensionYears = withdrawalYears - prePensionYears;

    if (prePensionYears > 0) {
      const prePensionNet = Math.max(gross - monthlyOtherIncome, 0);
      const prePensionAgeStart = currentAge != null ? currentAge + withdrawalStartYear : null;
      const prePensionAgeEnd =
        currentAge != null ? currentAge + withdrawalStartYear + prePensionYears : null;
      const ageLabel =
        prePensionAgeStart != null ? ` (${prePensionAgeStart}〜${prePensionAgeEnd}歳)` : "";
      formulaRows.push(
        <li key="pre-pension">
          年金受給前{ageLabel}: {formatMan(gross)}円
          {monthlyOtherIncome > 0 && <> - その他{formatMan(monthlyOtherIncome)}円</>}
          {" = "}
          {formatMan(prePensionNet)}円/月 × {prePensionYears}年
        </li>,
      );
    }

    if (hasPension && postPensionYears > 0) {
      const postPensionNet = Math.max(gross - monthlyPensionIncome - monthlyOtherIncome, 0);
      const postAgeStart =
        currentAge != null ? currentAge + withdrawalStartYear + prePensionYears : null;
      const postAgeEnd =
        currentAge != null ? currentAge + withdrawalStartYear + withdrawalYears : null;
      const ageLabel = postAgeStart != null ? ` (${postAgeStart}〜${postAgeEnd}歳)` : "";
      formulaRows.push(
        <li key="post-pension">
          年金受給後{ageLabel}: {formatMan(gross)}円 - 年金{formatMan(monthlyPensionIncome)}円
          {monthlyOtherIncome > 0 && <> - その他{formatMan(monthlyOtherIncome)}円</>}
          {" = "}
          {formatMan(postPensionNet)}円/月 × {postPensionYears}年
        </li>,
      );
    } else if (!hasPension) {
      formulaRows.push(
        <li key="net-withdrawal">
          月額手出し: {formatMan(gross)}円
          {monthlyOtherIncome > 0 && (
            <>
              {" "}
              - その他{formatMan(monthlyOtherIncome)}円 ={" "}
              {formatMan(Math.max(gross - monthlyOtherIncome, 0))}円
            </>
          )}
        </li>,
      );
    }

    // Withdrawal rate (use first year's actual portfolio withdrawal)
    const firstYearNet =
      prePensionYears > 0
        ? Math.max(gross - monthlyOtherIncome, 0)
        : Math.max(gross - monthlyPensionIncome - monthlyOtherIncome, 0);
    const annualW = firstYearNet * 12;
    if (finalTotal > 0) {
      const wRate = (annualW / finalTotal) * 100;
      formulaRows.push(
        <li key="w-rate">
          初年度引出率: {formatMan(annualW)}円/年 ÷ {formatMan(finalTotal)}円 = {wRate.toFixed(1)}%
        </li>,
      );
    }
  } else if (hasWithdrawal && withdrawalMode === "rate") {
    const startAsset = finalTotal;
    const firstYearW = Math.round((startAsset * withdrawalRate) / 100);
    formulaRows.push(
      <li key="rate-withdrawal">
        初年度引出額: {formatMan(startAsset)}円 × {withdrawalRate}% = {formatMan(firstYearW)}円/年(
        {formatMan(Math.round(firstYearW / 12))}円/月)
      </li>,
    );
  }

  parts.push(
    <details key="formula" className="mt-2">
      <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors">
        計算式を表示
      </summary>
      <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground list-disc pl-4">
        {formulaRows}
      </ul>
    </details>,
  );

  return <>{parts}</>;
}

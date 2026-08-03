"use client";

import type {
  BankCashFlowStatus,
  CalculatedBankCashFlowEvent,
} from "@mf-dashboard/analytics/bank-balance-forecast";
import type { RecurringCandidateClassification } from "@mf-dashboard/analytics/recurring-candidates";
import { ChevronDown, Landmark } from "lucide-react";
import { useId, useState } from "react";
import { formatCurrency, formatDateShort } from "../../lib/format";
import { cn } from "../../lib/utils";
import { AmountDisplay } from "../ui/amount-display";
import { Badge } from "../ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import type { BankCashFlowForecastView } from "./bank-cashflow-forecast-data";

interface BankCashFlowForecastClientProps {
  forecasts: BankCashFlowForecastView[];
}

const statusDetails: Record<
  BankCashFlowStatus,
  { label: string; variant: "success" | "secondary" | "warning" }
> = {
  actual: { label: "実績", variant: "success" },
  forecast: { label: "予測", variant: "secondary" },
  needs_review: { label: "要確認", variant: "warning" },
};

const classificationLabels: Record<RecurringCandidateClassification, string> = {
  card: "カード支払い",
  rent: "家賃",
  loan: "ローン",
  salary: "給与",
  executive_compensation: "役員報酬",
  tax: "税金",
  other: "定期的な入出金",
};

function getEvidenceText(event: CalculatedBankCashFlowEvent): string {
  if (event.status === "actual") return "Money Forwardの実績データ";

  const classification = event.classification
    ? classificationLabels[event.classification]
    : classificationLabels.other;
  const evidence = event.evidence;
  if (!evidence) return `${classification}として推定`;

  const amountRange =
    evidence.amountRange.min === evidence.amountRange.max
      ? formatCurrency(evidence.amountRange.min)
      : `${formatCurrency(evidence.amountRange.min)}〜${formatCurrency(evidence.amountRange.max)}`;
  return `${classification}の過去${evidence.occurrenceCount}回（${formatDateShort(evidence.dateRange.from)}〜${formatDateShort(evidence.dateRange.to)}、${amountRange}）から推定`;
}

function ForecastEvent({ event }: { event: CalculatedBankCashFlowEvent }) {
  const status = statusDetails[event.status];
  const signedAmount = event.direction === "income" ? event.amount : -event.amount;

  return (
    <li className="grid gap-2 border-t py-3 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={status.variant}>{status.label}</Badge>
          <span className="font-medium">{event.description || "入出金"}</span>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">{getEvidenceText(event)}</p>
      </div>
      <div className="space-y-1 text-left sm:text-right">
        <AmountDisplay amount={signedAmount} type={event.direction} showSign weight="semibold" />
        <p className="text-xs text-muted-foreground">
          入出金後残高: <AmountDisplay amount={event.balanceAfter} type="balance" size="sm" />
        </p>
      </div>
    </li>
  );
}

function BankForecastCard({ forecast }: { forecast: BankCashFlowForecastView }) {
  const [isOpen, setIsOpen] = useState(false);
  const detailsId = useId();
  const eventCount = forecast.days.reduce((count, day) => count + day.events.length, 0);

  return (
    <section className="rounded-lg border bg-background p-4" aria-labelledby={`${detailsId}-title`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 id={`${detailsId}-title`} className="font-semibold">
            {forecast.accountName}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatDateShort(forecast.forecastBoundaryDate)}時点
          </p>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:text-right">
          <span className="text-xs text-muted-foreground">現在残高</span>
          <span className="text-xs text-muted-foreground">月末予測残高</span>
          <AmountDisplay amount={forecast.currentBalance} type="balance" weight="semibold" />
          <AmountDisplay amount={forecast.monthEndBalance} type="balance" weight="bold" />
        </div>
      </div>

      {eventCount === 0 ? (
        <p className="mt-4 border-t pt-4 text-sm text-muted-foreground">
          今月の入出金実績・予測はありません。
        </p>
      ) : (
        <>
          <button
            type="button"
            className="mt-4 flex w-full items-center justify-between border-t pt-4 text-sm font-medium hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-controls={detailsId}
            aria-expanded={isOpen}
            onClick={() => setIsOpen((open) => !open)}
          >
            <span>入出金の詳細（{eventCount}件）</span>
            <ChevronDown
              className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")}
              aria-hidden="true"
            />
          </button>
          {isOpen && (
            <div id={detailsId} className="mt-2 space-y-4">
              {forecast.days.map((day) => (
                <section key={day.date} aria-labelledby={`${detailsId}-${day.date}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-md bg-muted/50 px-3 py-2">
                    <h4 id={`${detailsId}-${day.date}`} className="text-sm font-semibold">
                      {formatDateShort(day.date)}
                    </h4>
                    <span className="text-xs text-muted-foreground">
                      取引後残高:{" "}
                      <AmountDisplay amount={day.closingBalance} type="balance" size="sm" />
                    </span>
                  </div>
                  <ul className="px-3">
                    {day.events.map((event) => (
                      <ForecastEvent key={event.id} event={event} />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

export function BankCashFlowForecastClient({ forecasts }: BankCashFlowForecastClientProps) {
  const month = Number(forecasts[0]?.monthStartDate.slice(5, 7));

  return (
    <Card>
      <CardHeader>
        <CardTitle icon={Landmark}>{month}月の銀行別予測</CardTitle>
        <CardDescription>
          現在残高と、定期的な入出金を反映した月末残高の見込みです。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 lg:grid-cols-2">
          {forecasts.map((forecast) => (
            <BankForecastCard key={forecast.accountId} forecast={forecast} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

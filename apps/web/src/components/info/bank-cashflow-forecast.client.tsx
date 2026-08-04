"use client";

import type {
  BankCashFlowStatus,
  CalculatedBankCashFlowEvent,
} from "@mf-dashboard/analytics/bank-balance-forecast";
import type { RecurringCandidateClassification } from "@mf-dashboard/analytics/recurring-candidates";
import { CircleHelp, EyeOff, Landmark } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { withBasePath } from "../../lib/base-path";
import { formatCurrency, formatDateShort } from "../../lib/format";
import { cn } from "../../lib/utils";
import { AmountDisplay } from "../ui/amount-display";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardButton, CardContent, CardHeader, CardTitle } from "../ui/card";
import {
  Dialog,
  DialogCloseButton,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import type { BankCashFlowForecastView } from "./bank-cashflow-forecast-data";

interface BankCashFlowForecastClientProps {
  forecasts: BankCashFlowForecastView[];
  groupId?: string;
  allowForecastDismissal?: boolean;
}

const statusDetails: Record<
  BankCashFlowStatus,
  { label: string; variant: "success" | "secondary" }
> = {
  actual: { label: "実績", variant: "success" },
  forecast: { label: "予測", variant: "secondary" },
};

const amountSourceDetails = {
  scheduled_withdrawal: { label: "確定", variant: "default" },
  liability: { label: "残高参考", variant: "warning" },
} as const;

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

  const classification = classificationLabels[event.classification ?? "other"];
  const evidence = event.evidence;
  if (event.amountSource === "scheduled_withdrawal") {
    return evidence
      ? `Money Forwardの引き落とし予定額（日付は過去${evidence.occurrenceCount}回から推定）`
      : "Money Forwardの引き落とし予定額";
  }
  if (event.amountSource === "liability") {
    return evidence
      ? `Money Forwardのカード利用残高を参考（日付は過去${evidence.occurrenceCount}回から推定）`
      : "Money Forwardのカード利用残高を参考";
  }
  if (!evidence) return `${classification}として推定`;

  const amountRange =
    evidence.amountRange.min === evidence.amountRange.max
      ? formatCurrency(evidence.amountRange.min)
      : `${formatCurrency(evidence.amountRange.min)}〜${formatCurrency(evidence.amountRange.max)}`;
  const dateRange =
    evidence.dateRange.from === evidence.dateRange.to
      ? formatDateShort(evidence.dateRange.from)
      : `${formatDateShort(evidence.dateRange.from)}〜${formatDateShort(evidence.dateRange.to)}`;
  return `${classification}の過去${evidence.occurrenceCount}回（${dateRange}、${amountRange}）から推定`;
}

function ForecastEvent({
  event,
  groupId,
  allowForecastDismissal,
  onDismissed,
}: {
  event: CalculatedBankCashFlowEvent;
  groupId?: string;
  allowForecastDismissal: boolean;
  onDismissed: () => void;
}) {
  const [error, setError] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const status = event.amountSource
    ? amountSourceDetails[event.amountSource]
    : statusDetails[event.status];
  const signedAmount = event.direction === "income" ? event.amount : -event.amount;
  const dismissal =
    allowForecastDismissal &&
    event.status === "forecast" &&
    !event.amountSource &&
    typeof event.accountId === "number" &&
    event.recurringIdentity &&
    event.evidence
      ? {
          accountId: event.accountId,
          direction: event.direction,
          recurringIdentity: event.recurringIdentity,
          dismissedThroughDate: event.evidence.dateRange.to,
        }
      : null;

  function dismissForecast() {
    if (!dismissal) return;
    setError(false);
    startTransition(async () => {
      try {
        const response = await fetch(withBasePath("/api/bank-forecast/dismiss"), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...dismissal, groupId }),
        });
        if (!response.ok) {
          setError(true);
          return;
        }
      } catch {
        setError(true);
        return;
      }
      setIsConfirming(false);
      onDismissed();
    });
  }

  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 border-t py-3 first:border-t-0">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Badge variant={status.variant}>{status.label}</Badge>
        <span className="font-medium">{event.description || "入出金"}</span>
      </div>
      <div className="text-right">
        <AmountDisplay
          amount={signedAmount}
          type={event.status === "actual" ? event.direction : "balance"}
          showSign
          weight="semibold"
        />
      </div>
      <div className="col-span-2 flex items-start justify-between gap-3">
        <p className="text-xs leading-relaxed text-muted-foreground">{getEvidenceText(event)}</p>
        {dismissal && !isConfirming ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto shrink-0 px-2 py-1 text-muted-foreground"
            disabled={isPending}
            onClick={() => setIsConfirming(true)}
          >
            <EyeOff aria-hidden="true" />
            予測から除外
          </Button>
        ) : null}
      </div>
      {isConfirming ? (
        <fieldset
          aria-label="予測除外の確認"
          className="col-span-2 rounded-md border bg-muted/50 p-3"
        >
          <p className="text-sm font-medium">本当にこの予測を除外しますか？</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            同じ名前の入出金が再び確認された場合は、自動的に予測へ戻ります。
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isPending}
              onClick={() => setIsConfirming(false)}
            >
              キャンセル
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={isPending}
              onClick={dismissForecast}
            >
              {isPending ? "除外中" : "除外する"}
            </Button>
          </div>
        </fieldset>
      ) : null}
      {error ? (
        <p className="col-span-2 text-xs text-destructive">予測を除外できませんでした。</p>
      ) : null}
    </li>
  );
}

function getEventCount(forecast: BankCashFlowForecastView): number {
  return forecast.days.reduce((count, day) => count + day.events.length, 0);
}

function BalanceSummary({
  forecast,
  className,
}: {
  forecast: BankCashFlowForecastView;
  className?: string;
}) {
  return (
    <span
      className={cn("grid shrink-0 grid-cols-2 gap-x-4 gap-y-1 text-right sm:gap-x-6", className)}
    >
      <span className="text-xs text-muted-foreground">現在残高</span>
      <span className="text-xs text-muted-foreground">月末予測残高</span>
      <AmountDisplay amount={forecast.currentBalance} type="balance" weight="semibold" />
      <AmountDisplay amount={forecast.monthEndBalance} type="balance" weight="bold" />
    </span>
  );
}

function BankForecastCard({
  forecast,
  groupId,
  allowForecastDismissal,
  onForecastDismissed,
}: {
  forecast: BankCashFlowForecastView;
  groupId?: string;
  allowForecastDismissal: boolean;
  onForecastDismissed: () => void;
}) {
  const eventCount = getEventCount(forecast);
  const summary = (
    <span className="flex items-start justify-between gap-4">
      <span className="min-w-0">
        <span className="block font-semibold">{forecast.accountName}</span>
        <span className="mt-1 block text-xs text-muted-foreground">
          {formatDateShort(forecast.forecastBoundaryDate)}時点（{eventCount}件）
        </span>
      </span>
      <BalanceSummary forecast={forecast} />
    </span>
  );

  if (eventCount === 0) {
    return <Card className="p-4">{summary}</Card>;
  }

  return (
    <Dialog>
      <DialogTrigger>
        <CardButton
          aria-label={`${forecast.accountName}の入出金詳細を開く`}
          className="border-primary/30 p-4 hover:border-primary"
        >
          {summary}
        </CardButton>
      </DialogTrigger>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-4xl flex-col overflow-hidden p-0">
        <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b px-6 py-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:gap-4">
          <div className="min-w-0">
            <DialogTitle>{forecast.accountName}の入出金詳細</DialogTitle>
            <DialogDescription>
              {formatDateShort(forecast.monthStartDate)}からの実績と予測
            </DialogDescription>
          </div>
          <BalanceSummary
            forecast={forecast}
            className="col-span-2 row-start-2 justify-self-end sm:col-span-1 sm:col-start-2 sm:row-start-1"
          />
          <DialogCloseButton
            ariaLabel="明細を閉じる"
            className="col-start-2 row-start-1 sm:col-start-3"
          />
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {forecast.days.map((day) => (
            <section key={day.date}>
              <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-md bg-muted/50 px-3 py-2">
                <h3 className="text-sm font-semibold">{formatDateShort(day.date)}</h3>
                <span className="text-xs text-muted-foreground">
                  取引後残高: <AmountDisplay amount={day.closingBalance} type="balance" size="sm" />
                </span>
              </div>
              <ul className="px-3">
                {day.events.map((event) => (
                  <ForecastEvent
                    key={event.id}
                    event={event}
                    groupId={groupId}
                    allowForecastDismissal={allowForecastDismissal}
                    onDismissed={onForecastDismissed}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function BankCashFlowForecastClient({
  forecasts,
  groupId,
  allowForecastDismissal = true,
}: BankCashFlowForecastClientProps) {
  const router = useRouter();
  const firstForecast = forecasts[0];
  if (!firstForecast) return null;

  const month = Number(firstForecast.monthStartDate.slice(5, 7));
  const sortedForecasts = [...forecasts].sort(
    (left, right) =>
      getEventCount(right) - getEventCount(left) || right.currentBalance - left.currentBalance,
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle icon={Landmark}>{month}月の銀行別予測</CardTitle>
          <Popover>
            <PopoverTrigger>
              <button
                type="button"
                className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                aria-label="表示の見方"
              >
                <CircleHelp className="h-5 w-5" aria-hidden="true" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              ariaLabel="表示の見方"
              align="end"
              className="w-[min(calc(100vw-2rem),36rem)] space-y-3 text-sm"
            >
              <h2 className="font-semibold">表示の見方</h2>
              <dl className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <dt>
                    <Badge variant={statusDetails.actual.variant}>
                      {statusDetails.actual.label}
                    </Badge>
                  </dt>
                  <dd className="text-xs leading-relaxed text-muted-foreground">
                    Money Forwardから取得済みの入出金です。
                  </dd>
                </div>
                <div className="space-y-1">
                  <dt>
                    <Badge variant={statusDetails.forecast.variant}>
                      {statusDetails.forecast.label}
                    </Badge>
                  </dt>
                  <dd className="text-xs leading-relaxed text-muted-foreground">
                    過去の定期的な入出金から日付と金額を推定しています。
                  </dd>
                </div>
                <div className="space-y-1">
                  <dt>
                    <Badge variant={amountSourceDetails.scheduled_withdrawal.variant}>
                      {amountSourceDetails.scheduled_withdrawal.label}
                    </Badge>
                  </dt>
                  <dd className="text-xs leading-relaxed text-muted-foreground">
                    Money Forwardの確定した引き落とし予定額です。
                  </dd>
                </div>
                <div className="space-y-1">
                  <dt>
                    <Badge variant={amountSourceDetails.liability.variant}>
                      {amountSourceDetails.liability.label}
                    </Badge>
                  </dt>
                  <dd className="text-xs leading-relaxed text-muted-foreground">
                    引き落とし予定額が未定のため、カード利用残高を参考にしています。
                  </dd>
                </div>
              </dl>
              <p className="border-t pt-3 text-xs leading-relaxed text-muted-foreground">
                今月だけの参考値です。定期性を判定できない臨時入出金などは反映されず、将来の残高を保証しません。過去月表示と任意月への切替は対象外です。
              </p>
            </PopoverContent>
          </Popover>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-2">
          {sortedForecasts.map((forecast) => (
            <BankForecastCard
              key={forecast.accountId}
              forecast={forecast}
              groupId={groupId}
              allowForecastDismissal={allowForecastDismissal}
              onForecastDismissed={() => router.refresh()}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

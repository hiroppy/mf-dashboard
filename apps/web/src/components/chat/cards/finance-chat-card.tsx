import {
  isFinanceChatHrefSafe,
  type ActionCard as ActionCardData,
  type CategoryBreakdownCard as CategoryBreakdownCardData,
  type ChartCard as ChartCardData,
  type EmptyCard as EmptyCardData,
  type FinanceChatCard as FinanceChatCardData,
  type InsightCard as InsightCardData,
  type SummaryCard as SummaryCardData,
  type TransactionListCard as TransactionListCardData,
} from "@mf-dashboard/analytics/chat/cards";
import { ArrowRight, ChartPie, Inbox, Lightbulb, ReceiptText, WalletCards } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "../../../lib/utils";
import { FinanceChatChart } from "../../charts/finance-chat-chart";
import { AmountDisplay } from "../../ui/amount-display";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../ui/card";

interface FinanceChatCardProps {
  allowedHrefs?: readonly string[];
  card: FinanceChatCardData;
  onPromptSelect?: (prompt: string) => void;
}

interface CardShellProps {
  allowedHrefs: ReadonlySet<string>;
  children: ReactNode;
  href?: string;
}

function isHrefAllowed(
  href: string | undefined,
  allowedHrefs: ReadonlySet<string>,
): href is string {
  return href !== undefined && isFinanceChatHrefSafe(href) && allowedHrefs.has(href);
}

function SafeLink({
  allowedHrefs,
  href,
  className,
  children,
}: CardShellProps & { className?: string }) {
  if (!isHrefAllowed(href, allowedHrefs)) return children;

  return (
    <Link href={href as Route} className={className}>
      {children}
    </Link>
  );
}

function CardShell({ allowedHrefs, href, children }: CardShellProps) {
  const isLinkable = isHrefAllowed(href, allowedHrefs);

  return (
    <SafeLink
      href={href}
      allowedHrefs={allowedHrefs}
      className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Card className={cn("overflow-hidden", isLinkable && "transition-colors hover:bg-muted/50")}>
        {children}
      </Card>
    </SafeLink>
  );
}

function CardAction({
  action,
  allowedHrefs,
}: {
  action: { label: string; href: string };
  allowedHrefs: ReadonlySet<string>;
}) {
  const isLinkable = isHrefAllowed(action.href, allowedHrefs);

  if (!isLinkable) {
    return <span className="text-sm text-muted-foreground">{action.label}</span>;
  }

  return (
    <Link
      href={action.href as Route}
      className="inline-flex rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
        {action.label}
        <ArrowRight aria-hidden="true" className="size-4" />
      </span>
    </Link>
  );
}

function SummaryCard({
  card,
  allowedHrefs,
}: {
  card: SummaryCardData;
  allowedHrefs: ReadonlySet<string>;
}) {
  return (
    <CardShell href={card.href} allowedHrefs={allowedHrefs}>
      <CardHeader>
        <CardTitle icon={WalletCards}>{card.title}</CardTitle>
        {card.description && <CardDescription>{card.description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-3">
        {card.metrics.map((metric) => (
          <div key={metric.label} className="flex items-center justify-between gap-4">
            <span className="text-sm text-muted-foreground">{metric.label}</span>
            <AmountDisplay amount={metric.amount} type={metric.amountType} weight="semibold" />
          </div>
        ))}
      </CardContent>
    </CardShell>
  );
}

function TransactionListCard({
  card,
  allowedHrefs,
}: {
  card: TransactionListCardData;
  allowedHrefs: ReadonlySet<string>;
}) {
  return (
    <CardShell href={card.href} allowedHrefs={allowedHrefs}>
      <CardHeader>
        <CardTitle icon={ReceiptText}>{card.title}</CardTitle>
      </CardHeader>
      <CardContent className="divide-y">
        {card.transactions.map((transaction) => (
          <div
            key={transaction.id}
            className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{transaction.description}</p>
              <p className="text-xs text-muted-foreground">
                <time dateTime={transaction.date}>{transaction.date}</time>
                {transaction.category && ` · ${transaction.category}`}
              </p>
            </div>
            <AmountDisplay
              amount={transaction.amount}
              type={transaction.amountType}
              size="sm"
              className="shrink-0"
            />
          </div>
        ))}
      </CardContent>
    </CardShell>
  );
}

function CategoryBreakdownCard({
  card,
  allowedHrefs,
}: {
  card: CategoryBreakdownCardData;
  allowedHrefs: ReadonlySet<string>;
}) {
  return (
    <CardShell href={card.href} allowedHrefs={allowedHrefs}>
      <CardHeader>
        <CardTitle icon={ChartPie}>{card.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-start gap-4">
        {card.categories.map((category) => (
          <div key={category.name} className="w-full min-w-0 space-y-1.5">
            <div className="flex items-center justify-between gap-4 text-sm">
              <span>{category.name}</span>
              <div className="flex items-center gap-2">
                <AmountDisplay amount={category.amount} type={category.amountType} size="sm" />
                <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">
                  {category.percentage.toFixed(1)}%
                </span>
              </div>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${category.percentage}%` }}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </CardShell>
  );
}

function ChartCard({
  card,
  allowedHrefs,
}: {
  card: ChartCardData;
  allowedHrefs: ReadonlySet<string>;
}) {
  return (
    <CardShell href={card.href} allowedHrefs={allowedHrefs}>
      <CardHeader>
        <CardTitle icon={ChartPie}>{card.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <FinanceChatChart card={card} />
      </CardContent>
    </CardShell>
  );
}

function InsightCard({
  card,
  allowedHrefs,
}: {
  card: InsightCardData;
  allowedHrefs: ReadonlySet<string>;
}) {
  return (
    <CardShell allowedHrefs={allowedHrefs}>
      <CardHeader>
        <CardTitle icon={Lightbulb}>{card.title}</CardTitle>
        <CardDescription>{card.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end justify-between gap-4">
        {card.amount !== undefined && card.amountType && (
          <div className="min-w-0 space-y-1">
            <p className="text-sm text-muted-foreground">{card.amountLabel}</p>
            <AmountDisplay amount={card.amount} type={card.amountType} size="xl" weight="bold" />
          </div>
        )}
        {card.action && <CardAction action={card.action} allowedHrefs={allowedHrefs} />}
      </CardContent>
    </CardShell>
  );
}

function ActionCard({
  card,
  allowedHrefs,
}: {
  card: ActionCardData;
  allowedHrefs: ReadonlySet<string>;
}) {
  return (
    <CardShell allowedHrefs={allowedHrefs}>
      <CardHeader>
        <CardTitle icon={ArrowRight}>{card.title}</CardTitle>
        <CardDescription>{card.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <CardAction action={card.action} allowedHrefs={allowedHrefs} />
      </CardContent>
    </CardShell>
  );
}

function EmptyCard({
  card,
  allowedHrefs,
  onPromptSelect,
}: {
  card: EmptyCardData;
  allowedHrefs: ReadonlySet<string>;
  onPromptSelect?: (prompt: string) => void;
}) {
  return (
    <CardShell allowedHrefs={allowedHrefs}>
      <CardHeader>
        <CardTitle icon={Inbox}>{card.title}</CardTitle>
        <CardDescription>{card.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {card.prompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            className="block w-full rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onPromptSelect?.(prompt)}
          >
            {prompt}
          </button>
        ))}
      </CardContent>
    </CardShell>
  );
}

export function FinanceChatCard({ allowedHrefs = [], card, onPromptSelect }: FinanceChatCardProps) {
  const allowedHrefSet = new Set(allowedHrefs);

  switch (card.type) {
    case "summary":
      return <SummaryCard card={card} allowedHrefs={allowedHrefSet} />;
    case "transactionList":
      return <TransactionListCard card={card} allowedHrefs={allowedHrefSet} />;
    case "categoryBreakdown":
      return <CategoryBreakdownCard card={card} allowedHrefs={allowedHrefSet} />;
    case "chart":
      return <ChartCard card={card} allowedHrefs={allowedHrefSet} />;
    case "insight":
      return <InsightCard card={card} allowedHrefs={allowedHrefSet} />;
    case "action":
      return <ActionCard card={card} allowedHrefs={allowedHrefSet} />;
    case "empty":
      return (
        <EmptyCard card={card} allowedHrefs={allowedHrefSet} onPromptSelect={onPromptSelect} />
      );
  }
}

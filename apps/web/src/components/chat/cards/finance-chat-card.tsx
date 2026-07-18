import {
  isFinanceChatHrefSafe,
  type ActionCard as ActionCardData,
  type CategoryBreakdownCard as CategoryBreakdownCardData,
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
import { AmountDisplay } from "../../ui/amount-display";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../ui/card";

interface FinanceChatCardProps {
  card: FinanceChatCardData;
  onPromptSelect?: (prompt: string) => void;
}

interface CardShellProps {
  children: ReactNode;
  href?: string;
}

function SafeLink({ href, className, children }: CardShellProps & { className?: string }) {
  if (!href || !isFinanceChatHrefSafe(href)) return children;

  return (
    <Link href={href as Route} className={className}>
      {children}
    </Link>
  );
}

function CardShell({ href, children }: CardShellProps) {
  const isLinkable = href ? isFinanceChatHrefSafe(href) : false;

  return (
    <SafeLink
      href={href}
      className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Card className={cn("overflow-hidden", isLinkable && "transition-colors hover:bg-muted/50")}>
        {children}
      </Card>
    </SafeLink>
  );
}

function CardAction({ action }: { action: { label: string; href: string } }) {
  const content = (
    <span className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
      {action.label}
      <ArrowRight aria-hidden="true" className="size-4" />
    </span>
  );

  return (
    <SafeLink
      href={action.href}
      className="inline-flex rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {content}
    </SafeLink>
  );
}

function SummaryCard({ card }: { card: SummaryCardData }) {
  return (
    <CardShell href={card.href}>
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

function TransactionListCard({ card }: { card: TransactionListCardData }) {
  return (
    <CardShell href={card.href}>
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

function CategoryBreakdownCard({ card }: { card: CategoryBreakdownCardData }) {
  return (
    <CardShell href={card.href}>
      <CardHeader>
        <CardTitle icon={ChartPie}>{card.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {card.categories.map((category) => (
          <div key={category.name} className="space-y-1.5">
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

function InsightCard({ card }: { card: InsightCardData }) {
  return (
    <CardShell>
      <CardHeader>
        <CardTitle icon={Lightbulb}>{card.title}</CardTitle>
        <CardDescription>{card.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {card.amount !== undefined && card.amountType && (
          <AmountDisplay amount={card.amount} type={card.amountType} size="xl" weight="bold" />
        )}
        {card.action && <CardAction action={card.action} />}
      </CardContent>
    </CardShell>
  );
}

function ActionCard({ card }: { card: ActionCardData }) {
  return (
    <CardShell>
      <CardHeader>
        <CardTitle icon={ArrowRight}>{card.title}</CardTitle>
        <CardDescription>{card.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <CardAction action={card.action} />
      </CardContent>
    </CardShell>
  );
}

function EmptyCard({
  card,
  onPromptSelect,
}: {
  card: EmptyCardData;
  onPromptSelect?: (prompt: string) => void;
}) {
  return (
    <CardShell>
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

export function FinanceChatCard({ card, onPromptSelect }: FinanceChatCardProps) {
  switch (card.type) {
    case "summary":
      return <SummaryCard card={card} />;
    case "transactionList":
      return <TransactionListCard card={card} />;
    case "categoryBreakdown":
      return <CategoryBreakdownCard card={card} />;
    case "insight":
      return <InsightCard card={card} />;
    case "action":
      return <ActionCard card={card} />;
    case "empty":
      return <EmptyCard card={card} onPromptSelect={onPromptSelect} />;
  }
}

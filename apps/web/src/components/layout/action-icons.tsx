"use client";

import { mfUrls } from "@mf-dashboard/meta/urls";
import { Home, HelpCircle, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type {
  CrawlerRunStepDetails,
  CrawlerRunStepStatus,
  CrawlerRunTimelineItem,
} from "../../../../crawler/src/crawler-run-state";
import {
  parseCrawlerRefreshStatus,
  unavailableCrawlerRefreshStatus,
  type CrawlerRefreshStatus,
} from "../../lib/crawler-refresh-status";
import { formatDateTime } from "../../lib/format";
import { Button } from "../ui/button";
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } from "../ui/dialog";
import { IconButton } from "../ui/icon-button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

const STATUS_POLL_INTERVAL_MS = 15_000;
const SYNC_BASELINE_STEP_COUNT = 10;

interface ActionIconsProps {
  variant: "header" | "sidebar";
  notifications?: ReactNode;
}

interface CrawlerRefreshButtonState extends CrawlerRefreshStatus {
  isPending: boolean;
}

async function readCrawlerRefreshStatus(): Promise<CrawlerRefreshStatus> {
  const res = await fetch("/api/crawler/refresh/", { cache: "no-store" });
  const body: unknown = await res.json().catch(() => null);
  return parseCrawlerRefreshStatus(body, res.ok);
}

export function ActionIcons({ variant, notifications }: ActionIconsProps) {
  const iconSize = variant === "header" ? "h-4.5 w-4.5" : "h-5 w-5";

  if (variant === "sidebar") {
    return (
      <div className="border-t p-4 flex items-center gap-1 lg:hidden">
        <HelpButton iconSize={iconSize} />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {notifications}
      <RefreshControl iconSize={iconSize} />
      <HomeButton iconSize={iconSize} />
      <HelpButton iconSize={iconSize} className="hidden lg:block" />
    </div>
  );
}

function RefreshControl({ iconSize }: { iconSize: string }) {
  const router = useRouter();
  const wasRunningRef = useRef(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [state, setState] = useState<CrawlerRefreshButtonState>({
    ...unavailableCrawlerRefreshStatus,
    isPending: true,
  });

  useEffect(() => {
    let isMounted = true;

    async function updateStatus() {
      try {
        const nextStatus = await readCrawlerRefreshStatus();
        if (isMounted) {
          setState({ ...nextStatus, isPending: false });
          if (!nextStatus.running && nextStatus.latestRun?.runStatus !== "failed") {
            setPopoverOpen(false);
          }
          if (nextStatus.available && wasRunningRef.current && !nextStatus.running) {
            router.refresh();
          }
          wasRunningRef.current = nextStatus.running;
        }
      } catch {
        if (isMounted) {
          setState({ ...unavailableCrawlerRefreshStatus, isPending: false });
          setPopoverOpen(false);
          wasRunningRef.current = false;
        }
      }
    }

    void updateStatus();
    const intervalId = window.setInterval(updateStatus, STATUS_POLL_INTERVAL_MS);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [router]);

  async function startRefresh() {
    if (!state.available || state.isPending) {
      return;
    }

    setPopoverOpen(false);
    setState((prev) => ({
      ...prev,
      running: true,
      latestRun: null,
      isPending: true,
    }));

    try {
      const res = await fetch("/api/crawler/refresh/", { method: "POST" });
      const body: unknown = await res.json().catch(() => null);

      if (!res.ok && res.status !== 409) {
        setState({ ...unavailableCrawlerRefreshStatus, isPending: false });
        return;
      }

      const nextStatus = parseCrawlerRefreshStatus(body, true);
      const runningStatus = nextStatus.running ? nextStatus : { ...nextStatus, running: true };
      wasRunningRef.current = true;
      setState({
        ...runningStatus,
        isPending: false,
      });
    } catch {
      setState({ ...unavailableCrawlerRefreshStatus, isPending: false });
    }
  }

  const isFailed = !state.running && state.latestRun?.runStatus === "failed";
  const showsTimeline = state.running || isFailed;
  const isDisabled = state.isPending || !state.available;

  function handlePopoverOpenChange(open: boolean) {
    if (!open || showsTimeline) {
      setPopoverOpen(open);
      return;
    }
    void startRefresh();
  }

  let title = state.available ? "金融機関データを更新" : "更新サービス未接続";
  let ariaLabel = title;
  if (state.running) {
    title = state.startedAt
      ? `同期タイムラインを表示（開始: ${formatDateTime(state.startedAt)}）`
      : "同期タイムラインを表示";
    ariaLabel = "同期タイムラインを表示";
  } else if (isFailed) {
    title = "同期失敗の詳細を表示";
    ariaLabel = title;
  }

  return (
    <>
      {showsTimeline && (
        <span className="hidden lg:inline-flex rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {isFailed ? "同期失敗" : formatProgressLabel(state)}
        </span>
      )}
      <Popover open={popoverOpen && showsTimeline} onOpenChange={handlePopoverOpenChange}>
        <PopoverTrigger>
          <IconButton
            icon={
              <span className="relative block">
                <RefreshCw
                  className={`${iconSize} ${state.running || state.isPending ? "animate-spin" : ""}`}
                />
                {isFailed && (
                  <span
                    aria-hidden="true"
                    className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-destructive ring-2 ring-background"
                  />
                )}
              </span>
            }
            ariaLabel={ariaLabel}
            disabled={isDisabled}
            title={title}
          />
        </PopoverTrigger>
        <PopoverContent
          ariaLabel={isFailed ? "同期失敗の詳細" : "同期タイムライン"}
          align="end"
          className="max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-sm overflow-y-auto"
        >
          <SyncTimelinePopover state={state} onRetry={() => void startRefresh()} />
        </PopoverContent>
      </Popover>
    </>
  );
}

function formatProgressLabel(state: CrawlerRefreshStatus): string {
  const progress = state.latestRun?.runStatus === "running" ? state.latestRun.progress : null;
  if (!progress) {
    return `同期中 · 0/${SYNC_BASELINE_STEP_COUNT}`;
  }
  return `同期中 · ${progress.completed}/${progress.total}`;
}

const stepStatusLabels: Record<CrawlerRunStepStatus, string> = {
  pending: "待機中",
  running: "実行中",
  done: "完了",
  warning: "警告",
  failed: "失敗",
  skipped: "スキップ",
};

function SyncTimelinePopover({
  state,
  onRetry,
}: {
  state: CrawlerRefreshStatus;
  onRetry: () => void;
}) {
  const run = state.running && state.latestRun?.runStatus !== "running" ? null : state.latestRun;

  return (
    <>
      <h2 className="font-semibold">
        {run?.runStatus === "failed" ? "同期に失敗しました" : "同期タイムライン"}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {state.startedAt ? `開始: ${formatDateTime(state.startedAt)}` : "最新の同期状況です。"}
      </p>

      <div className="mt-5 space-y-5 text-sm">
        {run?.progress && (
          <section aria-labelledby="sync-progress-heading">
            <div className="mb-2 flex items-center justify-between gap-4">
              <h3 id="sync-progress-heading" className="font-medium">
                進捗
              </h3>
              <span className="text-muted-foreground">
                {run.progress.completed}/{run.progress.total}
              </span>
            </div>
            <progress
              aria-labelledby="sync-progress-heading"
              value={Math.min(run.progress.completed, run.progress.total)}
              max={run.progress.total || 1}
              className="h-2 w-full overflow-hidden rounded-full bg-muted [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-primary"
            />
          </section>
        )}

        {run?.current && (
          <TimelineDetail
            title="現在"
            label={run.current.label}
            detail={formatStepMetadata(run.current)}
          />
        )}

        {run?.waitingFor && <TimelineDetail title="待機中" label={run.waitingFor} detail={null} />}

        {run?.reason && (
          <section
            aria-labelledby="sync-reason-heading"
            className="rounded-md border border-destructive/30 bg-destructive/5 p-3"
          >
            <h3 id="sync-reason-heading" className="font-medium text-foreground">
              理由
            </h3>
            <p className="mt-1 break-words text-muted-foreground">{run.reason.message}</p>
          </section>
        )}

        <section aria-labelledby="sync-timeline-heading">
          <h3 id="sync-timeline-heading" className="font-medium">
            タイムライン
          </h3>
          {run && run.timeline.length > 0 ? (
            <ol className="mt-2 space-y-2">
              {run.timeline.map((item) => (
                <TimelineListItem key={item.id} item={item} />
              ))}
            </ol>
          ) : (
            <p className="mt-2 text-muted-foreground">タイムラインはまだありません。</p>
          )}
        </section>

        {run?.runStatus === "failed" && (
          <div className="flex justify-end border-t pt-4">
            <Button onClick={onRetry}>再度更新</Button>
          </div>
        )}
      </div>
    </>
  );
}

function TimelineListItem({ item }: { item: CrawlerRunTimelineItem }) {
  const detail = formatStepMetadata(item);

  return (
    <li className="min-w-0 rounded-md border p-3">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <span className="min-w-0 break-words font-medium">{item.label}</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {stepStatusLabels[item.status]}
        </span>
      </div>
      {detail && <p className="mt-1 break-words text-muted-foreground">{detail}</p>}
      {item.reason && <p className="mt-1 break-words text-destructive">{item.reason.message}</p>}
    </li>
  );
}

function formatStepMetadata(item: CrawlerRunStepDetails): string | null {
  switch (item.metadata?.kind) {
    case "group":
      return item.metadata.groupName;
    case "month":
      return item.metadata.month;
    case "refresh": {
      const accounts = item.metadata.incompleteAccounts.join("、");
      return accounts
        ? `残り ${item.metadata.remainingAccounts}件: ${accounts}`
        : `残り ${item.metadata.remainingAccounts}件`;
    }
    default:
      return null;
  }
}

function TimelineDetail({
  title,
  label,
  detail,
}: {
  title: string;
  label: string;
  detail: string | null;
}) {
  return (
    <section className="min-w-0 rounded-md bg-muted/60 p-3">
      <h3 className="font-medium">{title}</h3>
      <p className="mt-1 break-words">{label}</p>
      {detail && <p className="mt-1 break-words text-muted-foreground">{detail}</p>}
    </section>
  );
}

function HelpButton({ iconSize, className }: { iconSize: string; className?: string }) {
  return (
    <Dialog>
      <DialogTrigger className={className}>
        <IconButton icon={<HelpCircle className={iconSize} />} ariaLabel="ヘルプ" />
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <div className="flex items-center justify-between gap-4">
          <DialogTitle>MoneyForward Me Dashboard について</DialogTitle>
          <IconButton
            icon={
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2.3c-3.3.7-4-1.4-4-1.4-.5-1.4-1.3-1.8-1.3-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3Z" />
              </svg>
            }
            href="https://github.com/hiroppy/mf-dashboard"
            ariaLabel="GitHub リポジトリ"
            isExternal
          />
        </div>
        <DialogDescription asChild>
          <div className="mt-2 text-sm text-muted-foreground space-y-4">
            <p>MoneyForward Me を自動化・可視化するダッシュボードです。</p>
            <div>
              <h3 className="font-semibold mb-2 text-foreground">機能</h3>
              <ul className="list-disc list-inside space-y-2 text-sm">
                <li>
                  <span className="font-medium text-foreground">金融機関の一括更新</span>
                  <span className="block ml-5 mt-1">
                    定期的に登録金融機関の「一括更新」を自動実行します。
                  </span>
                </li>
                <li>
                  <span className="font-medium text-foreground">すべての情報を可視化</span>
                  <span className="block ml-5 mt-1">
                    資産状況、収支、ポートフォリオなど MoneyForward Me
                    のデータをダッシュボードで確認できます。
                  </span>
                </li>
                <li>
                  <span className="font-medium text-foreground">Slack 通知</span>
                  <span className="block ml-5 mt-1">前日との差分を Slack へ自動投稿できます。</span>
                </li>
                <li>
                  <span className="font-medium text-foreground">未分類取引の自動分類</span>
                  <span className="block ml-5 mt-1">
                    固定ルールと任意の LLM 推論で、未分類の取引を自動分類できます。
                  </span>
                </li>
                <li>
                  <span className="font-medium text-foreground">カスタム処理（Hooks）</span>
                  <span className="block ml-5 mt-1">
                    スクレイピング時に独自のスクリプトを実行できます。
                  </span>
                </li>
                <li>
                  <span className="font-medium text-foreground">MCP 連携</span>
                  <span className="block ml-5 mt-1">
                    ChatGPT、Codex、Claudeから家計・資産・投資データを自然言語で照会できます。
                  </span>
                </li>
              </ul>
            </div>
            <div className="pt-2 border-t">
              <a
                href="https://github.com/hiroppy/mf-dashboard/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline"
              >
                バグ報告・機能要望
              </a>
            </div>
          </div>
        </DialogDescription>
      </DialogContent>
    </Dialog>
  );
}

function HomeButton({ iconSize }: { iconSize: string }) {
  return (
    <IconButton
      icon={<Home className={iconSize} />}
      href={mfUrls.home}
      ariaLabel="Money Forward"
      isExternal
    />
  );
}

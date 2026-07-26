"use client";

import { mfUrls } from "@mf-dashboard/meta/urls";
import { Home, HelpCircle, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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
import { formatDateTime, formatElapsedTime, formatTime } from "../../lib/format";
import { Button } from "../ui/button";
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } from "../ui/dialog";
import { IconButton } from "../ui/icon-button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

interface ActionIconsProps {
  variant: "header" | "sidebar";
  notifications?: ReactNode;
  lastScrapedAt?: string | null;
  refreshWorkflowUrl?: string | null;
}

interface CrawlerRefreshButtonState extends CrawlerRefreshStatus {
  isPending: boolean;
}

export function ActionIcons({
  variant,
  notifications,
  lastScrapedAt,
  refreshWorkflowUrl,
}: ActionIconsProps) {
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
      <RefreshStatus lastScrapedAt={lastScrapedAt ?? null} workflowUrl={refreshWorkflowUrl} />
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
  const startRefreshInFlightRef = useRef(false);
  const pendingStatusRef = useRef<CrawlerRefreshStatus | null>(null);
  const pendingWasRunningRef = useRef(false);
  const previousRunIdRef = useRef<string | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [state, setState] = useState<CrawlerRefreshButtonState>({
    ...unavailableCrawlerRefreshStatus,
    isPending: true,
  });

  const applyStatus = useCallback(
    (nextStatus: CrawlerRefreshStatus) => {
      setState({ ...nextStatus, isPending: false });
      if (!nextStatus.running && nextStatus.latestRun?.runStatus !== "failed") {
        setPopoverOpen(false);
      }
      if (nextStatus.available && wasRunningRef.current && !nextStatus.running) {
        router.refresh();
      }
      if (nextStatus.available) {
        wasRunningRef.current = nextStatus.running;
      }
    },
    [router],
  );

  useEffect(() => {
    const events = new EventSource("/api/crawler/refresh/");

    function setUnavailable() {
      setState({ ...unavailableCrawlerRefreshStatus, isPending: false });
      setPopoverOpen(false);
      wasRunningRef.current = false;
    }

    events.onmessage = (event) => {
      try {
        const nextStatus = parseCrawlerRefreshStatus(JSON.parse(event.data) as unknown, true);
        if (startRefreshInFlightRef.current) {
          pendingStatusRef.current = nextStatus;
          pendingWasRunningRef.current ||= nextStatus.running;
          return;
        }
        applyStatus(nextStatus);
      } catch {
        setUnavailable();
      }
    };
    events.onerror = () => {
      if (startRefreshInFlightRef.current) return;
      setState({ ...unavailableCrawlerRefreshStatus, isPending: false });
      setPopoverOpen(false);
    };

    return () => {
      events.close();
    };
  }, [applyStatus]);

  async function startRefresh() {
    if (!state.available || state.isPending || startRefreshInFlightRef.current) {
      return;
    }

    const statusBeforeRefresh = state;
    startRefreshInFlightRef.current = true;
    pendingStatusRef.current = null;
    pendingWasRunningRef.current = false;
    previousRunIdRef.current = state.latestRun?.runId ?? null;
    wasRunningRef.current = true;
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
        setState({ ...statusBeforeRefresh, isPending: false });
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
      setState({ ...statusBeforeRefresh, isPending: false });
    } finally {
      startRefreshInFlightRef.current = false;
      const pendingStatus = pendingStatusRef.current as CrawlerRefreshStatus | null;
      const pendingRun = pendingStatus?.latestRun;
      const isNewTerminalRun =
        pendingRun !== null &&
        pendingRun !== undefined &&
        pendingRun.runStatus !== "running" &&
        pendingRun.runId !== previousRunIdRef.current;
      const shouldApplyPendingStatus = pendingWasRunningRef.current || isNewTerminalRun;
      pendingStatusRef.current = null;
      pendingWasRunningRef.current = false;
      previousRunIdRef.current = null;
      if (pendingStatus && shouldApplyPendingStatus) {
        applyStatus(pendingStatus);
      }
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
      ? `同期タイムラインを表示（開始 ${formatDateTime(state.startedAt)}）`
      : "同期タイムラインを表示";
    ariaLabel = "同期タイムラインを表示";
  } else if (isFailed) {
    title = "同期失敗の詳細を表示";
    ariaLabel = title;
  }

  return (
    <>
      <Popover open={popoverOpen && showsTimeline} onOpenChange={handlePopoverOpenChange}>
        <PopoverTrigger>
          <IconButton
            icon={
              <span className="relative block">
                <RefreshCw
                  className={`${iconSize} ${state.running ? "animate-spin text-primary/90" : ""}`}
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
          className="h-[min(32rem,calc(100dvh-2rem))] w-[calc(100vw-2rem)] max-w-sm overflow-y-auto"
        >
          <SyncTimelinePopover state={state} onRetry={() => void startRefresh()} />
        </PopoverContent>
      </Popover>
    </>
  );
}

const stepStatusPresentation: Record<CrawlerRunStepStatus, { label: string; className: string }> = {
  pending: { label: "待機中", className: "font-semibold text-warning-foreground" },
  running: { label: "実行中", className: "font-semibold text-primary" },
  done: { label: "完了", className: "font-semibold text-success" },
  warning: { label: "警告", className: "font-semibold text-warning-foreground" },
  failed: { label: "失敗", className: "font-semibold text-destructive" },
  skipped: { label: "スキップ", className: "font-semibold text-transfer" },
};

function SyncTimelinePopover({
  state,
  onRetry,
}: {
  state: CrawlerRefreshStatus;
  onRetry: () => void;
}) {
  const run = state.running && state.latestRun?.runStatus !== "running" ? null : state.latestRun;
  const failed = run?.runStatus === "failed";
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!state.running) return;

    setNow(Date.now());
    const intervalId = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(intervalId);
  }, [state.running]);

  const elapsedTime = state.startedAt
    ? formatElapsedTime(state.startedAt, run?.finishedAt ?? null, now)
    : null;

  return (
    <>
      {failed && <h2 className="font-semibold">同期に失敗しました</h2>}
      <div
        className={`${failed ? "mt-1" : ""} flex items-center justify-between gap-4 text-sm text-muted-foreground`}
      >
        <p className="ml-auto tabular-nums">
          {state.startedAt ? `開始 ${formatTime(state.startedAt)}` : "最新の同期状況です。"}
          {elapsedTime && ` (${elapsedTime})`}
        </p>
      </div>

      <div className="mt-5 space-y-5 text-sm">
        <section aria-label="タイムライン">
          {run && run.timeline.length > 0 ? (
            <TimelineList
              items={run.timeline}
              currentTimelineItemId={run.current?.timelineItemId ?? null}
            />
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

function TimelineList({
  items,
  currentTimelineItemId,
}: {
  items: CrawlerRunTimelineItem[];
  currentTimelineItemId: string | null;
}) {
  return (
    <ol className="mt-2 space-y-2">
      {[...items].reverse().map((item) => (
        <TimelineListItem
          key={item.id}
          item={item}
          isCurrent={item.id === currentTimelineItemId}
          hideStatus={item.status === "running" && item.id !== currentTimelineItemId}
        />
      ))}
    </ol>
  );
}

function TimelineListItem({
  item,
  isCurrent = false,
  hideStatus = false,
}: {
  item: CrawlerRunTimelineItem;
  isCurrent?: boolean;
  hideStatus?: boolean;
}) {
  const detail = formatStepMetadata(item);
  const status = stepStatusPresentation[item.status];

  return (
    <li className={`min-w-0 rounded-md border p-3 ${isCurrent ? "bg-muted/40" : ""}`}>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <span className="min-w-0 break-words font-medium">{item.label}</span>
        {!hideStatus && (
          <span className={`shrink-0 text-xs ${status.className}`}>{status.label}</span>
        )}
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

interface RefreshStatusProps {
  lastScrapedAt: string | null;
  workflowUrl?: string | null;
}

function RefreshStatus({
  lastScrapedAt,
  workflowUrl = getRefreshWorkflowUrl(),
}: RefreshStatusProps) {
  const formattedLastScrapedAt = lastScrapedAt ? formatDateTime(lastScrapedAt) : null;

  if (!formattedLastScrapedAt && !workflowUrl) {
    return null;
  }

  const ariaLabel = formattedLastScrapedAt
    ? `データ更新ワークフローを開く（最終更新 ${formattedLastScrapedAt}）`
    : "データ更新ワークフローを開く";

  return (
    <div className="flex shrink-0 items-center gap-0.5 border-l pl-2">
      {formattedLastScrapedAt && (
        <span className="whitespace-nowrap text-[11px] text-muted-foreground">
          <span className="hidden sm:inline">更新 </span>
          <time dateTime={lastScrapedAt ?? undefined}>{formattedLastScrapedAt}</time>
        </span>
      )}
      {workflowUrl && (
        <IconButton
          icon={<RefreshCw className="h-4.5 w-4.5" />}
          href={workflowUrl}
          ariaLabel={ariaLabel}
          className="p-1.5"
          isExternal
        />
      )}
    </div>
  );
}

function getRefreshWorkflowUrl() {
  const githubOrg = process.env.NEXT_PUBLIC_GITHUB_ORG;
  const githubRepo = process.env.NEXT_PUBLIC_GITHUB_REPO;

  return githubOrg && githubRepo
    ? `https://github.com/${githubOrg}/${githubRepo}/actions/workflows/daily-update.yml`
    : null;
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
                  <span className="font-medium text-foreground">AI アシスタント</span>
                  <span className="block ml-5 mt-1">
                    Webアプリ内で家計・資産・投資データを自然言語で照会できます。
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

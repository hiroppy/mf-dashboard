"use client";

import { mfUrls } from "@mf-dashboard/meta/urls";
import { Home, HelpCircle, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { formatDateTime } from "../../lib/format";
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } from "../ui/dialog";
import { IconButton } from "../ui/icon-button";

const STATUS_POLL_INTERVAL_MS = 15_000;

interface ActionIconsProps {
  variant: "header" | "sidebar";
  notifications?: ReactNode;
}

interface CrawlerRefreshStatus {
  available: boolean;
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  runStatus: "running" | "success" | "failed" | null;
  current: {
    label: string;
    metadata?: Record<string, string | number | string[]>;
  } | null;
  waitingFor: string | null;
  reason: { code: string; message: string } | null;
}

interface CrawlerRefreshButtonState extends CrawlerRefreshStatus {
  isPending: boolean;
}

const unavailableStatus: CrawlerRefreshStatus = {
  available: false,
  running: false,
  startedAt: null,
  finishedAt: null,
  runStatus: null,
  current: null,
  waitingFor: null,
  reason: null,
};

function parseCrawlerRefreshStatus(
  body: Partial<CrawlerRefreshStatus>,
  available: boolean,
): CrawlerRefreshStatus {
  const runStatus = body.runStatus;
  return {
    available,
    running: Boolean(body.running),
    startedAt: typeof body.startedAt === "string" ? body.startedAt : null,
    finishedAt: typeof body.finishedAt === "string" ? body.finishedAt : null,
    runStatus:
      runStatus === "running" || runStatus === "success" || runStatus === "failed"
        ? runStatus
        : null,
    current: body.current && typeof body.current.label === "string" ? body.current : null,
    waitingFor: typeof body.waitingFor === "string" ? body.waitingFor : null,
    reason:
      body.reason && typeof body.reason.code === "string" && typeof body.reason.message === "string"
        ? body.reason
        : null,
  };
}

async function readCrawlerRefreshStatus(): Promise<CrawlerRefreshStatus> {
  const res = await fetch("/api/crawler/refresh/", { cache: "no-store" });
  const body = (await res.json().catch(() => ({}))) as Partial<CrawlerRefreshStatus>;

  return parseCrawlerRefreshStatus(body, res.ok && body.available !== false);
}

function getRefreshTitle(state: CrawlerRefreshStatus): string {
  if (!state.available) return "更新サービス未接続";
  if (!state.running) {
    if (state.runStatus === "failed" && state.reason) {
      return `前回の更新に失敗（${state.reason.message}）`;
    }
    if (state.runStatus === "success" && state.finishedAt) {
      return `前回の更新完了（${formatDateTime(state.finishedAt)}）`;
    }
    return "更新";
  }

  const metadataTarget = state.current?.metadata?.groupName ?? state.current?.metadata?.month;
  const currentTarget = typeof metadataTarget === "string" ? metadataTarget : null;
  const current = state.current
    ? `${state.current.label}${currentTarget ? `: ${currentTarget}` : ""}`
    : null;
  const detail = state.waitingFor ?? current;
  if (detail) return `更新中（${detail}）`;
  if (state.startedAt) return `更新中（開始: ${formatDateTime(state.startedAt)}）`;
  return "更新中";
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
      <RefreshButton iconSize={iconSize} />
      <HomeButton iconSize={iconSize} />
      <HelpButton iconSize={iconSize} className="hidden lg:block" />
    </div>
  );
}

function RefreshButton({ iconSize }: { iconSize: string }) {
  const router = useRouter();
  const wasRunningRef = useRef(false);
  const [state, setState] = useState<CrawlerRefreshButtonState>({
    ...unavailableStatus,
    isPending: true,
  });

  useEffect(() => {
    let isMounted = true;

    async function updateStatus() {
      try {
        const nextStatus = await readCrawlerRefreshStatus();
        if (isMounted) {
          setState({ ...nextStatus, isPending: false });
          if (nextStatus.available && wasRunningRef.current && !nextStatus.running) {
            router.refresh();
          }
          wasRunningRef.current = nextStatus.running;
        }
      } catch {
        if (isMounted) {
          setState({ ...unavailableStatus, isPending: false });
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
    if (!state.available || state.running || state.isPending) {
      return;
    }

    setState((prev) => ({ ...prev, running: true, isPending: true }));

    try {
      const res = await fetch("/api/crawler/refresh/", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as Partial<CrawlerRefreshStatus>;

      if (!res.ok && res.status !== 409) {
        setState({ ...unavailableStatus, isPending: false });
        return;
      }

      const running = Boolean(body.running ?? true);
      wasRunningRef.current ||= running;
      setState({
        ...parseCrawlerRefreshStatus(
          { ...body, running, runStatus: body.runStatus ?? "running" },
          body.available !== false,
        ),
        isPending: false,
      });
    } catch {
      setState({ ...unavailableStatus, isPending: false });
    }
  }

  const isBusy = state.isPending || state.running;
  const isDisabled = isBusy || !state.available;
  const title = getRefreshTitle(state);

  return (
    <IconButton
      icon={<RefreshCw className={`${iconSize} ${isBusy ? "animate-spin" : ""}`} />}
      onClick={() => void startRefresh()}
      ariaLabel="金融機関データを更新"
      disabled={isDisabled}
      title={title}
    />
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

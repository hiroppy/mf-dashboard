"use client";

import { mfUrls } from "@mf-dashboard/meta/urls";
import { Home, Code2, HelpCircle } from "lucide-react";
import type { ReactNode } from "react";
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } from "../ui/dialog";
import { IconButton } from "../ui/icon-button";

interface ActionIconsProps {
  variant: "header" | "sidebar";
  notifications?: ReactNode;
}

export function ActionIcons({ variant, notifications }: ActionIconsProps) {
  const iconSize = variant === "header" ? "h-4.5 w-4.5" : "h-5 w-5";

  if (variant === "sidebar") {
    return (
      <div className="border-t p-4 flex items-center gap-1 lg:hidden">
        <HelpButton iconSize={iconSize} />
        <GitHubButton iconSize={iconSize} />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {notifications}
      <HomeButton iconSize={iconSize} />
      <GitHubButton iconSize={iconSize} className="hidden lg:block" />
      <HelpButton iconSize={iconSize} className="hidden lg:block" />
    </div>
  );
}

function HelpButton({ iconSize, className }: { iconSize: string; className?: string }) {
  return (
    <Dialog>
      <DialogTrigger className={className}>
        <IconButton icon={<HelpCircle className={iconSize} />} ariaLabel="ヘルプ" />
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>MoneyForward Me Dashboard について</DialogTitle>
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
                  <span className="font-medium text-foreground">カスタム処理（Hooks）</span>
                  <span className="block ml-5 mt-1">
                    スクレイピング時に独自のスクリプトを実行可能。例：特定の取引のカテゴリを自動設定。
                  </span>
                </li>
                <li>
                  <span className="font-medium text-foreground">MCP 連携</span>
                  <span className="block ml-5 mt-1">
                    Chat GPT や Claude Desktop から家計・資産・投資データを自然言語で照会できます。
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

function GitHubButton({ iconSize, className }: { iconSize: string; className?: string }) {
  return (
    <IconButton
      icon={<Code2 className={iconSize} />}
      href="https://github.com/hiroppy/mf-dashboard"
      ariaLabel="GitHub"
      className={className}
      isExternal
    />
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

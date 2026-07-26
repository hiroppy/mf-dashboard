import { isLLMEnabled } from "@mf-dashboard/analytics/config";
import { getAllGroups, getCurrentGroup, isDatabaseAvailable } from "@mf-dashboard/db";
import { DatabaseZap } from "lucide-react";
import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ChatProvider } from "../components/chat/chat-provider";
import { ChatShell } from "../components/chat/chat-shell";
import { AccountNotifications } from "../components/info/account-notifications";
import { Header } from "../components/layout/header";
import { Sidebar } from "../components/layout/sidebar";
import { SidebarProvider } from "../components/layout/sidebar-context";
import { parseChatSuggestedPrompts } from "../lib/chat-config";
import { createMetadataBase } from "../lib/metadata";
import { waitForRuntimeData } from "../lib/runtime-rendering";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  metadataBase: createMetadataBase(),
  title: {
    template: "%s | MoneyForward Me Dashboard",
    default: "MoneyForward Me Dashboard",
  },
  description: "MoneyForward Me のデータを可視化するダッシュボード",
  manifest: `${basePath}/manifest.webmanifest`,
  icons: {
    apple: `${basePath}/apple-touch-icon.png`,
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black",
    title: "MF Dashboard",
  },
  openGraph: {
    title: "MoneyForward Me Dashboard",
    description: "MoneyForward Me のデータを可視化するダッシュボード",
    type: "website",
    locale: "ja_JP",
    images: [
      {
        url: "logo.png",
        width: 758,
        height: 708,
        alt: "MoneyForward Me Dashboard",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "MoneyForward Me Dashboard",
    description: "MoneyForward Me のデータを可視化するダッシュボード",
    images: ["logo.png"],
  },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  await waitForRuntimeData();

  let bodyClassName = "min-h-dvh bg-background antialiased overflow-x-hidden tabular-nums";
  let content: ReactNode;

  if (!isDatabaseAvailable()) {
    bodyClassName =
      "min-h-screen bg-background antialiased flex items-center justify-center tabular-nums";
    content = (
      <div className="max-w-md w-full mx-4 rounded-lg border bg-card p-8 text-center shadow-sm">
        <DatabaseZap className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
        <h1 className="text-2xl font-bold text-foreground mb-2">データベースが見つかりません</h1>
        <p className="text-muted-foreground mb-4">
          データベースファイルが存在しないため、ダッシュボードを表示できません。
        </p>
        <p className="text-sm text-muted-foreground">
          クローラーを実行してデータを取得してください。
        </p>
      </div>
    );
  } else {
    const groups = await getAllGroups();
    const currentGroup = await getCurrentGroup();
    const defaultGroupId = currentGroup?.id ?? groups[0]?.id ?? null;
    const dashboard = (
      <SidebarProvider>
        <Header
          groups={groups.map((group) => ({
            id: group.id,
            name: group.name,
            isCurrent: group.isCurrent ?? false,
            lastScrapedAt: group.lastScrapedAt,
          }))}
          defaultGroupId={defaultGroupId}
          notifications={<AccountNotifications />}
        />
        <div className="flex pt-14">
          <Sidebar />
          <main className="flex-1 lg:ml-60 overflow-x-hidden px-4 py-6 lg:px-8">
            <div className="max-w-7xl mx-auto w-full">{children}</div>
          </main>
        </div>
      </SidebarProvider>
    );
    if (!isLLMEnabled() || process.env.NEXT_PUBLIC_STATIC_DEMO_BUILD === "true") {
      content = dashboard;
    } else {
      content = (
        <ChatProvider currentGroupId={currentGroup?.id ?? null}>
          {dashboard}
          <ChatShell suggestedPrompts={parseChatSuggestedPrompts(process.env.AI_CHAT_PRESETS)} />
        </ChatProvider>
      );
    }
  }

  return (
    <html lang="ja">
      <body className={bodyClassName}>{content}</body>
    </html>
  );
}

import { isDatabaseAvailable } from "@mf-dashboard/db";
import { DatabaseZap } from "lucide-react";
import "./globals.css";
import type { Metadata } from "next";
import { AccountNotifications } from "../components/info/account-notifications";
import { GroupSelector } from "../components/layout/group-selector";
import { Header } from "../components/layout/header";
import { Sidebar } from "../components/layout/sidebar";
import { SidebarProvider } from "../components/layout/sidebar-context";
import { waitForRuntimeData } from "../lib/runtime-rendering";

const metadataBase =
  process.env.GITHUB_PAGES === "true"
    ? new URL(
        `https://${process.env.NEXT_PUBLIC_GITHUB_ORG}.github.io/${process.env.NEXT_PUBLIC_GITHUB_REPO}/`,
      )
    : undefined;

export const metadata: Metadata = {
  metadataBase,
  title: {
    template: "%s | MoneyForward Me Dashboard",
    default: "MoneyForward Me Dashboard",
  },
  description: "MoneyForward Me のデータを可視化するダッシュボード",
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

  if (!isDatabaseAvailable()) {
    return (
      <html lang="ja">
        <body className="min-h-screen bg-background antialiased flex items-center justify-center">
          <div className="max-w-md w-full mx-4 rounded-lg border bg-card p-8 text-center shadow-sm">
            <DatabaseZap className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h1 className="text-2xl font-bold text-foreground mb-2">
              データベースが見つかりません
            </h1>
            <p className="text-muted-foreground mb-4">
              データベースファイルが存在しないため、ダッシュボードを表示できません。
            </p>
            <p className="text-sm text-muted-foreground">
              クローラーを実行してデータを取得してください。
            </p>
          </div>
        </body>
      </html>
    );
  }

  return (
    <html lang="ja">
      <body className="min-h-dvh bg-background antialiased overflow-x-hidden tabular-nums">
        <SidebarProvider>
          <Header groupSelector={<GroupSelector />} notifications={<AccountNotifications />} />
          <div className="flex pt-14">
            <Sidebar />
            <main className="flex-1 lg:ml-60 overflow-x-hidden px-4 py-6 lg:px-8">
              <div className="max-w-7xl mx-auto w-full">{children}</div>
            </main>
          </div>
        </SidebarProvider>
      </body>
    </html>
  );
}

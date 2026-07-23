import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import type { CrawlerRefreshStatus } from "../../lib/crawler-refresh-status";
import { AccountNotificationsClient } from "../info/account-notifications.client";
import { ActionIcons } from "./action-icons";

const startedAt = "2026-01-01T00:00:00.000Z";

const runningStatus: CrawlerRefreshStatus = {
  available: true,
  running: true,
  source: "manual",
  startedAt,
  latestRun: {
    version: 1,
    runId: "run-running",
    runStatus: "running",
    source: "manual",
    startedAt,
    finishedAt: null,
    current: {
      timelineItemId: "group-a",
      label: "グループを取得",
      step: "group_data",
      metadata: { kind: "group", groupName: "Group A" },
    },
    progress: { completed: 2, total: 5 },
    timeline: [
      {
        id: "auth",
        label: "認証",
        step: "authentication",
        metadata: null,
        status: "done",
        startedAt,
        finishedAt: "2026-01-01T00:00:10.000Z",
        reason: null,
      },
      {
        id: "group-a",
        label: "グループを取得",
        step: "group_data",
        metadata: { kind: "group", groupName: "Group A" },
        status: "running",
        startedAt: "2026-01-01T00:00:10.000Z",
        finishedAt: null,
        reason: null,
      },
    ],
    reason: null,
  },
};

const failedStatus: CrawlerRefreshStatus = {
  available: true,
  running: false,
  source: "manual",
  startedAt,
  latestRun: {
    version: 1,
    runId: "run-failed",
    runStatus: "failed",
    source: "manual",
    startedAt,
    finishedAt: "2026-01-01T00:00:10.000Z",
    current: {
      timelineItemId: "auth",
      label: "認証",
      step: "authentication",
      metadata: null,
    },
    progress: null,
    timeline: [
      {
        id: "auth",
        label: "認証",
        step: "authentication",
        metadata: null,
        status: "failed",
        startedAt,
        finishedAt: "2026-01-01T00:00:10.000Z",
        reason: { code: "auth_failed", message: "MoneyForward の認証に失敗しました" },
      },
    ],
    reason: { code: "auth_failed", message: "MoneyForward の認証に失敗しました" },
  },
};

function mockCrawlerStatus(status: CrawlerRefreshStatus) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(status), {
      headers: { "content-type": "application/json" },
    })) as typeof fetch;

  return () => {
    globalThis.fetch = originalFetch;
  };
}

const meta = {
  title: "Layout/ActionIcons",
  component: ActionIcons,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: "/",
      },
    },
  },
} satisfies Meta<typeof ActionIcons>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Header: Story = {
  args: {
    variant: "header",
    notifications: (
      <AccountNotificationsClient errorAccounts={[]} updatingAccounts={[]} totalIssues={0} />
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "ヘルプ" }));

    const dialog = within(within(canvasElement.ownerDocument.body).getByRole("dialog"));
    await expect(
      dialog.getByText("固定ルールと任意の LLM 推論で、未分類の取引を自動分類できます。"),
    ).toBeInTheDocument();
    await expect(
      dialog.queryByText(/例：特定の取引のカテゴリを自動設定。/),
    ).not.toBeInTheDocument();
  },
};

export const HeaderWithNotifications: Story = {
  args: {
    variant: "header",
    notifications: (
      <AccountNotificationsClient
        errorAccounts={[{ id: 1, mfId: "account-1", name: "User Aの銀行口座", status: "error" }]}
        updatingAccounts={[
          { id: 2, mfId: "account-2", name: "User Bの証券口座", status: "updating" },
        ]}
        totalIssues={2}
      />
    ),
  },
};

export const DesktopRunning: Story = {
  args: { variant: "header" },
  globals: {
    viewport: { value: "desktop", isRotated: false },
  },
  beforeEach: () => mockCrawlerStatus(runningStatus),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "同期タイムラインを表示" }));

    const popover = within(canvasElement.ownerDocument.body).getByRole("dialog");
    await waitFor(() => expect(within(popover).getByText("2/5")).toBeVisible());
    await expect(
      within(popover).queryByRole("heading", { name: "同期タイムライン" }),
    ).not.toBeInTheDocument();
    await expect(within(popover).queryByRole("progressbar")).not.toBeInTheDocument();
    await expect(within(popover).getAllByText("Group A")[0]).toBeVisible();
  },
};

export const MobileRunning: Story = {
  args: { variant: "header" },
  globals: {
    viewport: { value: "pixel7", isRotated: false },
  },
  beforeEach: () => mockCrawlerStatus(runningStatus),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "同期タイムラインを表示" }));

    const popover = within(canvasElement.ownerDocument.body).getByRole("dialog");
    await waitFor(() => expect(within(popover).getByText("2/5")).toBeVisible());
    const bounds = popover.getBoundingClientRect();
    await expect(bounds.left).toBeGreaterThanOrEqual(0);
    await expect(bounds.right).toBeLessThanOrEqual(
      canvasElement.ownerDocument.defaultView!.innerWidth,
    );
  },
};

export const Failed: Story = {
  args: { variant: "header" },
  beforeEach: () => mockCrawlerStatus(failedStatus),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "同期失敗の詳細を表示" }));

    const popover = within(canvasElement.ownerDocument.body).getByRole("dialog");
    await waitFor(() =>
      expect(within(popover).getByRole("heading", { name: "同期に失敗しました" })).toBeVisible(),
    );
    await expect(
      within(popover).getAllByText("MoneyForward の認証に失敗しました")[0],
    ).toBeVisible();
    await expect(within(popover).getByRole("button", { name: "再度更新" })).toBeVisible();
  },
};

export const Sidebar: Story = {
  args: {
    variant: "sidebar",
  },
  parameters: {
    viewport: {
      options: {
        mobileSmall: {
          name: "Small mobile",
          styles: { width: "320px", height: "568px" },
        },
      },
    },
  },
  globals: {
    viewport: { value: "mobileSmall", isRotated: false },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "ヘルプ" }));

    const dialog = within(canvasElement.ownerDocument.body).getByRole("dialog");
    const bounds = dialog.getBoundingClientRect();
    await expect(bounds.top).toBeGreaterThanOrEqual(0);
    await expect(bounds.bottom).toBeLessThanOrEqual(
      canvasElement.ownerDocument.defaultView!.innerHeight,
    );
    await expect(dialog.scrollHeight).toBeGreaterThan(dialog.clientHeight);
  },
};

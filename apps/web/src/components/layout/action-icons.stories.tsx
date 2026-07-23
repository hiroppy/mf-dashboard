import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { AccountNotificationsClient } from "../info/account-notifications.client";
import { ActionIcons } from "./action-icons";

const startedAt = "2026-07-01T00:00:00.000Z";
const finishedAt = "2026-07-01T00:01:00.000Z";

const runningStatus = {
  available: true,
  running: true,
  source: "manual",
  startedAt,
  latestRun: {
    version: 1,
    runId: "run-story-running",
    runStatus: "running",
    source: "manual",
    startedAt,
    finishedAt: null,
    current: {
      timelineItemId: "group-a",
      label: "グループデータを取得",
      step: "group_data",
      metadata: { kind: "group", groupName: "Group A" },
    },
    waitingFor: "MoneyForward の応答を待っています",
    progress: { completed: 2, total: 5 },
    timeline: [
      {
        id: "group-a",
        label: "グループデータを取得",
        step: "group_data",
        metadata: { kind: "group", groupName: "Group A" },
        status: "running",
        startedAt,
        finishedAt: null,
        reason: null,
      },
    ],
    reason: null,
  },
};

const failedStatus = {
  ...runningStatus,
  running: false,
  latestRun: {
    ...runningStatus.latestRun,
    runId: "run-story-failed",
    runStatus: "failed",
    finishedAt,
    waitingFor: null,
    timeline: [
      {
        ...runningStatus.latestRun.timeline[0],
        status: "failed",
        finishedAt,
        reason: { code: "unknown_error", message: "グループの取得に失敗しました" },
      },
    ],
    reason: { code: "unknown_error", message: "グループの取得に失敗しました" },
  },
};

function mockStatus(status: object) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify(status), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
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

export const DesktopRunningTimeline: Story = {
  args: { variant: "header" },
  parameters: { viewport: { defaultViewport: "desktop" } },
  beforeEach: () => mockStatus(runningStatus),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("同期中 · 2/5")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "同期タイムラインを表示" }));
    const dialog = within(canvasElement.ownerDocument.body).getByRole("dialog");
    await expect(within(dialog).getAllByText("Group A")).toHaveLength(2);
    await expect(within(dialog).getByText("MoneyForward の応答を待っています")).toBeInTheDocument();
  },
};

export const MobileRunningTimeline: Story = {
  args: { variant: "header" },
  parameters: { viewport: { defaultViewport: "iphone14" } },
  globals: { viewport: { value: "iphone14", isRotated: false } },
  beforeEach: () => mockStatus(runningStatus),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("同期中 · 2/5")).not.toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "同期タイムラインを表示" }));
    await expect(within(canvasElement.ownerDocument.body).getByRole("dialog")).toHaveAttribute(
      "data-open",
    );
  },
};

export const FailedTimeline: Story = {
  args: { variant: "header" },
  parameters: { viewport: { defaultViewport: "desktop" } },
  beforeEach: () => mockStatus(failedStatus),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("同期失敗")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "同期失敗の詳細を表示" }));
    const dialog = within(canvasElement.ownerDocument.body).getByRole("dialog");
    await expect(within(dialog).getAllByText("グループの取得に失敗しました")).toHaveLength(2);
    await expect(within(dialog).getByRole("button", { name: "再度更新" })).toBeInTheDocument();
  },
};

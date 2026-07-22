import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { AccountNotificationsClient } from "../info/account-notifications.client";
import { ActionIcons } from "./action-icons";

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

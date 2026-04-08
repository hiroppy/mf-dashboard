import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AccountStatusBadge } from "./account-status-badge";

const meta = {
  title: "UI/AccountStatusBadge",
  component: AccountStatusBadge,
  tags: ["autodocs"],
  args: {
    status: "ok",
  },
} satisfies Meta<typeof AccountStatusBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ok: Story = {
  args: { status: "ok" },
};

export const Updating: Story = {
  args: { status: "updating" },
};

export const Error: Story = {
  args: { status: "error" },
};

export const Suspended: Story = {
  args: { status: "suspended" },
};

export const Unknown: Story = {
  args: { status: "unknown" },
};

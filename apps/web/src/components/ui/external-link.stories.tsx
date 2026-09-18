import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ExternalLink } from "./external-link";

const meta = {
  title: "UI/ExternalLink",
  component: ExternalLink,
  tags: ["autodocs"],
} satisfies Meta<typeof ExternalLink>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    href: "https://example.com",
    children: "外部リンク",
  },
};

export const WithText: Story = {
  name: "text プロパティ使用",
  args: {
    href: "https://example.com",
    text: "外部サイトを開く",
  },
};

export const WithoutIcon: Story = {
  name: "アイコンなし",
  args: {
    href: "https://example.com",
    children: "アイコンなしリンク",
    showIcon: false,
  },
};

export const CustomClassName: Story = {
  name: "カスタムスタイル",
  args: {
    href: "https://example.com",
    children: "カスタムスタイル",
    className: "text-foreground font-bold underline",
  },
};

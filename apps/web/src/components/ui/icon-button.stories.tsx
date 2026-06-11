import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Bell, Code2, Home, HelpCircle } from "lucide-react";
import { IconButton } from "./icon-button";

const meta = {
  title: "UI/IconButton",
  component: IconButton,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof IconButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Button: Story = {
  args: {
    icon: <Bell className="h-4.5 w-4.5" />,
    ariaLabel: "通知",
  },
};

export const Link: Story = {
  args: {
    icon: <Code2 className="h-4.5 w-4.5" />,
    href: "https://github.com",
    ariaLabel: "GitHub",
    isExternal: true,
  },
};

export const WithCustomIcon: Story = {
  args: {
    icon: <HelpCircle className="h-5 w-5" />,
    ariaLabel: "ヘルプ",
  },
};

export const HomeLink: Story = {
  args: {
    icon: <Home className="h-4.5 w-4.5" />,
    href: "https://example.com",
    ariaLabel: "ホーム",
    isExternal: true,
  },
};

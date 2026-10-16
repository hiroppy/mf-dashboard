import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { THEME_STORAGE_KEY } from "../../lib/theme";
import { ThemeToggle } from "./theme-toggle";

const meta = {
  title: "Layout/ThemeToggle",
  component: ThemeToggle,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
  },
  args: {
    iconSize: "h-4.5 w-4.5",
  },
  beforeEach: () => {
    localStorage.removeItem(THEME_STORAGE_KEY);
    document.documentElement.classList.remove("dark");
    return () => {
      localStorage.removeItem(THEME_STORAGE_KEY);
      document.documentElement.classList.remove("dark");
    };
  },
} satisfies Meta<typeof ThemeToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const CyclesThroughThemes: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = () => canvas.getByRole("button");

    await expect(button()).toHaveAccessibleName(/システム設定/);

    await userEvent.click(button());
    await expect(button()).toHaveAccessibleName(/ライト/);
    await expect(document.documentElement).not.toHaveClass("dark");

    await userEvent.click(button());
    await expect(button()).toHaveAccessibleName(/ダーク/);
    await expect(document.documentElement).toHaveClass("dark");
    await expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");

    await userEvent.click(button());
    await expect(button()).toHaveAccessibleName(/システム設定/);
  },
};

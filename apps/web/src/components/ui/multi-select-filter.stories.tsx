import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn, expect, userEvent, within } from "storybook/test";
import { MultiSelectFilter } from "./multi-select-filter";

const meta = {
  title: "UI/MultiSelectFilter",
  component: MultiSelectFilter,
  tags: ["autodocs"],
} satisfies Meta<typeof MultiSelectFilter>;

export default meta;
type Story = StoryObj<typeof meta>;

const categoryOptions = ["食費", "日用品", "交通費", "医療費", "娯楽"];

export const Default: Story = {
  args: {
    label: "カテゴリー",
    options: categoryOptions,
    selected: [],
    onChange: fn(),
  },
};

export const WithSelections: Story = {
  args: {
    label: "カテゴリー",
    options: categoryOptions,
    selected: ["食費", "交通費"],
    onChange: fn(),
  },
};

export const WithPlayTest: Story = {
  args: {
    label: "カテゴリー",
    options: categoryOptions,
    selected: [],
    onChange: fn(),
  },
  parameters: {
    a11y: {
      config: {
        rules: [
          // Radix Popover / cmdk / base-ui 由来の違反（サードパーティ）
          { id: "aria-dialog-name", enabled: false },
          { id: "aria-required-children", enabled: false },
          { id: "nested-interactive", enabled: false },
          { id: "aria-command-name", enabled: false },
        ],
      },
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);

    // Open popover
    const button = canvas.getByRole("button", { name: "カテゴリー" });
    await userEvent.click(button);

    // Wait for popover to open
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Popover content is rendered in a portal outside canvasElement
    const body = within(document.body);
    const foodOption = body.getByText("食費");
    await userEvent.click(foodOption);

    // Verify onChange was called
    await expect(args.onChange).toHaveBeenCalled();
  },
};

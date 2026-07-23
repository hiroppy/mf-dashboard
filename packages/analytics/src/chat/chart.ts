import { z } from "zod";

const finiteNumberSchema = z.number().finite();

export const financeChartSchema = z
  .object({
    title: z.string().trim().min(1).max(100),
    chartType: z.enum(["line", "bar", "pie"]),
    unit: z.enum(["currency", "count", "percent"]).optional(),
    series: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(40),
          amountType: z.enum(["income", "expense", "balance"]),
        }),
      )
      .min(1)
      .max(3),
    data: z
      .array(
        z.object({
          label: z.string().trim().min(1).max(40),
          values: z.array(finiteNumberSchema).min(1).max(3),
        }),
      )
      .min(1)
      .max(24),
  })
  .superRefine((chart, context) => {
    if (new Set(chart.series.map((series) => series.name)).size !== chart.series.length) {
      context.addIssue({
        code: "custom",
        message: "Series names must be unique",
        path: ["series"],
      });
    }
    if (chart.data.some((point) => point.values.length !== chart.series.length)) {
      context.addIssue({
        code: "custom",
        message: "Each data point must contain one value per series",
        path: ["data"],
      });
    }
    if (chart.chartType === "pie" && chart.series.length !== 1) {
      context.addIssue({
        code: "custom",
        message: "Pie charts support exactly one series",
        path: ["series"],
      });
    }
    if (chart.chartType === "pie" && chart.data.length > 5) {
      context.addIssue({
        code: "custom",
        message: "Pie charts support at most five data points",
        path: ["data"],
      });
    }
    if (
      chart.chartType === "pie" &&
      chart.data.some((point) => point.values.some((value) => value < 0))
    ) {
      context.addIssue({
        code: "custom",
        message: "Pie chart values must be non-negative",
        path: ["data"],
      });
    }
  });

export type FinanceChart = z.infer<typeof financeChartSchema>;

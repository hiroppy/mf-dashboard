"use client";

import type { LucideIcon } from "lucide-react";
import { CalendarDays } from "lucide-react";
import { buildCalendarGrid, getIntensityLevel } from "../../lib/calendar";
import { cn } from "../../lib/utils";
import { AmountDisplay } from "../ui/amount-display";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { useDateFilter } from "./date-filter-context";

interface DailyData {
  date: string; // "YYYY-MM-DD"
  amount: number;
}

interface DailySpendingHeatmapClientProps {
  title: string;
  icon?: LucideIcon;
  year: number;
  monthIndex: number; // 0-based
  dailyData: DailyData[];
}

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

const INTENSITY_CLASSES = [
  "bg-muted",
  "bg-expense/20",
  "bg-expense/40",
  "bg-expense/60 text-white",
  "bg-expense/80 text-white",
] as const;

function getIntensityClass(amount: number, max: number): string {
  return INTENSITY_CLASSES[getIntensityLevel(amount, max)];
}

export function DailySpendingHeatmapClient({
  title,
  icon,
  year,
  monthIndex,
  dailyData,
}: DailySpendingHeatmapClientProps) {
  const dateFilter = useDateFilter();
  const selectedDate = dateFilter?.selectedDate ?? null;
  const onDateChange = dateFilter?.onDateChange;

  const handleCellClick = (date: string) => {
    onDateChange?.(selectedDate === date ? null : date);
  };

  const maxAmount = Math.max(...dailyData.map((d) => d.amount), 1);
  const weeks = buildCalendarGrid(year, monthIndex, dailyData);

  return (
    <Card>
      <CardHeader>
        <CardTitle icon={icon ?? CalendarDays}>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAY_LABELS.map((label) => (
              <div key={label} className="text-sm text-center text-muted-foreground font-medium">
                {label}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 gap-1">
              {week.cells.map((cell, ci) => {
                if (!cell) {
                  return <div key={ci} className="aspect-square" />;
                }
                const isSelected = selectedDate === cell.date;
                return (
                  <button
                    type="button"
                    key={ci}
                    onClick={() => handleCellClick(cell.date)}
                    className={cn(
                      "aspect-square rounded-sm flex flex-col items-center justify-center relative group cursor-pointer transition-all",
                      getIntensityClass(cell.amount, maxAmount),
                      isSelected && "ring-2 ring-primary ring-offset-1",
                    )}
                  >
                    <span className="text-sm font-medium">{cell.day}</span>
                    {cell.amount > 0 && (
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-popover text-popover-foreground text-sm rounded shadow-md border opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                        <AmountDisplay amount={cell.amount} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ))}

          <div className="flex items-center justify-end gap-1.5 mt-3 text-sm text-muted-foreground">
            <div className="h-3 w-3 rounded-sm bg-muted" />
            <div className="h-3 w-3 rounded-sm bg-expense/20" />
            <div className="h-3 w-3 rounded-sm bg-expense/40" />
            <div className="h-3 w-3 rounded-sm bg-expense/60" />
            <div className="h-3 w-3 rounded-sm bg-expense/80" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

import { getAvailableMonths } from "@mf-dashboard/db";
import { MonthSelectorClient } from "./month-selector.client";

interface MonthSelectorProps {
  currentMonth: string;
  basePath: string;
  groupId?: string;
}

export async function MonthSelector({ currentMonth, basePath, groupId }: MonthSelectorProps) {
  const availableMonths = (await getAvailableMonths(groupId)).map((m) => m.month);

  return (
    <MonthSelectorClient
      currentMonth={currentMonth}
      availableMonths={availableMonths}
      basePath={basePath}
    />
  );
}

import { formatMonth } from "../../../lib/format";

const fallbackMonthParam = "_";

export function formatCashFlowPageTitle(month: string): string {
  if (month === fallbackMonthParam) {
    return "収支";
  }

  return `収支 - ${formatMonth(month)}`;
}

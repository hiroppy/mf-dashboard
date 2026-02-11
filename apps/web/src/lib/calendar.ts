interface CalendarCell {
  day: number;
  date: string;
  amount: number;
}

interface CalendarWeek {
  cells: Array<CalendarCell | null>;
}

export function buildCalendarGrid(
  year: number,
  monthIndex: number,
  dailyData: Array<{ date: string; amount: number }>,
): CalendarWeek[] {
  const amountMap = new Map(dailyData.map((d) => [d.date, d.amount]));

  const firstDay = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const startDow = firstDay.getDay();

  const weeks: CalendarWeek[] = [];
  let currentWeek: Array<CalendarCell | null> = [];

  for (let i = 0; i < startDow; i++) {
    currentWeek.push(null);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = toDateString(year, monthIndex + 1, day);
    currentWeek.push({
      day,
      date: dateStr,
      amount: amountMap.get(dateStr) ?? 0,
    });

    if (currentWeek.length === 7) {
      weeks.push({ cells: currentWeek });
      currentWeek = [];
    }
  }

  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) {
      currentWeek.push(null);
    }
    weeks.push({ cells: currentWeek });
  }

  return weeks;
}

export function toDateString(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseDateString(dateStr: string): { year: number; month: number; day: number } {
  const [year, month, day] = dateStr.split("-").map(Number);
  return { year, month, day };
}

export function parseMonthString(monthStr: string): { year: number; month: number } {
  const [year, month] = monthStr.split("-").map(Number);
  return { year, month };
}

export function getIntensityLevel(amount: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (amount === 0) return 0;
  const ratio = amount / max;
  if (ratio < 0.25) return 1;
  if (ratio < 0.5) return 2;
  if (ratio < 0.75) return 3;
  return 4;
}

export function calcChangeRate(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function calcStreak(values: number[]): {
  direction: "increasing" | "decreasing" | "none";
  months: number;
} {
  if (values.length < 2) return { direction: "none", months: 0 };

  let direction: "increasing" | "decreasing" | "none" = "none";
  let count = 0;

  for (let i = values.length - 1; i > 0; i--) {
    const diff = values[i] - values[i - 1];
    const currentDir = diff > 0 ? "increasing" : diff < 0 ? "decreasing" : "none";

    if (currentDir === "none") break;

    if (direction === "none") {
      direction = currentDir;
      count = 1;
    } else if (currentDir === direction) {
      count++;
    } else {
      break;
    }
  }

  return { direction, months: count };
}

export function calcAverage(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

export function calcMedian(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function calcStdDev(arr: number[], mean: number): number {
  if (arr.length < 2) return 0;
  const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

export function calcSavingsRate(income: number, expense: number): number {
  if (income === 0) return 0;
  return ((income - expense) / income) * 100;
}

export function getCurrentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export function excludeCurrentMonth<T extends { month: string }>(items: T[]): T[] {
  const currentMonth = getCurrentMonth();
  return items.filter((item) => item.month !== currentMonth);
}

export function calcLinearSlope(values: number[]): number {
  if (values.length < 3) return 0;
  const n = values.length;
  const mean = calcAverage(values);
  const xMean = (n - 1) / 2;
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (i - xMean) * (values[i] - mean);
    denominator += (i - xMean) ** 2;
  }
  return denominator > 0 ? numerator / denominator : 0;
}

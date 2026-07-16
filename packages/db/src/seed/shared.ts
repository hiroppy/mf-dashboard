import type { LibSQLDatabase } from "drizzle-orm/libsql";
import type * as schema from "../schema/schema";

export type SeedDb = LibSQLDatabase<typeof schema>;
export type Now = () => string;
export type RandInt = (min: number, max: number) => number;
export type Pick = <T>(arr: readonly T[]) => T;

export interface MonthRange {
  yearStart: number;
  monthStart: number;
  yearEnd: number;
  monthEnd: number;
}

/** YYYY-MM-DD */
export function dateStr(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** YYYY-MM */
export function monthStr(y: number, m: number): string {
  return `${y}-${String(m).padStart(2, "0")}`;
}

/** シード付き擬似乱数生成器 (mulberry32) — 同じシードで常に同じ結果を返す */
export function createRng(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** ランダム整数 [min, max] */
export function createRandInt(random: () => number): RandInt {
  return (min: number, max: number) => Math.floor(random() * (max - min + 1)) + min;
}

/** 配列からランダムに1つ */
export function createPick(random: () => number): Pick {
  return <T>(arr: readonly T[]): T => arr[Math.floor(random() * arr.length)]!;
}

/** 月の日数 */
export function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

export function forEachMonth(
  range: MonthRange,
  cb: (y: number, m: number, idx: number) => void,
): void {
  let idx = 0;
  let y = range.yearStart;
  let m = range.monthStart;
  while (y < range.yearEnd || (y === range.yearEnd && m <= range.monthEnd)) {
    cb(y, m, idx++);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
}

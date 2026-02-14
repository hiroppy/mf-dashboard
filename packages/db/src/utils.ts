import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import { eq, type SQL } from "drizzle-orm";
import type { Db } from "./index";

/** 現在時刻を ISO 8601 文字列で返す */
export function now(): string {
  return new Date().toISOString();
}

// ============================================================================
// Upsert Helpers
// ============================================================================

/**
 * Upsert a record by ID.
 * If a record matching the condition exists, update it. Otherwise, insert a new one.
 * Returns the record's ID.
 */
export async function upsertById<T extends { id: number }>(
  db: Db,
  table: SQLiteTable,
  condition: SQL,
  insertValues: Record<string, unknown>,
  updateValues: Record<string, unknown>,
): Promise<number> {
  const existing = (await db.select().from(table).where(condition).get()) as T | undefined;

  if (existing) {
    await db
      .update(table)
      .set({ ...updateValues, updatedAt: now() })
      .where(condition)
      .run();
    return existing.id;
  }

  const result = (await db
    .insert(table)
    .values({ ...insertValues, createdAt: now(), updatedAt: now() })
    .returning()
    .get()) as { id: number };

  return result.id;
}

/**
 * Upsert a record and return it along with whether it was newly created.
 */
export async function upsertOne<T extends { id: number }>(
  db: Db,
  table: SQLiteTable,
  condition: SQL,
  insertValues: Record<string, unknown>,
  updateValues: Record<string, unknown>,
): Promise<{ record: T; isNew: boolean }> {
  const existing = (await db.select().from(table).where(condition).get()) as T | undefined;

  if (existing) {
    await db
      .update(table)
      .set({ ...updateValues, updatedAt: now() })
      .where(condition)
      .run();

    const updated = (await db.select().from(table).where(condition).get()) as T;
    return { record: updated, isNew: false };
  }

  const result = (await db
    .insert(table)
    .values({ ...insertValues, createdAt: now(), updatedAt: now() })
    .returning()
    .get()) as T;

  return { record: result, isNew: true };
}

// ============================================================================
// GetOrCreate Helper
// ============================================================================

/**
 * Get or create a record by name.
 * Returns the record's ID.
 */
export async function getOrCreate(
  db: Db,
  table: SQLiteTable,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  nameColumn: SQLiteColumn<any>,
  name: string,
): Promise<number> {
  const existing = (await db.select().from(table).where(eq(nameColumn, name)).get()) as
    | { id: number }
    | undefined;

  if (existing) {
    return existing.id;
  }

  const timestamp = now();
  const result = (await db
    .insert(table)
    .values({ name, createdAt: timestamp, updatedAt: timestamp })
    .returning()
    .get()) as { id: number };

  return result.id;
}

/** 金額文字列をパースして整数に変換する */
export function parseAmount(str: string): number {
  if (!str) return 0;
  const cleaned = str.replace(/[¥,\s円+]/g, "");
  return parseInt(cleaned, 10) || 0;
}

/**
 * 日付文字列を ISO 8601 形式に変換する。
 *
 * - "01/22(木)" → "YYYY-01-22"
 * - "01/25 08:51" → "YYYY-01-25T08:51:00"
 * - "2021-12月末" → "2021-12-31"
 * - すでに ISO 形式ならそのまま返す
 */
export function convertToIsoDate(dateStr: string, currentYear?: number): string {
  if (!dateStr) return "";

  // すでに ISO 形式の場合はそのまま返す
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    return dateStr;
  }

  const year = currentYear || new Date().getFullYear();

  // "2021-12月末" or "2022-01月末" パターン
  const monthEndMatch = dateStr.match(/^(\d{4})-(\d{1,2})月末$/);
  if (monthEndMatch) {
    const y = parseInt(monthEndMatch[1], 10);
    const m = parseInt(monthEndMatch[2], 10);
    const lastDay = new Date(y, m, 0).getDate();
    return `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  }

  // "01/22(木)" パターン
  const dateOnlyMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})/);
  if (dateOnlyMatch) {
    const month = dateOnlyMatch[1].padStart(2, "0");
    const day = dateOnlyMatch[2].padStart(2, "0");

    // 時刻が含まれている場合 "01/25 08:51"
    const timeMatch = dateStr.match(/(\d{1,2}):(\d{2})/);
    if (timeMatch) {
      const hour = timeMatch[1].padStart(2, "0");
      const minute = timeMatch[2].padStart(2, "0");
      return `${year}-${month}-${day}T${hour}:${minute}:00`;
    }

    return `${year}-${month}-${day}`;
  }

  return dateStr;
}

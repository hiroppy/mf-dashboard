import { eq, and, desc } from "drizzle-orm";
import type { Db } from "../index";
import { schema } from "../index";
import { now } from "../utils";

export interface AnalyticsReportInput {
  groupId: string;
  date: string;
  insights?: {
    summary: string | null;
    savingsInsight: string | null;
    investmentInsight: string | null;
    spendingInsight: string | null;
    balanceInsight: string | null;
    liabilityInsight: string | null;
  } | null;
  model: string | null;
}

export interface AnalyticsReportRow {
  id: number;
  groupId: string;
  date: string;
  summary: string | null;
  savingsInsight: string | null;
  investmentInsight: string | null;
  spendingInsight: string | null;
  balanceInsight: string | null;
  liabilityInsight: string | null;
  model: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function getLatestAnalyticsReport(
  db: Db,
  groupId: string,
): Promise<AnalyticsReportRow | null> {
  const result = await db
    .select()
    .from(schema.analyticsReports)
    .where(eq(schema.analyticsReports.groupId, groupId))
    .orderBy(desc(schema.analyticsReports.date))
    .limit(1)
    .get();

  return result ?? null;
}

export async function getAnalyticsReportByDate(
  db: Db,
  groupId: string,
  date: string,
): Promise<AnalyticsReportRow | null> {
  const result = await db
    .select()
    .from(schema.analyticsReports)
    .where(
      and(eq(schema.analyticsReports.groupId, groupId), eq(schema.analyticsReports.date, date)),
    )
    .get();

  return result ?? null;
}

export async function saveAnalyticsReport(db: Db, report: AnalyticsReportInput): Promise<void> {
  const timestamp = now();
  const existing = await getAnalyticsReportByDate(db, report.groupId, report.date);

  const values = {
    groupId: report.groupId,
    date: report.date,
    summary: report.insights?.summary ?? null,
    savingsInsight: report.insights?.savingsInsight ?? null,
    investmentInsight: report.insights?.investmentInsight ?? null,
    spendingInsight: report.insights?.spendingInsight ?? null,
    balanceInsight: report.insights?.balanceInsight ?? null,
    liabilityInsight: report.insights?.liabilityInsight ?? null,
    model: report.model,
    updatedAt: timestamp,
  };

  if (existing) {
    await db
      .update(schema.analyticsReports)
      .set(values)
      .where(eq(schema.analyticsReports.id, existing.id))
      .run();
  } else {
    await db
      .insert(schema.analyticsReports)
      .values({
        ...values,
        createdAt: timestamp,
      })
      .run();
  }
}

export async function getAnalyticsReports(
  db: Db,
  groupId: string,
  limit = 30,
): Promise<AnalyticsReportRow[]> {
  return await db
    .select()
    .from(schema.analyticsReports)
    .where(eq(schema.analyticsReports.groupId, groupId))
    .orderBy(desc(schema.analyticsReports.date))
    .limit(limit)
    .all();
}

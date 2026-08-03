import * as schema from "../schema/schema";
import {
  ALL_GROUP_IDS,
  GROUP_ID,
  GROUP_ID_INVESTMENT,
  GROUP_ID_LIVING,
  livingCategories,
} from "./accounts";
import { calcGroupTotals, holdingDefs, sumAssetCategory } from "./holdings";
import {
  dateStr,
  daysInMonth,
  forEachMonth,
  monthStr,
  type MonthRange,
  type Now,
  type RandInt,
  type SeedDb,
} from "./shared";
import type { GroupMonthlyData } from "./transactions";

interface SeedAssetHistoryInput {
  db: SeedDb;
  range: MonthRange;
  now: Now;
  randInt: RandInt;
  totalAssets: number;
  asOfDate: string;
  groupMonthlyData: Record<string, GroupMonthlyData>;
  accountCategoryMap: Record<string, string>;
  getGroupsForAccount: (accountName: string) => string[];
}

export async function seedAssetHistory({
  db,
  range,
  now,
  randInt,
  totalAssets,
  asOfDate,
  groupMonthlyData,
  accountCategoryMap,
  getGroupsForAccount,
}: SeedAssetHistoryInput): Promise<number> {
  const monthKeys: string[] = [];
  forEachMonth(range, (y, m) => monthKeys.push(monthStr(y, m)));

  const groupTotals: Record<string, { assets: number; liabilities: number }> = {};
  for (const groupId of ALL_GROUP_IDS) {
    groupTotals[groupId] = calcGroupTotals(groupId, getGroupsForAccount);
  }

  const latestMonth = monthKeys[monthKeys.length - 1];
  if (!latestMonth) return 0;

  const groupMonthlyAssets: Record<string, Record<string, number>> = {};
  for (const groupId of ALL_GROUP_IDS) {
    const { assets: finalAssets } = groupTotals[groupId];
    const monthlyAssets: Record<string, number> = {};
    const incomeData = groupMonthlyData[groupId].income;
    const expenseData = groupMonthlyData[groupId].expense;

    monthlyAssets[latestMonth] = finalAssets;
    for (let i = monthKeys.length - 2; i >= 0; i--) {
      const nextMonth = monthKeys[i + 1]!;
      const thisMonth = monthKeys[i]!;
      const netIncome = (incomeData[nextMonth] || 0) - (expenseData[nextMonth] || 0);
      const investmentChange = randInt(-20000, 30000);
      monthlyAssets[thisMonth] = monthlyAssets[nextMonth] - netIncome - investmentChange;
    }
    groupMonthlyAssets[groupId] = monthlyAssets;
  }

  const generateDailyAssetData = (
    groupId: string,
    finalAssets: number,
  ): { date: string; total: number }[] => {
    const monthlyAssets = groupMonthlyAssets[groupId];
    const data: { date: string; total: number }[] = [];

    forEachMonth(range, (y, m, idx) => {
      const ms = monthStr(y, m);
      const isLastMonth = idx === monthKeys.length - 1;
      const maxDay = isLastMonth ? Number(asOfDate.slice(-2)) : daysInMonth(y, m);
      const startAsset = monthlyAssets[ms];
      const nextMs = monthKeys[idx + 1];
      const endAsset = isLastMonth ? finalAssets : nextMs ? monthlyAssets[nextMs] : finalAssets;

      for (let d = 1; d <= maxDay; d++) {
        const isFirstDay = d === 1;
        const isLastDay = isLastMonth && d === maxDay;

        if (isLastDay) {
          data.push({ date: dateStr(y, m, d), total: finalAssets });
        } else if (isFirstDay) {
          data.push({ date: dateStr(y, m, d), total: startAsset });
        } else {
          const frac = (d - 1) / maxDay;
          const base = startAsset + (endAsset - startAsset) * frac;
          const noise = randInt(-15000, 15000);
          const total = Math.round(base + noise);
          data.push({ date: dateStr(y, m, d), total });
        }
      }
    });

    return data;
  };

  const dailyAssetData = generateDailyAssetData(GROUP_ID, totalAssets);
  const totalDays = dailyAssetData.length;

  const finalDeposit = sumAssetCategory("預金・現金");
  const finalFund = sumAssetCategory("投資信託");
  const finalStock = sumAssetCategory("株式(現物)");
  const finalPension = sumAssetCategory("年金");
  const finalCrypto = sumAssetCategory("暗号資産");
  const finalPoint = sumAssetCategory("ポイント");
  const finalPrepaid = sumAssetCategory("電子マネー・プリペイド");

  const monthStartDayIdx = (monthIdx: number): number => {
    let dayIdx = 0;
    for (let i = 0; i < monthIdx; i++) {
      const mi = range.monthStart + i;
      const yr = range.yearStart + Math.floor((mi - 1) / 12);
      const mo = ((mi - 1) % 12) + 1;
      dayIdx += daysInMonth(yr, mo);
    }
    return dayIdx;
  };

  const fundStartDay = monthStartDayIdx(1);
  const stockStartDay = monthStartDayIdx(3);
  const stockAddDay = monthStartDayIdx(6);
  const pensionStartDay = monthStartDayIdx(0) + 15;
  const cryptoStartDay = monthStartDayIdx(5);
  const pointStartDay = monthStartDayIdx(0);

  const categoryAmount = (dayIdx: number, finalAmount: number, startDay: number): number => {
    if (dayIdx < startDay) return 0;
    const elapsed = dayIdx - startDay;
    const remaining = totalDays - 1 - startDay;
    if (remaining <= 0) return finalAmount;
    const progress = Math.min(1, elapsed / remaining);
    const base = finalAmount * Math.sqrt(progress);
    const noise = finalAmount > 100000 ? randInt(-8000, 8000) : randInt(-200, 200);
    return Math.max(0, Math.round(base + noise));
  };

  const stockAmount = (dayIdx: number): number => {
    if (dayIdx < stockStartDay) return 0;
    const phase1Target = 450000;
    const phase2Target = finalStock;

    if (dayIdx < stockAddDay) {
      const elapsed = dayIdx - stockStartDay;
      const duration = stockAddDay - stockStartDay;
      const progress = elapsed / duration;
      const base = 400000 + (phase1Target - 400000) * progress;
      return Math.max(0, Math.round(base + randInt(-10000, 10000)));
    }

    const elapsed = dayIdx - stockAddDay;
    const remaining = totalDays - 1 - stockAddDay;
    const progress = elapsed / remaining;
    const base = 650000 + (phase2Target - 650000) * progress;
    return Math.max(0, Math.round(base + randInt(-12000, 12000)));
  };

  const groupFinalAssets: Record<string, number> = {};
  for (const gid of ALL_GROUP_IDS) {
    groupFinalAssets[gid] = groupTotals[gid].assets;
  }

  const livingDeposits = holdingDefs
    .filter((holding) => {
      if (holding.type !== "asset") return false;
      if (
        holding.assetCategory !== "預金・現金" &&
        holding.assetCategory !== "電子マネー・プリペイド"
      ) {
        return false;
      }
      const categoryName = accountCategoryMap[holding.accountName];
      return categoryName !== undefined && livingCategories.has(categoryName);
    })
    .reduce((sum, holding) => sum + holding.amount, 0);
  const livingFinalPrepaid = holdingDefs
    .filter(
      (holding) => holding.type === "asset" && holding.assetCategory === "電子マネー・プリペイド",
    )
    .reduce((sum, holding) => sum + holding.amount, 0);
  const livingFinalDeposit = livingDeposits - livingFinalPrepaid;
  const livingFinalPoint = finalPoint;

  await db.transaction(async (tx) => {
    for (const groupId of ALL_GROUP_IDS) {
      const finalAssets = groupFinalAssets[groupId];
      const groupDailyData = generateDailyAssetData(groupId, finalAssets);
      let prevTotal = groupDailyData[0]?.total ?? 0;
      const lastIdx = groupDailyData.length - 1;

      for (let i = 0; i < groupDailyData.length; i++) {
        const { date, total } = groupDailyData[i]!;
        const change = total - prevTotal;
        const ts = now();

        const ahResult = await tx
          .insert(schema.assetHistory)
          .values({
            groupId,
            date,
            totalAssets: total,
            change,
            createdAt: ts,
            updatedAt: ts,
          })
          .returning({ id: schema.assetHistory.id })
          .get();
        const ahId = ahResult!.id;

        const insertCategory = async (categoryName: string, amount: number) => {
          await tx
            .insert(schema.assetHistoryCategories)
            .values({
              assetHistoryId: ahId,
              categoryName,
              amount,
              createdAt: ts,
              updatedAt: ts,
            })
            .run();
        };

        if (groupId === GROUP_ID) {
          let fund: number;
          let stock: number;
          let pension: number;
          let crypto: number;
          let point: number;
          let prepaid: number;
          let deposit: number;
          if (i === lastIdx) {
            fund = finalFund;
            stock = finalStock;
            pension = finalPension;
            crypto = finalCrypto;
            point = finalPoint;
            prepaid = finalPrepaid;
            deposit = finalDeposit;
          } else {
            fund = categoryAmount(i, finalFund, fundStartDay);
            stock = stockAmount(i);
            pension = categoryAmount(i, finalPension, pensionStartDay);
            crypto = categoryAmount(i, finalCrypto, cryptoStartDay);
            point = categoryAmount(i, finalPoint, pointStartDay);
            prepaid = categoryAmount(i, finalPrepaid, pointStartDay);
            deposit = Math.max(0, total - fund - stock - pension - crypto - point - prepaid);
          }

          await insertCategory("預金・現金", deposit);
          if (prepaid > 0) await insertCategory("電子マネー・プリペイド", prepaid);
          if (fund > 0) await insertCategory("投資信託", fund);
          if (stock > 0) await insertCategory("株式(現物)", stock);
          if (pension > 0) await insertCategory("年金", pension);
          if (crypto > 0) await insertCategory("暗号資産", crypto);
          if (point > 0) await insertCategory("ポイント", point);
        } else if (groupId === GROUP_ID_INVESTMENT) {
          let fund: number;
          let stock: number;
          let pension: number;
          let crypto: number;
          if (i === lastIdx) {
            fund = finalFund;
            stock = finalStock;
            pension = finalPension;
            crypto = finalCrypto;
          } else {
            fund = categoryAmount(i, finalFund, fundStartDay);
            stock = stockAmount(i);
            pension = categoryAmount(i, finalPension, pensionStartDay);
            crypto = categoryAmount(i, finalCrypto, cryptoStartDay);
          }

          if (fund > 0) await insertCategory("投資信託", fund);
          if (stock > 0) await insertCategory("株式(現物)", stock);
          if (pension > 0) await insertCategory("年金", pension);
          if (crypto > 0) await insertCategory("暗号資産", crypto);
        } else if (groupId === GROUP_ID_LIVING) {
          let deposit: number;
          let prepaid: number;
          let point: number;
          if (i === lastIdx) {
            deposit = livingFinalDeposit;
            prepaid = livingFinalPrepaid;
            point = livingFinalPoint;
          } else {
            prepaid = categoryAmount(i, livingFinalPrepaid, pointStartDay);
            point = categoryAmount(i, livingFinalPoint, pointStartDay);
            deposit = Math.max(0, total - prepaid - point);
          }

          await insertCategory("預金・現金", deposit);
          if (prepaid > 0) await insertCategory("電子マネー・プリペイド", prepaid);
          if (point > 0) await insertCategory("ポイント", point);
        }

        prevTotal = total;
      }
    }
  });

  return dailyAssetData.length;
}

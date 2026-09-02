import { Prisma } from "@prisma/client";
import type { Session } from "@/lib/auth";
import { actualRevenueStoreScope, validMonth } from "@/lib/actual-revenue";

export type RevenueTargetAction = "query" | "create" | "export" | "view" | "calculate" | "delete";

export function canRevenueTarget(session: Session, action: RevenueTargetAction) {
  if (session.permissions.includes("*")) return true;
  if (session.permissions.includes(`revenue-targets:${action}`)) return true;
  return (action === "query" || action === "view") && (
    session.permissions.includes("operations:view") ||
    session.permissions.includes("actual-revenue:set-monthly-target")
  );
}

export type RevenueTargetFilters = {
  brand?: string;
  storeKeyword?: string;
  targetMonth?: string;
};

export function readRevenueTargetFilters(search: URLSearchParams): RevenueTargetFilters {
  const read = (key: string, max = 100) => search.get(key)?.trim().slice(0, max) || undefined;
  return { brand: read("brand"), storeKeyword: read("storeKeyword"), targetMonth: read("targetMonth", 7) };
}

export function revenueTargetFilterWhere(filters: RevenueTargetFilters): Prisma.StoreMonthlyTargetWhereInput {
  const AND: Prisma.StoreMonthlyTargetWhereInput[] = [];
  if (filters.brand) AND.push({ OR: [{ brandId: filters.brand }, { brandCode: filters.brand }, { brandNameSnapshot: filters.brand }] });
  if (filters.storeKeyword) AND.push({ storeNameSnapshot: { contains: filters.storeKeyword } });
  if (filters.targetMonth) AND.push({ targetMonth: filters.targetMonth });
  return AND.length ? { AND } : {};
}

export async function revenueTargetDataScope(session: Session): Promise<Prisma.StoreMonthlyTargetWhereInput> {
  return { store: await actualRevenueStoreScope(session) };
}

export function previousMonth(targetMonth: string) {
  if (!validMonth(targetMonth)) throw new Error("所属月份格式不正确");
  const [year, month] = targetMonth.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export const revenueTargetListSelect = {
  id: true,
  recordNo: true,
  targetMonth: true,
  brandNameSnapshot: true,
  storeNameSnapshot: true,
  regionNameSnapshot: true,
  targetAmount: true,
  dailyTargetStatus: true,
} satisfies Prisma.StoreMonthlyTargetSelect;

type SelectedRevenueTarget = Prisma.StoreMonthlyTargetGetPayload<{ select: typeof revenueTargetListSelect }>;

export function serializeRevenueTarget(row: SelectedRevenueTarget) {
  return {
    id: row.id,
    recordNo: row.recordNo,
    targetMonth: row.targetMonth,
    brandName: row.brandNameSnapshot,
    storeName: row.storeNameSnapshot,
    regionName: row.regionNameSnapshot || "-",
    targetAmount: row.targetAmount.toFixed(2),
    dailyTargetStatus: row.dailyTargetStatus,
  };
}

export async function nextRevenueTargetRecordNo(tx: Prisma.TransactionClient, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find(item => item.type === type)?.value || "";
  const dateKey = `${part("year")}${part("month")}${part("day")}`;
  const sequence = await tx.storeMonthlyTargetSequence.upsert({
    where: { dateKey },
    create: { dateKey, nextValue: 2 },
    update: { nextValue: { increment: 1 } },
  });
  const value = sequence.nextValue - 1;
  if (value > 9999) throw new Error("当日目标营业额记录编号已达到上限");
  return `${dateKey}${String(value).padStart(4, "0")}`;
}

export const targetSourceSelect = {
  id: true,
  statMonth: true,
  storeId: true,
  storeNameSnapshot: true,
  brandId: true,
  brandNameSnapshot: true,
  regionNameSnapshot: true,
  monthlyRevenue: true,
  monthlyTarget: { select: { id: true } },
  store: { select: { id: true, name: true, region: true, brandId: true, brand: { select: { id: true, code: true, name: true } } } },
} satisfies Prisma.ActualRevenueMonthlySelect;

export type RevenueTargetSource = Prisma.ActualRevenueMonthlyGetPayload<{ select: typeof targetSourceSelect }>;

export async function createRevenueTargetWithTransaction(tx: Prisma.TransactionClient, input: {
  source: RevenueTargetSource;
  targetMonth: string;
  targetAmount: Prisma.Decimal;
  remark?: string | null;
  sourceType: "ACTUAL_REVENUE" | "MANUAL";
  session: Session;
}) {
  const { source, session } = input;
  if (source.monthlyTarget) throw new Error("MONTHLY_TARGET_EXISTS");
  if (source.statMonth !== previousMonth(input.targetMonth)) throw new Error("PREVIOUS_ACTUAL_MISMATCH");
  const recordNo = await nextRevenueTargetRecordNo(tx);
  return tx.storeMonthlyTarget.create({ data: {
    recordNo,
    sourceActualRevenueId: source.id,
    storeId: source.storeId,
    storeNameSnapshot: source.store.name,
    brandId: source.store.brandId,
    brandCode: source.store.brand.code,
    brandNameSnapshot: source.store.brand.name,
    regionNameSnapshot: source.store.region,
    targetMonth: input.targetMonth,
    previousActualMonth: source.statMonth,
    previousActualRevenueSnapshot: source.monthlyRevenue,
    targetAmount: input.targetAmount,
    dailyTargetStatus: "PENDING",
    remark: input.remark || null,
    sourceType: input.sourceType,
    createdByUserId: session.userId,
    createdByUsername: session.username,
    createdByName: session.realName,
  } });
}

const weekdayNames = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"] as const;

export class RevenueTargetCalculationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RevenueTargetCalculationError";
  }
}

export type RevenueTargetDailyCalculation = {
  targetDate: Date;
  weekday: string;
  targetAmount: Prisma.Decimal;
};

export type RevenueTargetCalculationResult = {
  dailyTargets: RevenueTargetDailyCalculation[];
  initialAverages: Prisma.Decimal[];
  secondaryAverages: Prisma.Decimal[];
  excludedCounts: number[];
  estimatedMonthAmount: Prisma.Decimal;
  coefficient: Prisma.Decimal;
};

function decimalMean(values: Prisma.Decimal[]) {
  return values.reduce((total, value) => total.plus(value), new Prisma.Decimal(0)).div(values.length);
}

function monthDates(monthText: string) {
  if (!validMonth(monthText)) throw new RevenueTargetCalculationError("所属月份格式不正确");
  const [year, month] = monthText.split("-").map(Number);
  const dayCount = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Array.from({ length: dayCount }, (_, index) => new Date(Date.UTC(year, month - 1, index + 1)));
}

export function calculateRevenueDailyTargets(input: {
  targetMonth: string;
  targetAmount: Prisma.Decimal;
  previousDaily: Array<{ businessDate: Date; revenueAmount: Prisma.Decimal }>;
}): RevenueTargetCalculationResult {
  if (!input.targetAmount.greaterThan(0)) throw new RevenueTargetCalculationError("月度目标销售金额必须大于0");
  const grouped = Array.from({ length: 7 }, () => [] as Prisma.Decimal[]);
  for (const item of input.previousDaily) {
    if (item.revenueAmount.isNegative()) throw new RevenueTargetCalculationError("上月实际营业额不能为负数");
    grouped[item.businessDate.getUTCDay()].push(item.revenueAmount);
  }

  const initialAverages: Prisma.Decimal[] = [];
  const secondaryAverages: Prisma.Decimal[] = [];
  const excludedCounts: number[] = [];
  for (let weekday = 0; weekday < 7; weekday += 1) {
    const samples = grouped[weekday];
    if (!samples.length) throw new RevenueTargetCalculationError(`上月实际营业额缺少${weekdayNames[weekday]}数据，无法计算每日目标`);
    const initial = decimalMean(samples);
    const retained = initial.isZero()
      ? samples.filter(value => value.isZero())
      : samples.filter(value => value.minus(initial).abs().div(initial).lessThanOrEqualTo("0.2"));
    if (!retained.length) throw new RevenueTargetCalculationError(`上月${weekdayNames[weekday]}数据剔除异常值后没有有效样本，无法计算每日目标`);
    initialAverages[weekday] = initial;
    secondaryAverages[weekday] = decimalMean(retained);
    excludedCounts[weekday] = samples.length - retained.length;
  }

  const targetDates = monthDates(input.targetMonth);
  const estimatedMonthAmount = targetDates.reduce((total, date) => total.plus(secondaryAverages[date.getUTCDay()]), new Prisma.Decimal(0));
  if (!estimatedMonthAmount.greaterThan(0)) throw new RevenueTargetCalculationError("二次均值预估月营业额为0，无法计算每日目标");
  const coefficient = input.targetAmount.div(estimatedMonthAmount);

  const rawCents = targetDates.map(date => secondaryAverages[date.getUTCDay()].times(coefficient).times(100));
  const cents = rawCents.map(value => BigInt(value.floor().toFixed(0)));
  const targetCents = BigInt(input.targetAmount.times(100).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toFixed(0));
  let difference = targetCents - cents.reduce((total, value) => total + value, 0n);
  const largestRemainders = rawCents.map((value, index) => ({ index, remainder: value.minus(value.floor()) })).sort((left, right) => right.remainder.comparedTo(left.remainder));
  const smallestRemainders = [...largestRemainders].reverse();
  let cursor = 0;
  while (difference > 0n) {
    cents[largestRemainders[cursor % largestRemainders.length].index] += 1n;
    difference -= 1n;
    cursor += 1;
  }
  cursor = 0;
  while (difference < 0n) {
    const targetIndex = smallestRemainders[cursor % smallestRemainders.length].index;
    if (cents[targetIndex] > 0n) { cents[targetIndex] -= 1n; difference += 1n; }
    cursor += 1;
    if (cursor > cents.length * 2 && difference < 0n) throw new RevenueTargetCalculationError("每日目标金额尾差分配失败，请稍后重试");
  }

  return {
    dailyTargets: targetDates.map((targetDate, index) => ({
      targetDate,
      weekday: weekdayNames[targetDate.getUTCDay()],
      targetAmount: new Prisma.Decimal(cents[index].toString()).div(100),
    })),
    initialAverages,
    secondaryAverages,
    excludedCounts,
    estimatedMonthAmount,
    coefficient,
  };
}

export function weekdayText(value: Date) {
  return weekdayNames[value.getUTCDay()];
}

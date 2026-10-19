import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { Session } from "@/lib/auth";
import { dateKeyAsDbDate } from "@/lib/store-h5-tasks";
import {
  dailySalesReportFilterWhere,
  dailySalesReportSourceWhere,
  type DailySalesReportFilters,
  type DailySalesReportSource,
} from "@/lib/daily-sales-report";

export const ONLINE_GROUP_BUY_PAGE_NAME = "线上团购数据";

function validDateKey(value: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value)) return false;
  return dateKeyAsDbDate(value).toISOString().slice(0, 10) === value;
}

export const onlineGroupBuyFiltersSchema = z.object({
  brand: z.string().trim().max(100, "品牌筛选条件不正确").default(""),
  storeName: z.string().trim().max(100, "门店名称不正确").default(""),
  storeNameKeyword: z.string().trim().max(100, "门店名称不能超过100个字符").default(""),
  startDate: z.string().trim().default("").refine(value => !value || validDateKey(value), "开始日期格式不正确"),
  endDate: z.string().trim().default("").refine(value => !value || validDateKey(value), "截止日期格式不正确"),
}).superRefine((value, context) => {
  if (value.startDate && value.endDate && value.startDate > value.endDate) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["startDate"], message: "开始日期不能晚于截止日期" });
  }
});

export type OnlineGroupBuyFilters = z.infer<typeof onlineGroupBuyFiltersSchema>;

export function readOnlineGroupBuyFilters(search: URLSearchParams) {
  return onlineGroupBuyFiltersSchema.safeParse({
    brand: search.get("brand") || "",
    storeName: search.get("storeName") || "",
    storeNameKeyword: search.get("storeNameKeyword") || "",
    startDate: search.get("startDate") || "",
    endDate: search.get("endDate") || "",
  });
}

export function onlineGroupBuyFilterWhere(filters: OnlineGroupBuyFilters): Prisma.TaskSubmissionWhereInput {
  const common: DailySalesReportFilters = {
    brand: filters.brand,
    storeNameKeyword: filters.storeName ? "" : filters.storeNameKeyword,
    startDate: filters.startDate,
    endDate: filters.endDate,
  };
  const where = dailySalesReportFilterWhere(common);
  if (!filters.storeName) return where;
  return {
    AND: [where, { storeNameSnapshot: filters.storeName }],
  };
}

export function onlineGroupBuySourceWhere(source: DailySalesReportSource): Prisma.TaskSubmissionWhereInput {
  return dailySalesReportSourceWhere(source);
}

export function canOnlineGroupBuy(session: Pick<Session, "permissions">, action: "query" | "view" | "export") {
  if (session.permissions.includes("*")) return true;
  if (session.permissions.includes(`online-group-buy:${action}`)) return true;
  if (action === "view" && (session.permissions.includes("online-group-buy:query") || session.permissions.includes("operations:view"))) return true;
  return action === "query" && session.permissions.includes("operations:view");
}

export function onlineGroupBuyPercent(amount: number | null, receivedAmount: number | null) {
  if (amount === null || receivedAmount === null || receivedAmount === 0) return null;
  const ratio = amount / receivedAmount * 100;
  return Number.isFinite(ratio) ? ratio : null;
}

export function withOnlineGroupBuyPercentages<T extends {
  meituanAmount: number | null;
  douyinAmount: number | null;
  kuaishouAmount: number | null;
  gaodeAmount: number | null;
  takeawayAmount: number | null;
  scanCashAmount: number | null;
  receivedAmount: number | null;
}>(row: T) {
  return {
    ...row,
    meituanPercent: onlineGroupBuyPercent(row.meituanAmount, row.receivedAmount),
    douyinPercent: onlineGroupBuyPercent(row.douyinAmount, row.receivedAmount),
    kuaishouPercent: onlineGroupBuyPercent(row.kuaishouAmount, row.receivedAmount),
    gaodePercent: onlineGroupBuyPercent(row.gaodeAmount, row.receivedAmount),
    takeawayPercent: onlineGroupBuyPercent(row.takeawayAmount, row.receivedAmount),
    offlinePercent: onlineGroupBuyPercent(row.scanCashAmount, row.receivedAmount),
  };
}

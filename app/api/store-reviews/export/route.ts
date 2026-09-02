import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";
import {
  canStoreReview, formatReviewDate, storeReviewDataScope, storeReviewFilterWhere,
  storeReviewSelect, validDate,
} from "@/lib/store-reviews";

const bodySchema = z.object({
  recordIds: z.array(z.string().min(1)).max(10000).optional(),
  filters: z.object({
    brand: z.string().optional(), storeId: z.string().optional(), assessmentType: z.string().optional(),
    startDate: z.string().optional(), endDate: z.string().optional(), reviewerUserId: z.string().optional(), reviewerName: z.string().max(50).optional(),
  }).default({}),
});

function timestamp() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const value = (type: string) => parts.find(part => part.type === type)?.value || "";
  return `${value("year")}${value("month")}${value("day")}_${value("hour")}${value("minute")}${value("second")}`;
}

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canStoreReview(session, "export")) return NextResponse.json({ message: "暂无门店稽核评分导出权限" }, { status: 403 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "导出参数不正确" }, { status: 400 });
  const { filters, recordIds } = parsed.data;
  if (!validDate(filters.startDate) || !validDate(filters.endDate) || (filters.startDate && filters.endDate && filters.startDate > filters.endDate)) {
    return NextResponse.json({ message: "考核日期范围不正确" }, { status: 400 });
  }
  try {
    const where = { AND: [await storeReviewDataScope(session), recordIds?.length ? { AND: [{ reviewType: { in: ["FRONT_HALL_AUDIT", "BACK_KITCHEN_AUDIT"] } }, { id: { in: recordIds } }] } : storeReviewFilterWhere(filters)] };
    const rows = await db.leadH5Review.findMany({ where, select: storeReviewSelect, orderBy: [{ assessmentDate: "desc" }, { createdAt: "desc" }] });
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "餐饮管理系统";
    const sheet = workbook.addWorksheet("门店稽核评分");
    sheet.columns = [
      { header: "记录编号", key: "recordNo", width: 17 }, { header: "品牌", key: "brand", width: 16 },
      { header: "考核门店", key: "store", width: 28 }, { header: "考核月份", key: "month", width: 14 },
      { header: "考核表类型", key: "type", width: 20 },
      { header: "负责人", key: "responsible", width: 14 }, { header: "考核日期", key: "date", width: 14 },
      { header: "考核得分", key: "score", width: 14 }, { header: "考核督导", key: "reviewer", width: 14 },
    ];
    for (const row of rows) sheet.addRow({ recordNo: row.recordNo, brand: row.brandNameSnapshot, store: row.storeNameSnapshot, month: row.reviewMonth.replace("-", "年") + "月", type: row.assessmentName, responsible: row.responsiblePersonNameSnapshot || "-", date: formatReviewDate(row.assessmentDate), score: Number(row.actualScore), reviewer: row.reviewerRealName });
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1677FF" } };
    sheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = { from: "A1", to: "I1" };
    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `门店稽核评分_${timestamp()}.xlsx`;
    await writeOperationLog({ userId: session.userId, username: session.username, page: "门店稽核评分", action: "批量导出", result: "成功", detail: `导出 ${rows.length} 条评分记录`, request }).catch(() => undefined);
    return new NextResponse(Buffer.from(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}` } });
  } catch {
    await writeOperationLog({ userId: session.userId, username: session.username, page: "门店稽核评分", action: "批量导出", result: "失败", detail: "评分记录导出失败", request }).catch(() => undefined);
    return NextResponse.json({ message: "门店稽核评分导出失败，请稍后重试" }, { status: 500 });
  }
}

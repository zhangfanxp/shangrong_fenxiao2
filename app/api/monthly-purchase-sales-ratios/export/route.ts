import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";
import {
  canMonthlyPurchaseSales, monthlyPurchaseSalesDataScope,
  monthlyPurchaseSalesFilterWhere, monthlyPurchaseSalesFiltersSchema,
  monthlyPurchaseSalesSelect,
} from "@/lib/monthly-purchase-sales-ratios";

const bodySchema = z.object({
  recordIds: z.array(z.string().trim().min(1)).max(50000).optional(),
  filters: monthlyPurchaseSalesFiltersSchema.default({}),
});

function timestamp() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value || "";
  return `${value("year")}${value("month")}${value("day")}_${value("hour")}${value("minute")}${value("second")}`;
}

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canMonthlyPurchaseSales(session, "export")) return NextResponse.json({ message: "暂无每月采销比导出权限" }, { status: 403 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message || "导出参数不正确" }, { status: 400 });
  const recordIds = parsed.data.recordIds?.length ? [...new Set(parsed.data.recordIds)] : undefined;
  try {
    const where = { AND: [await monthlyPurchaseSalesDataScope(session), recordIds ? { id: { in: recordIds } } : monthlyPurchaseSalesFilterWhere(parsed.data.filters)] };
    const total = await db.monthlyPurchaseSalesRatio.count({ where });
    if (total > 50000) return NextResponse.json({ message: "当前筛选结果超过50000条，请缩小筛选范围后导出" }, { status: 413 });
    const rows = await db.monthlyPurchaseSalesRatio.findMany({ where, select: monthlyPurchaseSalesSelect, orderBy: [{ year: "desc" }, { month: "desc" }, { storeNameSnapshot: "asc" }] });
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "餐饮管理系统";
    const sheet = workbook.addWorksheet("每月采销比");
    sheet.columns = [
      { header: "记录编号", key: "recordNo", width: 17 },
      { header: "所属年份", key: "year", width: 12 },
      { header: "所属月份", key: "month", width: 12 },
      { header: "门店名称", key: "storeName", width: 26 },
      { header: "门店（别名）", key: "storeAlias", width: 26 },
      { header: "品牌", key: "brandName", width: 16 },
      { header: "折前销售额", key: "preDiscountSales", width: 18, style: { numFmt: "#,##0.00" } },
      { header: "要货金额", key: "purchaseAmount", width: 18, style: { numFmt: "#,##0.00" } },
      { header: "折前要货占销比", key: "ratio", width: 20, style: { numFmt: "0.00%" } },
      { header: "创建时间", key: "createdAt", width: 22 },
      { header: "创建人", key: "createdByName", width: 16 },
    ];
    for (const row of rows) sheet.addRow({
      recordNo: row.recordNo,
      year: row.year,
      month: `${row.month}月`,
      storeName: row.storeNameSnapshot,
      storeAlias: row.meituanAliasSnapshot,
      brandName: row.brandNameSnapshot,
      preDiscountSales: row.preDiscountSales.toNumber(),
      purchaseAmount: row.purchaseAmount.toNumber(),
      ratio: row.preDiscountPurchaseSalesRatio.div(100).toNumber(),
      createdAt: new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(row.createdAt).replaceAll("/", "-"),
      createdByName: row.createdByNameSnapshot,
    });
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1677FF" } };
    sheet.getRow(1).alignment = { horizontal: "center", vertical: "middle" };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = { from: "A1", to: "K1" };
    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `每月采销比_${timestamp()}.xlsx`;
    await writeOperationLog({ userId: session.userId, username: session.username, page: "每月采销比", action: "批量导出", result: "成功", detail: `${recordIds ? `已选择 ${recordIds.length} 条` : "当前筛选结果全部"}；实际导出 ${rows.length} 条`, request }).catch(() => undefined);
    return new NextResponse(Buffer.from(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}` } });
  } catch {
    await writeOperationLog({ userId: session.userId, username: session.username, page: "每月采销比", action: "批量导出", result: "失败", detail: "导出处理失败", request }).catch(() => undefined);
    return NextResponse.json({ message: "月度采销比导出失败，请稍后重试" }, { status: 500 });
  }
}

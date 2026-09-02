import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";
import { canRevenueTarget, revenueTargetDataScope, revenueTargetFilterWhere } from "@/lib/revenue-targets";

const bodySchema = z.object({
  recordIds: z.array(z.string().min(1)).max(10000).optional(),
  filters: z.object({
    brand: z.string().max(100).optional(),
    storeKeyword: z.string().max(100).optional(),
    targetMonth: z.string().max(7).optional(),
  }).default({}),
});

function timestamp() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value || "";
  return `${value("year")}${value("month")}${value("day")}_${value("hour")}${value("minute")}${value("second")}`;
}

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canRevenueTarget(session, "export")) return NextResponse.json({ message: "暂无目标营业额导出权限" }, { status: 403 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "导出参数不正确" }, { status: 400 });
  const recordIds = parsed.data.recordIds?.length ? [...new Set(parsed.data.recordIds)] : undefined;
  if (parsed.data.filters.targetMonth && !/^\d{4}-(0[1-9]|1[0-2])$/.test(parsed.data.filters.targetMonth)) return NextResponse.json({ message: "所属月份格式不正确" }, { status: 400 });
  try {
    const where = { AND: [await revenueTargetDataScope(session), recordIds ? { id: { in: recordIds } } : revenueTargetFilterWhere(parsed.data.filters)] };
    const total = await db.storeMonthlyTarget.count({ where });
    if (recordIds && total !== recordIds.length) return NextResponse.json({ message: "部分记录已不存在或无权导出，请刷新列表后重试" }, { status: 403 });
    if (total > 50000) return NextResponse.json({ message: "当前筛选结果超过 50000 条，请缩小筛选范围后导出" }, { status: 413 });
    const rows = await db.storeMonthlyTarget.findMany({ where, orderBy: [{ targetMonth: "desc" }, { storeNameSnapshot: "asc" }] });
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "餐饮管理系统";
    const sheet = workbook.addWorksheet("目标营业额");
    sheet.columns = [
      { header: "记录编号", key: "recordNo", width: 17 },
      { header: "所属月份", key: "targetMonth", width: 14 },
      { header: "品牌", key: "brand", width: 16 },
      { header: "门店名称", key: "store", width: 28 },
      { header: "所属区域", key: "region", width: 18 },
      { header: "目标营业额", key: "targetAmount", width: 18 },
      { header: "每日目标分解", key: "dailyTarget", width: 16 },
    ];
    for (const row of rows) sheet.addRow({
      recordNo: row.recordNo,
      targetMonth: row.targetMonth,
      brand: row.brandNameSnapshot,
      store: row.storeNameSnapshot,
      region: row.regionNameSnapshot || "-",
      targetAmount: Number(row.targetAmount),
      dailyTarget: row.dailyTargetStatus === "GENERATED" ? "已生成" : "待生成",
    });
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1677FF" } };
    sheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = { from: "A1", to: "G1" };
    sheet.getColumn("targetAmount").numFmt = "#,##0.00";
    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `目标营业额_${timestamp()}.xlsx`;
    await writeOperationLog({ userId: session.userId, username: session.username, page: "目标营业额", action: "批量导出", result: "成功", detail: `导出 ${rows.length} 条目标营业额记录`, request }).catch(() => undefined);
    return new NextResponse(Buffer.from(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}` } });
  } catch {
    await writeOperationLog({ userId: session.userId, username: session.username, page: "目标营业额", action: "批量导出", result: "失败", detail: "目标营业额导出失败", request }).catch(() => undefined);
    return NextResponse.json({ message: "目标营业额导出失败，请稍后重试" }, { status: 500 });
  }
}

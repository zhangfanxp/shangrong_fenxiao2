import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";
import { actualRevenueDataScope, canActualRevenue } from "@/lib/actual-revenue";

const schema = z.object({ recordIds: z.array(z.string().min(1)).min(1, "请至少选择一条实际营业额记录").max(10000) });

function timestamp() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const value = (type: string) => parts.find(part => part.type === type)?.value || "";
  return `${value("year")}${value("month")}${value("day")}_${value("hour")}${value("minute")}${value("second")}`;
}

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canActualRevenue(session, "export")) return NextResponse.json({ message: "暂无实际营业额导出权限" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message || "导出参数不正确" }, { status: 400 });
  const recordIds = [...new Set(parsed.data.recordIds)];
  try {
    const rows = await db.actualRevenueMonthly.findMany({
      where: { AND: [{ id: { in: recordIds } }, await actualRevenueDataScope(session)] },
      include: { monthlyTarget: true },
      orderBy: [{ statMonth: "desc" }, { storeNameSnapshot: "asc" }],
    });
    if (rows.length !== recordIds.length) return NextResponse.json({ message: "部分记录已不存在或无权导出，请刷新列表后重试" }, { status: 403 });
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "餐饮管理系统";
    const sheet = workbook.addWorksheet("实际营业额");
    sheet.columns = [
      { header: "记录编号", key: "recordNo", width: 17 },
      { header: "统计月份", key: "statMonth", width: 14 },
      { header: "品牌", key: "brand", width: 16 },
      { header: "门店名称", key: "store", width: 28 },
      { header: "所属区域", key: "region", width: 18 },
      { header: "（月）营业额", key: "revenue", width: 18 },
      { header: "月目标", key: "target", width: 18 },
      { header: "日目标", key: "dailyTarget", width: 14 },
    ];
    for (const row of rows) sheet.addRow({
      recordNo: row.recordNo,
      statMonth: row.statMonth,
      brand: row.brandNameSnapshot,
      store: row.storeNameSnapshot,
      region: row.regionNameSnapshot || "-",
      revenue: Number(row.monthlyRevenue),
      target: row.monthlyTarget ? Number(row.monthlyTarget.targetAmount) : "-",
      dailyTarget: row.dailyTargetStatus === "GENERATED" ? "已生成" : "-",
    });
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1677FF" } };
    sheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = { from: "A1", to: "H1" };
    sheet.getColumn("revenue").numFmt = "#,##0.00";
    sheet.getColumn("target").numFmt = "#,##0.00";
    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `实际营业额_${timestamp()}.xlsx`;
    await writeOperationLog({ userId: session.userId, username: session.username, page: "实际营业额", action: "批量导出", result: "成功", detail: `导出 ${rows.length} 条月度记录`, request }).catch(() => undefined);
    return new NextResponse(Buffer.from(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}` } });
  } catch {
    await writeOperationLog({ userId: session.userId, username: session.username, page: "实际营业额", action: "批量导出", result: "失败", detail: "实际营业额导出失败", request }).catch(() => undefined);
    return NextResponse.json({ message: "营业额数据导出失败，请稍后重试" }, { status: 500 });
  }
}


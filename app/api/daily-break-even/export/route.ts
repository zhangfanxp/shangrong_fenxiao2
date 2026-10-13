import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import {
  DailyBreakEvenError,
  canDailyBreakEven,
  dailyBreakEvenDataScope,
  dailyBreakEvenFiltersSchema,
  dailyBreakEvenFilterWhere,
  dailyBreakEvenSelect,
  dailyBreakEvenSourceWhere,
  filterDailyBreakEvenByAchievement,
  loadDailyBreakEvenSource,
  serializeDailyBreakEven,
} from "@/lib/daily-break-even";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";

const bodySchema = z.object({
  recordIds: z.array(z.string().trim().min(1)).max(50000).optional(),
  filters: dailyBreakEvenFiltersSchema.default({}),
});

function timestamp() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value || "";
  return `${value("year")}${value("month")}${value("day")}_${value("hour")}${value("minute")}${value("second")}`;
}

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canDailyBreakEven(session, "export")) return NextResponse.json({ message: "暂无每日保本营业额导出权限" }, { status: 403 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message || "导出参数不正确" }, { status: 400 });
  const recordIds = parsed.data.recordIds?.length ? [...new Set(parsed.data.recordIds)] : undefined;
  try {
    const source = await loadDailyBreakEvenSource();
    const where = { AND: [
      dailyBreakEvenSourceWhere(source),
      await dailyBreakEvenDataScope(session),
      recordIds ? { id: { in: recordIds } } : dailyBreakEvenFilterWhere(parsed.data.filters),
    ] };
    const sourceRows = await db.taskSubmission.findMany({
      where,
      select: dailyBreakEvenSelect(source),
      orderBy: [{ executionDate: "desc" }, { submittedAt: "desc" }, { id: "desc" }],
      take: 50001,
    });
    const serializedRows = sourceRows.map(row => serializeDailyBreakEven(row, source));
    const rows = recordIds ? serializedRows : filterDailyBreakEvenByAchievement(serializedRows, parsed.data.filters.achievement);
    if (sourceRows.length > 50000 || rows.length > 50000) return NextResponse.json({ message: "当前筛选结果超过50000条，请缩小筛选范围后导出" }, { status: 413 });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "餐饮管理系统";
    const sheet = workbook.addWorksheet("每日保本营业额");
    sheet.columns = [
      { header: "任务记录编号", key: "taskRecordNo", width: 20 },
      { header: "业务日期", key: "businessDate", width: 16 },
      { header: "上报时间", key: "submittedAt", width: 22 },
      { header: "品牌", key: "brandName", width: 18 },
      { header: "门店", key: "storeName", width: 28 },
      { header: "上报人", key: "submitterName", width: 16 },
      { header: "【营业数据】实收金额", key: "receivedAmount", width: 24, style: { numFmt: "#,##0.00" } },
      { header: "月保本营业额", key: "monthlyBreakEvenRevenue", width: 20, style: { numFmt: "#,##0.00" } },
      { header: "日保本营业额", key: "dailyBreakEvenRevenue", width: 20, style: { numFmt: "#,##0.00" } },
      { header: "保本达标", key: "achievementLabel", width: 16 },
    ];
    rows.forEach(row => sheet.addRow({
      ...row,
      receivedAmount: row.receivedAmount ?? "-",
      monthlyBreakEvenRevenue: row.monthlyBreakEvenRevenue ?? "-",
      dailyBreakEvenRevenue: row.dailyBreakEvenRevenue ?? "-",
      achievementLabel: row.achievementLabel ?? "-",
    }));
    sheet.getRow(1).height = 24;
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1677FF" } };
    sheet.getRow(1).alignment = { horizontal: "center", vertical: "middle" };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = { from: "A1", to: "J1" };
    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `每日保本营业额_${timestamp()}.xlsx`;
    await writeOperationLog({
      userId: session.userId,
      username: session.username,
      client: "运营PC端",
      page: "每日保本营业额",
      action: "批量导出",
      result: "成功",
      detail: `业务数据源：${source.sourceRecordNo}；${recordIds ? `已选择 ${recordIds.length} 条` : "当前筛选结果全部"}；实际导出 ${rows.length} 条`,
      request,
    }).catch(() => undefined);
    return new NextResponse(Buffer.from(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      },
    });
  } catch (error) {
    const message = error instanceof DailyBreakEvenError ? error.message : "每日保本营业额导出失败，请稍后重试";
    const status = error instanceof DailyBreakEvenError ? error.status : 500;
    await writeOperationLog({ userId: session.userId, username: session.username, client: "运营PC端", page: "每日保本营业额", action: "批量导出", result: "失败", detail: message, request }).catch(() => undefined);
    return NextResponse.json({ message }, { status });
  }
}

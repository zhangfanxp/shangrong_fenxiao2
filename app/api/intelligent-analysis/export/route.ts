import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  canIntelligentAnalysis, intelligentAnalysisDataScope, intelligentAnalysisListSelect, intelligentAnalysisWhere,
  serializeIntelligentAnalysis, validIntelligentAnalysisDate,
} from "@/lib/intelligent-analysis";
import { writeOperationLog } from "@/lib/operation-log";

const filtersSchema = z.object({
  brand: z.string().optional(),
  storeKeyword: z.string().optional(),
  taskSettingId: z.string().optional(),
  taskRecordNo: z.string().optional(),
  executorKeyword: z.string().optional(),
  taskStartDate: z.string().optional(),
  taskEndDate: z.string().optional(),
});

const bodySchema = z.object({
  analysisIds: z.array(z.string().trim().min(1)).max(10000).optional(),
  filters: filtersSchema.default({}),
});

function timestamp() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value || "";
  return `${value("year")}${value("month")}${value("day")}_${value("hour")}${value("minute")}${value("second")}`;
}

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canIntelligentAnalysis(session, "export")) return NextResponse.json({ message: "暂无智能分析导出权限" }, { status: 403 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "导出参数不正确" }, { status: 400 });
  const { analysisIds, filters } = parsed.data;
  if (!validIntelligentAnalysisDate(filters.taskStartDate) || !validIntelligentAnalysisDate(filters.taskEndDate) || (filters.taskStartDate && filters.taskEndDate && filters.taskStartDate > filters.taskEndDate)) {
    return NextResponse.json({ message: "任务日期范围不正确" }, { status: 400 });
  }
  try {
    const where = analysisIds?.length
      ? { AND: [await intelligentAnalysisDataScope(session), { id: { in: [...new Set(analysisIds)] } }] }
      : await intelligentAnalysisWhere(session, filters);
    const total = await db.taskAiAnalysis.count({ where });
    if (total > 50000) return NextResponse.json({ message: "当前筛选结果超过 50000 条，请缩小筛选范围后导出" }, { status: 413 });
    const rows = await db.taskAiAnalysis.findMany({ where, select: intelligentAnalysisListSelect, orderBy: [{ analyzedAt: "desc" }, { id: "desc" }] });
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "餐饮管理系统";
    const sheet = workbook.addWorksheet("智能分析");
    sheet.columns = [
      { header: "记录编号", key: "recordNo", width: 18 },
      { header: "任务名称", key: "taskName", width: 28 },
      { header: "任务记录编号", key: "taskRecordNo", width: 20 },
      { header: "品牌", key: "brandName", width: 16 },
      { header: "门店名称", key: "storeName", width: 28 },
      { header: "任务执行人", key: "executorName", width: 16 },
      { header: "任务提交时间", key: "taskSubmittedAt", width: 22 },
      { header: "分析结果", key: "analysisResultSummary", width: 32 },
    ];
    for (const source of rows) sheet.addRow(serializeIntelligentAnalysis(source));
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1677FF" } };
    sheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = { from: "A1", to: "H1" };
    sheet.getColumn("analysisResultSummary").alignment = { vertical: "top", wrapText: true };
    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `智能分析_${timestamp()}.xlsx`;
    await writeOperationLog({ userId: session.userId, username: session.username, page: "智能分析", action: "批量导出", result: "成功", detail: `导出${rows.length}条智能分析记录`, request }).catch(() => undefined);
    return new NextResponse(Buffer.from(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}` } });
  } catch {
    await writeOperationLog({ userId: session.userId, username: session.username, page: "智能分析", action: "批量导出", result: "失败", detail: "智能分析记录导出失败", request }).catch(() => undefined);
    return NextResponse.json({ message: "智能分析记录导出失败，请稍后重试" }, { status: 500 });
  }
}

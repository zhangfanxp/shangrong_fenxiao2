import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { backfillLegacyOperationLogs, shanghaiDateTime, writeOperationLog } from "@/lib/operation-log";
import { canOperationLog } from "@/lib/operation-log-permissions";
import {
  operationLogFilterDescription,
  operationLogJson,
  operationLogWhere,
  validateOperationLogFilters,
} from "@/lib/operation-log-query";

const bodySchema = z.object({
  ids: z.array(z.string().min(1)).optional(),
  filters: z.object({
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
    ipAddress: z.string().optional(),
  }).optional(),
});

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canOperationLog(session, "export")) return NextResponse.json({ message: "暂无操作日志导出权限" }, { status: 403 });
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ message: "导出条件不正确" }, { status: 400 });
  const parsed = validateOperationLogFilters(body.data.filters || {});
  if (!parsed.ok) return NextResponse.json({ message: parsed.message }, { status: 400 });

  try {
    await backfillLegacyOperationLogs();
    const selectedIds = body.data.ids?.filter(Boolean) || [];
    const where = selectedIds.length ? { id: { in: selectedIds } } : operationLogWhere(parsed.filters);
    const sourceRows = await db.operationLog.findMany({
      where,
      include: { user: { select: { username: true } } },
      orderBy: [{ createdAt: "desc" }, { recordNo: "desc" }],
    });
    const rows = sourceRows.map(operationLogJson);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "餐饮运营管理平台";
    const sheet = workbook.addWorksheet("操作日志");
    sheet.columns = [
      { header: "记录编号", key: "recordNo", width: 18 },
      { header: "用户名", key: "username", width: 18 },
      { header: "操作端", key: "client", width: 18 },
      { header: "页面", key: "page", width: 20 },
      { header: "功能", key: "action", width: 16 },
      { header: "操作结果", key: "result", width: 12 },
      { header: "操作日期", key: "operationDate", width: 14 },
      { header: "操作时间", key: "operationTime", width: 12 },
      { header: "IP地址", key: "ip", width: 22 },
    ];
    rows.forEach(row => sheet.addRow(row));
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = { from: "A1", to: "I1" };
    const buffer = await workbook.xlsx.writeBuffer();
    const exportedAt = shanghaiDateTime();
    const filename = `操作日志_${exportedAt.dateKey}_${exportedAt.operationTime.replaceAll(":", "")}.xlsx`;
    await writeOperationLog({
      userId: session.userId,
      username: session.username,
      page: "操作日志",
      action: "导出",
      result: "成功",
      detail: selectedIds.length ? `导出已选择的${rows.length}条操作日志` : `${operationLogFilterDescription(parsed.filters)}；导出${rows.length}条`,
      request,
    });
    return new NextResponse(buffer, { headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    } });
  } catch {
    await writeOperationLog({ userId: session.userId, username: session.username, page: "操作日志", action: "导出", result: "失败", detail: "操作日志导出失败", request }).catch(() => undefined);
    return NextResponse.json({ message: "导出失败，请稍后重试" }, { status: 500 });
  }
}

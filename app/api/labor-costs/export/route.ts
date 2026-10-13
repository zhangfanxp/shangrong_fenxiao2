import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  canLaborCost,
  laborCostDataScope,
  laborCostFilterWhere,
  laborCostRecordSelect,
  readLaborCostFilters,
  serializeLaborCostRecord,
  validateLaborCostFilters,
} from "@/lib/labor-costs";
import { writeOperationLog } from "@/lib/operation-log";

const schema = z.object({
  recordIds: z.array(z.string().min(1)).max(50_000).optional(),
  filters: z.object({
    storeId: z.string().max(191).optional(),
    brand: z.string().max(100).optional(),
    startDate: z.string().max(10).optional(),
    endDate: z.string().max(10).optional(),
  }).optional(),
});

function timestamp() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const value = (type: string) => parts.find(part => part.type === type)?.value || "";
  return `${value("year")}${value("month")}${value("day")}_${value("hour")}${value("minute")}${value("second")}`;
}

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canLaborCost(session, "export")) return NextResponse.json({ message: "暂无人力成本导出权限" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message || "导出参数不正确" }, { status: 400 });
  const recordIds = [...new Set(parsed.data.recordIds || [])];
  const filters = readLaborCostFilters(new URLSearchParams(parsed.data.filters || {}));
  const filterError = validateLaborCostFilters(filters);
  if (filterError) return NextResponse.json({ message: filterError }, { status: 400 });
  try {
    const dataScope = await laborCostDataScope(session);
    const where = recordIds.length
      ? { AND: [dataScope, { id: { in: recordIds } }] }
      : { AND: [dataScope, laborCostFilterWhere(filters)] };
    const records = await db.dailyAttendanceRecord.findMany({ where, select: laborCostRecordSelect, orderBy: [{ attendanceDate: "desc" }, { createdAt: "desc" }] });
    if (recordIds.length && records.length !== recordIds.length) return NextResponse.json({ message: "部分记录已不存在或无权导出，请刷新列表后重试" }, { status: 403 });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "餐饮运营管理系统";
    const sheet = workbook.addWorksheet("人力成本");
    sheet.columns = [
      { header: "考勤日期", key: "attendanceDate", width: 14 },
      { header: "记录编号", key: "recordNo", width: 17 },
      { header: "品牌", key: "brandName", width: 16 },
      { header: "门店名称", key: "storeName", width: 28 },
      { header: "合作类型", key: "cooperationType", width: 14 },
      { header: "全职人员用工成本（元）", key: "fullTimeLaborCost", width: 24 },
      { header: "兼职人员成本（元）", key: "partTimeLaborCost", width: 22 },
      { header: "当日用工成本（合计/元）", key: "totalLaborCost", width: 26 },
    ];
    for (const record of records.map(serializeLaborCostRecord)) sheet.addRow({
      ...record,
      fullTimeLaborCost: record.fullTimeLaborCost === null ? "-" : Number(record.fullTimeLaborCost),
      partTimeLaborCost: Number(record.partTimeLaborCost),
      totalLaborCost: record.totalLaborCost === null ? "-" : Number(record.totalLaborCost),
    });
    sheet.getRow(1).height = 24;
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1677FF" } };
    sheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = { from: "A1", to: "H1" };
    for (let rowIndex = 2; rowIndex <= sheet.rowCount; rowIndex += 1) {
      for (const column of [6, 7, 8]) if (typeof sheet.getCell(rowIndex, column).value === "number") sheet.getCell(rowIndex, column).numFmt = "¥#,##0.00";
    }
    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `人力成本_${timestamp()}.xlsx`;
    await writeOperationLog({ userId: session.userId, username: session.username, client: "运营PC端", page: "人力成本", action: "批量导出", result: "成功", detail: `${recordIds.length ? "按勾选记录" : "按当前筛选条件"}导出 ${records.length} 条`, request }).catch(() => undefined);
    return new NextResponse(Buffer.from(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}` } });
  } catch {
    await writeOperationLog({ userId: session.userId, username: session.username, client: "运营PC端", page: "人力成本", action: "批量导出", result: "失败", detail: "人力成本导出失败", request }).catch(() => undefined);
    return NextResponse.json({ message: "人力成本导出失败，请稍后重试" }, { status: 500 });
  }
}

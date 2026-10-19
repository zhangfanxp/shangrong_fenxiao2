import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import {
  loadEmployeeAttendanceMonthlyRows,
  readEmployeeAttendanceMonthlyFilters,
  validateEmployeeAttendanceMonthlyFilters,
} from "@/lib/employee-attendance-monthly";
import { writeOperationLog } from "@/lib/operation-log";

const schema = z.object({
  rowIds: z.array(z.string().min(1)).max(50_000).optional(),
  filters: z.object({
    brand: z.string().max(100).optional(),
    storeId: z.string().max(191).optional(),
    startMonth: z.string().max(7).optional(),
    endMonth: z.string().max(7).optional(),
    employeeName: z.string().max(50).optional(),
    position: z.string().max(50).optional(),
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
  if (!(session.permissions.includes("*") || session.permissions.includes("statistics:attendance-monthly:export"))) {
    return NextResponse.json({ message: "暂无员工出勤月度汇总导出权限" }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message || "导出参数不正确" }, { status: 400 });
  const rowIds = [...new Set(parsed.data.rowIds || [])];
  const filterSearch = new URLSearchParams(parsed.data.filters || {});
  const filters = readEmployeeAttendanceMonthlyFilters(filterSearch);
  const filterError = validateEmployeeAttendanceMonthlyFilters(filters);
  if (filterError) return NextResponse.json({ message: filterError }, { status: 400 });
  try {
    const allRows = await loadEmployeeAttendanceMonthlyRows(session, filters);
    const rows = rowIds.length ? allRows.filter(row => rowIds.includes(row.id)) : allRows;
    if (rowIds.length && rows.length !== rowIds.length) return NextResponse.json({ message: "部分汇总记录已不存在或无权导出，请刷新列表后重试" }, { status: 403 });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "餐饮运营管理系统";
    const sheet = workbook.addWorksheet("员工出勤月度汇总表");
    sheet.columns = [
      { header: "统计日期", key: "statMonth", width: 14 },
      { header: "品牌", key: "brandName", width: 16 },
      { header: "门店名称", key: "storeName", width: 28 },
      { header: "员工姓名", key: "employeeName", width: 14 },
      { header: "岗位", key: "position", width: 18 },
      { header: "出勤(天)", key: "attendanceDays", width: 14 },
      { header: "休息(天)", key: "restDays", width: 14 },
      { header: "加班(小时)", key: "overtimeHours", width: 16 },
      { header: "请假(小时)", key: "leaveHours", width: 16 },
    ];
    for (const row of rows) sheet.addRow(row);
    sheet.getRow(1).height = 24;
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1677FF" } };
    sheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = { from: "A1", to: "I1" };
    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `员工出勤月度汇总表_${timestamp()}.xlsx`;
    await writeOperationLog({ userId: session.userId, username: session.username, client: "运营PC端", page: "员工出勤月度汇总表", action: "批量导出", result: "成功", detail: `${rowIds.length ? "按勾选记录" : "按当前筛选条件"}导出 ${rows.length} 条`, request }).catch(() => undefined);
    return new NextResponse(Buffer.from(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}` } });
  } catch {
    await writeOperationLog({ userId: session.userId, username: session.username, client: "运营PC端", page: "员工出勤月度汇总表", action: "批量导出", result: "失败", detail: "员工出勤月度汇总导出失败", request }).catch(() => undefined);
    return NextResponse.json({ message: "员工出勤月度汇总导出失败，请稍后重试" }, { status: 500 });
  }
}

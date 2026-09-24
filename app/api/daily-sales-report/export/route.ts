import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import {
  DailySalesReportError,
  canDailySalesReport,
  dailySalesReportDataScope,
  dailySalesReportFiltersSchema,
  dailySalesReportFilterWhere,
  dailySalesReportSelect,
  dailySalesReportSourceWhere,
  loadDailySalesReportSource,
  serializeDailySalesReport,
} from "@/lib/daily-sales-report";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";

const bodySchema = z.object({
  recordIds: z.array(z.string().trim().min(1)).max(50000).optional(),
  filters: dailySalesReportFiltersSchema.default({}),
});

function timestamp() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value || "";
  return `${value("year")}${value("month")}${value("day")}_${value("hour")}${value("minute")}${value("second")}`;
}

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canDailySalesReport(session, "export")) return NextResponse.json({ message: "暂无每日销售数据导出权限" }, { status: 403 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message || "导出参数不正确" }, { status: 400 });
  const recordIds = parsed.data.recordIds?.length ? [...new Set(parsed.data.recordIds)] : undefined;
  try {
    const source = await loadDailySalesReportSource();
    const where = { AND: [
      dailySalesReportSourceWhere(source),
      await dailySalesReportDataScope(session),
      recordIds ? { id: { in: recordIds } } : dailySalesReportFilterWhere(parsed.data.filters),
    ] };
    const total = await db.taskSubmission.count({ where });
    if (total > 50000) return NextResponse.json({ message: "当前筛选结果超过50000条，请缩小筛选范围后导出" }, { status: 413 });
    const sourceRows = await db.taskSubmission.findMany({
      where,
      select: dailySalesReportSelect(source),
      orderBy: [{ executionDate: "desc" }, { storeNameSnapshot: "asc" }, { id: "desc" }],
    });
    const rows = sourceRows.map(row => serializeDailySalesReport(row, source));
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "餐饮管理系统";
    const sheet = workbook.addWorksheet("每日销售数据上报");
    sheet.columns = [
      { header: "品牌", key: "brandName", width: 18 },
      { header: "门店", key: "storeName", width: 28 },
      { header: "业务日期", key: "businessDate", width: 16 },
      { header: "实际销售额", key: "actualSalesAmount", width: 18, style: { numFmt: "#,##0.00" } },
      { header: "实收金额", key: "receivedAmount", width: 18, style: { numFmt: "#,##0.00" } },
      { header: "扫码/现金", key: "scanCashAmount", width: 18, style: { numFmt: "#,##0.00" } },
      { header: "美团订单", key: "meituanAmount", width: 18, style: { numFmt: "#,##0.00" } },
      { header: "抖音订单", key: "douyinAmount", width: 18, style: { numFmt: "#,##0.00" } },
      { header: "快手订单", key: "kuaishouAmount", width: 18, style: { numFmt: "#,##0.00" } },
      { header: "高德订单", key: "gaodeAmount", width: 18, style: { numFmt: "#,##0.00" } },
      { header: "外卖", key: "takeawayAmount", width: 18, style: { numFmt: "#,##0.00" } },
      { header: "上报人", key: "submitterName", width: 16 },
    ];
    rows.forEach(row => sheet.addRow({
      ...row,
      actualSalesAmount: row.actualSalesAmount ?? "-",
      receivedAmount: row.receivedAmount ?? "-",
      scanCashAmount: row.scanCashAmount ?? "-",
      meituanAmount: row.meituanAmount ?? "-",
      douyinAmount: row.douyinAmount ?? "-",
      kuaishouAmount: row.kuaishouAmount ?? "-",
      gaodeAmount: row.gaodeAmount ?? "-",
      takeawayAmount: row.takeawayAmount ?? "-",
    }));
    sheet.getRow(1).height = 24;
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1677FF" } };
    sheet.getRow(1).alignment = { horizontal: "center", vertical: "middle" };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = { from: "A1", to: "L1" };
    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `每日销售数据上报_${timestamp()}.xlsx`;
    await writeOperationLog({
      userId: session.userId,
      username: session.username,
      client: "运营PC端",
      page: "每日销售数据上报",
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
    const message = error instanceof DailySalesReportError ? error.message : "每日销售数据导出失败，请稍后重试";
    const status = error instanceof DailySalesReportError ? error.status : 500;
    await writeOperationLog({ userId: session.userId, username: session.username, client: "运营PC端", page: "每日销售数据上报", action: "批量导出", result: "失败", detail: message, request }).catch(() => undefined);
    return NextResponse.json({ message }, { status });
  }
}

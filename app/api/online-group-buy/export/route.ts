import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { DailySalesReportError, dailySalesReportDataScope, dailySalesReportSelect, loadDailySalesReportSource, serializeDailySalesReport } from "@/lib/daily-sales-report";
import { canOnlineGroupBuy, onlineGroupBuyFilterWhere, onlineGroupBuySourceWhere, onlineGroupBuyFiltersSchema, withOnlineGroupBuyPercentages } from "@/lib/online-group-buy";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";

const bodySchema = z.object({
  recordIds: z.array(z.string().trim().min(1)).max(50000).optional(),
  filters: onlineGroupBuyFiltersSchema.default({}),
});

function timestamp() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value || "";
  return `${value("year")}${value("month")}${value("day")}_${value("hour")}${value("minute")}${value("second")}`;
}

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canOnlineGroupBuy(session, "export")) return NextResponse.json({ message: "暂无线上团购数据导出权限" }, { status: 403 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message || "导出参数不正确" }, { status: 400 });
  const recordIds = parsed.data.recordIds?.length ? [...new Set(parsed.data.recordIds)] : undefined;
  try {
    const source = await loadDailySalesReportSource();
    const where = { AND: [onlineGroupBuySourceWhere(source), await dailySalesReportDataScope(session), recordIds ? { id: { in: recordIds } } : onlineGroupBuyFilterWhere(parsed.data.filters)] };
    const total = await db.taskSubmission.count({ where });
    if (total > 50000) return NextResponse.json({ message: "当前筛选结果超过50000条，请缩小筛选范围后导出" }, { status: 413 });
    const rows = (await db.taskSubmission.findMany({ where, select: dailySalesReportSelect(source), orderBy: [{ executionDate: "desc" }, { storeNameSnapshot: "asc" }, { id: "desc" }] }))
      .map(row => withOnlineGroupBuyPercentages(serializeDailySalesReport(row, source)));
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "餐饮运营管理系统";
    const sheet = workbook.addWorksheet("线上团购数据");
    sheet.columns = [
      { header: "业务日期", key: "businessDate", width: 16 },
      { header: "品牌", key: "brandName", width: 18 },
      { header: "门店", key: "storeName", width: 28 },
      { header: "美团订单占比", key: "meituanPercent", width: 18, style: { numFmt: "0.00%" } },
      { header: "抖音订单占比", key: "douyinPercent", width: 18, style: { numFmt: "0.00%" } },
      { header: "快手订单占比", key: "kuaishouPercent", width: 18, style: { numFmt: "0.00%" } },
      { header: "高德订单占比", key: "gaodePercent", width: 18, style: { numFmt: "0.00%" } },
      { header: "外卖占比", key: "takeawayPercent", width: 16, style: { numFmt: "0.00%" } },
      { header: "线下订单占比", key: "offlinePercent", width: 18, style: { numFmt: "0.00%" } },
    ];
    rows.forEach(row => sheet.addRow({
      businessDate: row.businessDate,
      brandName: row.brandName,
      storeName: row.storeName,
      meituanPercent: row.meituanPercent === null ? "-" : row.meituanPercent / 100,
      douyinPercent: row.douyinPercent === null ? "-" : row.douyinPercent / 100,
      kuaishouPercent: row.kuaishouPercent === null ? "-" : row.kuaishouPercent / 100,
      gaodePercent: row.gaodePercent === null ? "-" : row.gaodePercent / 100,
      takeawayPercent: row.takeawayPercent === null ? "-" : row.takeawayPercent / 100,
      offlinePercent: row.offlinePercent === null ? "-" : row.offlinePercent / 100,
    }));
    sheet.getRow(1).height = 24;
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1677FF" } };
    sheet.getRow(1).alignment = { horizontal: "center", vertical: "middle" };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = { from: "A1", to: "I1" };
    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `线上团购数据_${timestamp()}.xlsx`;
    await writeOperationLog({ userId: session.userId, username: session.username, client: "运营PC端", page: "线上团购数据", action: "批量导出", result: "成功", detail: `业务数据源：${source.sourceRecordNo}；${recordIds ? `已选择 ${recordIds.length} 条` : "当前筛选结果全部"}；实际导出 ${rows.length} 条`, request }).catch(() => undefined);
    return new NextResponse(Buffer.from(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      },
    });
  } catch (error) {
    const message = error instanceof DailySalesReportError ? error.message : "线上团购数据导出失败，请稍后重试";
    const status = error instanceof DailySalesReportError ? error.status : 500;
    await writeOperationLog({ userId: session.userId, username: session.username, client: "运营PC端", page: "线上团购数据", action: "批量导出", result: "失败", detail: message, request }).catch(() => undefined);
    return NextResponse.json({ message }, { status });
  }
}

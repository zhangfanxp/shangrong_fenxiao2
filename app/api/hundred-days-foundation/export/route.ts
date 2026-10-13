import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  HundredDaysError,
  canHundredDays,
  hundredDaysDataScope,
  hundredDaysFilterWhere,
  hundredDaysFiltersSchema,
  hundredDaysSelect,
  hundredDaysSourceWhere,
  loadHundredDaysSource,
  parseHundredDaysRecordId,
  serializeHundredDaysRows,
} from "@/lib/hundred-days-foundation";
import { writeOperationLog } from "@/lib/operation-log";

const bodySchema = z.object({
  recordIds: z.array(z.string().trim().min(1)).max(50000).optional(),
  filters: hundredDaysFiltersSchema.default({}),
});

function timestamp() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value || "";
  return `${value("year")}${value("month")}${value("day")}_${value("hour")}${value("minute")}${value("second")}`;
}

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canHundredDays(session, "export")) return NextResponse.json({ message: "暂无百日筑基表导出权限" }, { status: 403 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message || "导出参数不正确" }, { status: 400 });
  const recordIds = parsed.data.recordIds?.length ? [...new Set(parsed.data.recordIds)] : undefined;
  const selectedRecords = recordIds?.map(parseHundredDaysRecordId);
  if (selectedRecords?.some(record => record === null)) return NextResponse.json({ message: "所选记录参数不正确，请刷新页面后重试" }, { status: 400 });

  try {
    const source = await loadHundredDaysSource();
    const selectedSubmissionIds = selectedRecords ? [...new Set(selectedRecords.flatMap(record => record ? [record.submissionId] : []))] : undefined;
    const where = { AND: [
      hundredDaysSourceWhere(source),
      await hundredDaysDataScope(session),
      selectedSubmissionIds ? { id: { in: selectedSubmissionIds } } : hundredDaysFilterWhere(parsed.data.filters),
    ] };
    if (!recordIds) {
      const submissionCount = await db.taskSubmission.count({ where });
      const platformCount = parsed.data.filters.platform ? 1 : source.platforms.length;
      if (submissionCount * platformCount > 50000) {
        return NextResponse.json({ message: "当前筛选结果超过50000条，请缩小筛选范围后导出" }, { status: 413 });
      }
    }
    const sourceRows = await db.taskSubmission.findMany({
      where,
      select: hundredDaysSelect(source),
      orderBy: [{ executionDate: "desc" }, { storeNameSnapshot: "asc" }, { id: "desc" }],
    });
    const selectedIds = recordIds ? new Set(recordIds) : null;
    const platformCode = selectedIds ? undefined : parsed.data.filters.platform || undefined;
    const rows = sourceRows.flatMap(row => serializeHundredDaysRows(row, source, platformCode)).filter(row => !selectedIds || selectedIds.has(row.id));

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "餐饮管理系统";
    const sheet = workbook.addWorksheet("百日筑基表");
    sheet.columns = [
      { header: "品牌", key: "brandName", width: 18 },
      { header: "门店名称", key: "storeName", width: 28 },
      { header: "周次日期", key: "weekDate", width: 16 },
      { header: "平台名称", key: "platformName", width: 16 },
      { header: "店铺分", key: "shopScore", width: 14, style: { numFmt: "0" } },
      { header: "评分", key: "rating", width: 14, style: { numFmt: "0.00" } },
      { header: "周单量", key: "weeklyOrders", width: 14, style: { numFmt: "0" } },
      { header: "周评价数", key: "weeklyReviews", width: 14, style: { numFmt: "0" } },
      { header: "周好评数", key: "weeklyPositiveReviews", width: 14, style: { numFmt: "0" } },
      { header: "周差评数", key: "weeklyNegativeReviews", width: 14, style: { numFmt: "0" } },
      { header: "评价率", key: "reviewRate", width: 14, style: { numFmt: "0.00%" } },
      { header: "好评率", key: "positiveRate", width: 14, style: { numFmt: "0.00%" } },
      { header: "差评率", key: "negativeRate", width: 14, style: { numFmt: "0.00%" } },
      { header: "产品质量(内容)", key: "productQuality", width: 32 },
      { header: "服务体验(内容)", key: "serviceExperience", width: 32 },
      { header: "环境卫生体验(内容)", key: "environmentExperience", width: 32 },
    ];
    rows.forEach(row => sheet.addRow({
      ...row,
      shopScore: row.shopScore ?? "-",
      rating: row.rating ?? "-",
      weeklyOrders: row.weeklyOrders ?? "-",
      weeklyReviews: row.weeklyReviews ?? "-",
      weeklyPositiveReviews: row.weeklyPositiveReviews ?? "-",
      weeklyNegativeReviews: row.weeklyNegativeReviews ?? "-",
      reviewRate: row.reviewRate ?? "-",
      positiveRate: row.positiveRate ?? "-",
      negativeRate: row.negativeRate ?? "-",
      productQuality: row.productQuality || "-",
      serviceExperience: row.serviceExperience || "-",
      environmentExperience: row.environmentExperience || "-",
    }));
    sheet.getRow(1).height = 24;
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1677FF" } };
    sheet.getRow(1).alignment = { horizontal: "center", vertical: "middle" };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = { from: "A1", to: "P1" };
    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `百日筑基表_${timestamp()}.xlsx`;
    await writeOperationLog({
      userId: session.userId,
      username: session.username,
      client: "运营PC端",
      page: "百日筑基表",
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
    const message = error instanceof HundredDaysError ? error.message : "百日筑基表导出失败，请稍后重试";
    const status = error instanceof HundredDaysError ? error.status : 500;
    await writeOperationLog({ userId: session.userId, username: session.username, client: "运营PC端", page: "百日筑基表", action: "批量导出", result: "失败", detail: message, request }).catch(() => undefined);
    return NextResponse.json({ message }, { status });
  }
}

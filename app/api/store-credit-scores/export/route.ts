import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";
import {
  canStoreCreditScore, formatCreditScoreDate, formatCreditScoreDateTime, readCreditScoreSnapshot,
  storeCreditScoreDataScope, storeCreditScoreFilterWhere, validDate,
} from "@/lib/store-credit-scores";

const bodySchema = z.object({
  recordIds: z.array(z.string().min(1)).max(10000).optional(),
  filters: z.object({
    brand: z.string().optional(),
    storeId: z.string().optional(),
    assessmentStartDate: z.string().optional(),
    assessmentEndDate: z.string().optional(),
    supervisorUserId: z.string().optional(),
  }).default({}),
});

function timestamp() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const value = (type: string) => parts.find(part => part.type === type)?.value || "";
  return `${value("year")}${value("month")}${value("day")}_${value("hour")}${value("minute")}${value("second")}`;
}

function styleSheet(sheet: ExcelJS.Worksheet, lastColumn: string) {
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1677FF" } };
  sheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: "A1", to: `${lastColumn}1` };
  sheet.eachRow((row, rowNumber) => {
    row.alignment = { ...row.alignment, vertical: "middle", wrapText: rowNumber > 1 };
  });
}

const resultLabels: Record<string, string> = { PASS: "合格", PARTIAL: "部分合格", FAIL: "不合格" };

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canStoreCreditScore(session, "export")) return NextResponse.json({ message: "暂无门店信用得分导出权限" }, { status: 403 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "导出参数不正确" }, { status: 400 });
  const { filters, recordIds } = parsed.data;
  if (!validDate(filters.assessmentStartDate) || !validDate(filters.assessmentEndDate) || (filters.assessmentStartDate && filters.assessmentEndDate && filters.assessmentStartDate > filters.assessmentEndDate)) {
    return NextResponse.json({ message: "考核日期范围不正确" }, { status: 400 });
  }
  try {
    const where = { AND: [await storeCreditScoreDataScope(session), recordIds?.length ? { AND: [{ reviewType: "STORE_CREDIT_SCORE" }, { id: { in: recordIds } }] } : storeCreditScoreFilterWhere(filters)] };
    const rows = await db.leadH5Review.findMany({
      where,
      include: { items: { orderBy: { sortOrder: "asc" }, include: { photos: { select: { originalName: true }, orderBy: { createdAt: "asc" } } } } },
      orderBy: [{ assessmentDate: "desc" }, { id: "desc" }],
    });
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "餐饮管理系统";
    workbook.created = new Date();
    const summary = workbook.addWorksheet("评分概览");
    summary.columns = [
      { header: "记录编号", key: "recordNo", width: 17 }, { header: "考核月份", key: "month", width: 13 },
      { header: "品牌", key: "brand", width: 16 }, { header: "考核门店", key: "store", width: 28 },
      { header: "考核表类型", key: "type", width: 20 }, { header: "负责人", key: "manager", width: 14 },
      { header: "考核督导", key: "supervisor", width: 14 }, { header: "考核日期", key: "date", width: 14 },
      { header: "考核得分", key: "score", width: 13 }, { header: "满分", key: "maxScore", width: 10 },
      { header: "评分模式", key: "scoreMode", width: 18 }, { header: "评分配置版本", key: "version", width: 15 },
      { header: "创建人", key: "creator", width: 14 }, { header: "创建时间", key: "createdAt", width: 21 },
    ];
    const detail = workbook.addWorksheet("评分明细");
    detail.columns = [
      { header: "记录编号", key: "recordNo", width: 17 }, { header: "考核月份", key: "month", width: 13 },
      { header: "品牌", key: "brand", width: 16 }, { header: "考核门店", key: "store", width: 28 },
      { header: "考核表类型", key: "type", width: 20 }, { header: "负责人", key: "manager", width: 14 },
      { header: "考核督导", key: "supervisor", width: 14 }, { header: "考核日期", key: "date", width: 14 },
      { header: "考核得分", key: "totalScore", width: 13 }, { header: "评分模式", key: "scoreMode", width: 18 },
      { header: "总项", key: "section", width: 18 }, { header: "子项", key: "subsection", width: 18 },
      { header: "检查明细项/违约项目", key: "item", width: 54 }, { header: "违约金额", key: "breachAmount", width: 13 },
      { header: "明细项分值", key: "maxScore", width: 14 }, { header: "评分结果", key: "result", width: 13 },
      { header: "实际得分", key: "actualScore", width: 13 }, { header: "凭证照片", key: "photos", width: 36 },
    ];
    for (const row of rows) {
      const snapshot = readCreditScoreSnapshot(row.configSnapshot);
      const common = {
        recordNo: row.recordNo, month: row.reviewMonth, brand: row.brandNameSnapshot || "-", store: row.storeNameSnapshot || "-",
        type: row.assessmentName || "门店信用评分", manager: row.responsiblePersonNameSnapshot || "-", supervisor: row.reviewerRealName || "-",
        date: formatCreditScoreDate(row.assessmentDate), scoreMode: snapshot.valid ? snapshot.scoreModeLabel : "配置快照异常",
      };
      summary.addRow({ ...common, score: Number(row.actualScore), maxScore: Number(row.maxScore), version: `V${row.assessmentVersion}`, creator: row.reviewerRealName || row.reviewerUsername || "-", createdAt: formatCreditScoreDateTime(row.createdAt) });
      if (!row.items.length) detail.addRow({ ...common, totalScore: Number(row.actualScore), item: "评分明细缺失" });
      for (const item of row.items) detail.addRow({
        ...common,
        totalScore: Number(row.actualScore),
        section: item.sectionName || "-",
        subsection: item.subsectionName || "-",
        item: item.itemDescription,
        breachAmount: snapshot.breachAmounts.get(item.itemKey) || "-",
        maxScore: Number(item.maxScore),
        result: resultLabels[item.result] || item.result,
        actualScore: Number(item.actualScore),
        photos: item.photos.map(photo => photo.originalName).join("；") || "-",
      });
    }
    styleSheet(summary, "N");
    styleSheet(detail, "R");
    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `门店信用得分_${timestamp()}.xlsx`;
    await writeOperationLog({ userId: session.userId, username: session.username, page: "门店信用得分", action: "批量导出", result: "成功", detail: `导出 ${rows.length} 条信用评分记录，包含完整评分明细`, request }).catch(() => undefined);
    return new NextResponse(Buffer.from(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}` } });
  } catch {
    await writeOperationLog({ userId: session.userId, username: session.username, page: "门店信用得分", action: "批量导出", result: "失败", detail: "门店信用评分导出失败", request }).catch(() => undefined);
    return NextResponse.json({ message: "门店信用评分导出失败，请稍后重试" }, { status: 500 });
  }
}

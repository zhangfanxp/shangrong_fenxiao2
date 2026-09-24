import ExcelJS from "exceljs";
import { BusinessDataSourceType } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import {
  businessDataSourceFilterWhere, canBusinessDataSource, formatBusinessDataSourceDate,
  sourceTypeLabels,
} from "@/lib/business-data-sources";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";

const exportSchema = z.object({
  recordIds: z.array(z.string().min(1)).max(10000).optional(),
  filters: z.object({
    businessNameKeyword: z.string().trim().max(20).optional(),
    sourceType: z.nativeEnum(BusinessDataSourceType).optional(),
    templateRecordNo: z.string().trim().max(24).optional(),
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
  if (!canBusinessDataSource(session, "export")) return NextResponse.json({ message: "暂无业务数据源导出权限" }, { status: 403 });
  const parsed = exportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "导出参数不正确" }, { status: 400 });
  const recordIds = [...new Set(parsed.data.recordIds || [])];
  const filters = parsed.data.filters || {};
  const where = recordIds.length ? { id: { in: recordIds } } : businessDataSourceFilterWhere(filters);
  try {
    const rows = await db.businessDataSource.findMany({
      where,
      select: { id: true, recordNo: true, businessName: true, sourceType: true, templateRecordNoSnapshot: true, createdByNameSnapshot: true, createdAt: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    if (recordIds.length && rows.length !== recordIds.length) return NextResponse.json({ message: "部分记录已不存在，请刷新列表后重试" }, { status: 400 });
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "餐饮管理系统";
    const sheet = workbook.addWorksheet("业务数据源");
    sheet.columns = [
      { header: "记录编号", key: "recordNo", width: 17 },
      { header: "业务名称", key: "businessName", width: 26 },
      { header: "来源类型", key: "sourceType", width: 18 },
      { header: "模版记录编号", key: "templateRecordNo", width: 20 },
      { header: "创建人", key: "createdBy", width: 16 },
      { header: "创建时间", key: "createdAt", width: 22 },
    ];
    for (const row of rows) sheet.addRow({
      recordNo: row.recordNo,
      businessName: row.businessName,
      sourceType: sourceTypeLabels[row.sourceType],
      templateRecordNo: row.templateRecordNoSnapshot,
      createdBy: row.createdByNameSnapshot,
      createdAt: row.createdAt,
    });
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1677FF" } };
    sheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
    sheet.getColumn("createdAt").numFmt = "yyyy-mm-dd hh:mm:ss";
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = { from: "A1", to: "F1" };
    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `业务数据源_${timestamp()}.xlsx`;
    await writeOperationLog({ userId: session.userId, username: session.username, page: "业务数据源", action: "批量导出", result: "成功", detail: `导出${rows.length}条业务数据源；范围：${recordIds.length ? "已选择记录" : "当前筛选结果"}；生成时间：${formatBusinessDataSourceDate(new Date())}`, request }).catch(() => undefined);
    return new NextResponse(Buffer.from(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}` } });
  } catch {
    await writeOperationLog({ userId: session.userId, username: session.username, page: "业务数据源", action: "批量导出", result: "失败", detail: "业务数据源导出失败", request }).catch(() => undefined);
    return NextResponse.json({ message: "业务数据源导出失败，请稍后重试" }, { status: 500 });
  }
}

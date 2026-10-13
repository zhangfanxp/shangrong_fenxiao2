import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  canLaborRecord,
  laborRecordDataScope,
  laborRecordFilterWhere,
  laborRecordFiltersSchema,
  laborRecordSelect,
  serializeLaborRecord,
} from "@/lib/labor-records";
import { writeOperationLog } from "@/lib/operation-log";

const bodySchema = z.object({
  recordIds: z.array(z.string().trim().min(1)).max(50_000).optional(),
  filters: laborRecordFiltersSchema.default({}),
});

function timestamp() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value || "";
  return `${value("year")}${value("month")}${value("day")}_${value("hour")}${value("minute")}${value("second")}`;
}

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canLaborRecord(session, "export")) return NextResponse.json({ message: "暂无用工记录导出权限" }, { status: 403 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message || "导出参数不正确" }, { status: 400 });
  const recordIds = parsed.data.recordIds?.length ? [...new Set(parsed.data.recordIds)] : undefined;
  try {
    const where = { AND: [
      await laborRecordDataScope(session),
      recordIds ? { id: { in: recordIds } } : laborRecordFilterWhere(parsed.data.filters),
    ] };
    const sourceRows = await db.storeLaborRecord.findMany({
      where,
      select: laborRecordSelect,
      orderBy: [{ businessDate: "desc" }, { brandNameSnapshot: "asc" }, { storeNameSnapshot: "asc" }, { id: "desc" }],
      take: 50_001,
    });
    if (sourceRows.length > 50_000) return NextResponse.json({ message: "当前筛选结果超过50000条，请缩小筛选范围后导出" }, { status: 413 });
    const rows = sourceRows.map(serializeLaborRecord);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "餐饮管理系统";
    const sheet = workbook.addWorksheet("用工记录");
    sheet.columns = [
      { header: "品牌", key: "brandName", width: 18 },
      { header: "门店名称", key: "storeName", width: 28 },
      { header: "日期", key: "businessDate", width: 16 },
      { header: "实收金额", key: "receivedAmount", width: 18, style: { numFmt: "#,##0.00" } },
      { header: "实际用工（人）", key: "actualHeadcount", width: 18 },
      { header: "用工状态", key: "laborStatusLabel", width: 18 },
    ];
    rows.forEach(row => sheet.addRow({
      ...row,
      receivedAmount: row.receivedAmount === null ? "-" : Number(row.receivedAmount),
      actualHeadcount: row.actualHeadcount ?? "-",
    }));
    sheet.getRow(1).height = 24;
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1677FF" } };
    sheet.getRow(1).alignment = { horizontal: "center", vertical: "middle" };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = { from: "A1", to: "F1" };
    const buffer = await workbook.xlsx.writeBuffer();
    await writeOperationLog({
      userId: session.userId,
      username: session.username,
      client: "运营PC端",
      page: "用工记录",
      action: "批量导出",
      result: "成功",
      detail: `${recordIds ? `已选择 ${recordIds.length} 条` : "当前筛选结果全部"}；实际导出 ${rows.length} 条`,
      request,
    }).catch(() => undefined);
    return new NextResponse(Buffer.from(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`用工记录_${timestamp()}.xlsx`)}`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "用工记录导出失败，请稍后重试";
    await writeOperationLog({ userId: session.userId, username: session.username, client: "运营PC端", page: "用工记录", action: "批量导出", result: "失败", detail: message, request }).catch(() => undefined);
    return NextResponse.json({ message: "用工记录导出失败，请稍后重试" }, { status: 500 });
  }
}

import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";
import {
  canUseStoreLaborStandards,
  serializeStoreLaborStandard,
  storeLaborStandardFilterLogDetail,
  storeLaborStandardFilterWhere,
  storeLaborStandardFiltersSchema,
  storeLaborStandardSelect,
} from "@/lib/store-labor-standards";

const bodySchema = z.object({
  recordIds: z.array(z.string().trim().min(1)).max(50000).optional(),
  filters: storeLaborStandardFiltersSchema.default({}),
});

function timestamp() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value || "";
  return `${value("year")}${value("month")}${value("day")}_${value("hour")}${value("minute")}${value("second")}`;
}

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canUseStoreLaborStandards(session, "export")) return NextResponse.json({ message: "暂无门店用工标准导出权限" }, { status: 403 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message || "导出参数不正确" }, { status: 400 });
  const recordIds = parsed.data.recordIds?.length ? [...new Set(parsed.data.recordIds)] : undefined;
  const detail = recordIds ? `已选择 ${recordIds.length} 条门店用工标准记录` : storeLaborStandardFilterLogDetail(parsed.data.filters);
  try {
    const where = recordIds ? { id: { in: recordIds } } : storeLaborStandardFilterWhere(parsed.data.filters);
    const total = await db.storeLaborStandard.count({ where });
    if (total > 50000) return NextResponse.json({ message: "当前筛选结果超过50000条，请缩小筛选范围后导出" }, { status: 413 });
    const rows = await db.storeLaborStandard.findMany({
      where,
      select: storeLaborStandardSelect,
      orderBy: [{ brandValue: "asc" }, { lowerAmount: "asc" }, { upperAmount: "asc" }, { recordNo: "asc" }],
    });
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "餐饮管理系统";
    const sheet = workbook.addWorksheet("门店用工标准");
    sheet.columns = [
      { header: "记录编号", key: "recordNo", width: 17 },
      { header: "品牌", key: "brandValue", width: 20 },
      { header: "考核指标", key: "assessmentMetricLabel", width: 20 },
      { header: "下限", key: "lowerAmount", width: 18 },
      { header: "上限", key: "upperAmount", width: 18 },
      { header: "标准用工人数（人）", key: "standardHeadcount", width: 22 },
      { header: "备注", key: "remark", width: 36 },
    ];
    rows.map(serializeStoreLaborStandard).forEach(row => sheet.addRow({ ...row, lowerAmount: row.lowerAmount ?? "", upperAmount: row.upperAmount ?? "" }));
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1677FF" } };
    sheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = { from: "A1", to: "G1" };
    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `门店用工标准_${timestamp()}.xlsx`;
    await writeOperationLog({ userId: session.userId, username: session.username, page: "门店用工标准", action: "批量导出", result: "成功", detail: `${detail}；导出 ${rows.length} 条`, request }).catch(() => undefined);
    return new NextResponse(Buffer.from(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      },
    });
  } catch {
    await writeOperationLog({ userId: session.userId, username: session.username, page: "门店用工标准", action: "批量导出", result: "失败", detail, request }).catch(() => undefined);
    return NextResponse.json({ message: "门店用工标准数据导出失败，请稍后重试" }, { status: 500 });
  }
}

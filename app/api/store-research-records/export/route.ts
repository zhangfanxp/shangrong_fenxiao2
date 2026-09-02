import type { Prisma } from "@prisma/client";
import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";
import {
  canStoreResearch, formatResearchDateTime, storeResearchDataScope, storeResearchFilterWhere, storeResearchSelect, validResearchRange,
} from "@/lib/store-research-records";

const filtersSchema = z.object({
  brand: z.string().max(100).optional(), storeId: z.string().max(191).optional(),
  researchStartMonth: z.string().max(7).optional(), researchEndMonth: z.string().max(7).optional(),
  creatorKeyword: z.string().max(50).optional(),
});
const bodySchema = z.object({ recordIds: z.array(z.string().min(1)).max(10000).optional(), filters: filtersSchema.default({}) });

function timestamp() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const value = (type: string) => parts.find(part => part.type === type)?.value || "";
  return `${value("year")}${value("month")}${value("day")}_${value("hour")}${value("minute")}${value("second")}`;
}

type SnapshotItem = {
  id?: unknown;
  itemId?: unknown;
  section?: unknown;
  subSection?: unknown;
  label?: unknown;
  value?: unknown;
};

type DetailCell = { identity: string; header: string; value: string };

function snapshotItems(value: Prisma.JsonValue): SnapshotItem[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const items = (value as { items?: unknown }).items;
  return Array.isArray(items)
    ? items.filter((item): item is SnapshotItem => !!item && typeof item === "object" && !Array.isArray(item))
    : [];
}

function cellText(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  try { return JSON.stringify(value); } catch { return String(value); }
}

function detailCells(configSnapshot: Prisma.JsonValue, resultSnapshot: Prisma.JsonValue): DetailCell[] {
  const configured = snapshotItems(configSnapshot);
  const results = snapshotItems(resultSnapshot);
  const resultsById = new Map(results.map(item => [cellText(item.itemId ?? item.id), item]));
  const source = configured.length ? configured : results;
  const occurrences = new Map<string, number>();
  return source.map((item, index) => {
    const id = cellText(item.id ?? item.itemId);
    const result = id ? (resultsById.get(id) || item) : (results[index] || item);
    const section = cellText(item.section ?? result.section) || "调研内容";
    const subSection = cellText(item.subSection ?? result.subSection) || "调研明细";
    const label = cellText(item.label ?? result.label) || `调研项${index + 1}`;
    const path = `${section}｜${subSection}｜${label}`;
    const occurrence = (occurrences.get(path) || 0) + 1;
    occurrences.set(path, occurrence);
    return {
      identity: occurrence === 1 ? path : `${path}#${occurrence}`,
      header: occurrence === 1 ? path : `${path}（${occurrence}）`,
      value: cellText(result.value),
    };
  });
}

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canStoreResearch(session, "export")) return NextResponse.json({ message: "暂无巡店调研表导出权限" }, { status: 403 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "导出参数不正确" }, { status: 400 });
  const { filters, recordIds } = parsed.data;
  if (!validResearchRange(filters)) return NextResponse.json({ message: "调研月份范围不正确" }, { status: 400 });
  try {
    const where = { AND: [await storeResearchDataScope(session), recordIds?.length ? { id: { in: recordIds } } : storeResearchFilterWhere(filters)] };
    const rows = await db.researchTemplateRecord.findMany({
      where,
      select: { ...storeResearchSelect, configSnapshot: true, resultSnapshot: true },
      orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
    });
    const rowDetails = rows.map(row => detailCells(row.configSnapshot, row.resultSnapshot));
    const detailColumns = new Map<string, { key: string; header: string }>();
    for (const details of rowDetails) {
      for (const detail of details) {
        if (!detailColumns.has(detail.identity)) {
          detailColumns.set(detail.identity, { key: `detail_${detailColumns.size + 1}`, header: detail.header });
        }
      }
    }
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "餐饮管理系统";
    const sheet = workbook.addWorksheet("巡店调研表");
    sheet.columns = [
      { header: "记录编号", key: "recordNo", width: 17 },
      { header: "品牌｜调研门店", key: "store", width: 34 },
      { header: "调研表类型", key: "type", width: 18 },
      { header: "调研月份", key: "month", width: 14 },
      { header: "店长", key: "manager", width: 14 },
      { header: "创建人", key: "creator", width: 14 },
      { header: "创建时间", key: "createdAt", width: 22 },
      ...Array.from(detailColumns.values(), column => ({ header: column.header, key: column.key, width: 28 })),
    ];
    rows.forEach((row, index) => {
      const detailValues = Object.fromEntries(rowDetails[index].map(detail => [detailColumns.get(detail.identity)!.key, detail.value]));
      sheet.addRow({
        recordNo: row.recordNo,
        store: `${row.brandNameSnapshot}｜${row.storeNameSnapshot}`,
        type: row.templateType,
        month: row.researchMonth.replace("-", "年") + "月",
        manager: row.storeManagerNameSnapshot || "-",
        creator: row.supervisorRealName,
        createdAt: formatResearchDateTime(row.submittedAt),
        ...detailValues,
      });
    });
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1677FF" } };
    sheet.getRow(1).alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    sheet.getRow(1).height = 42;
    for (let rowIndex = 2; rowIndex <= sheet.rowCount; rowIndex += 1) {
      sheet.getRow(rowIndex).alignment = { vertical: "top", wrapText: true };
    }
    sheet.views = [{ state: "frozen", xSplit: 7, ySplit: 1 }];
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };
    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `巡店调研表_${timestamp()}.xlsx`;
    await writeOperationLog({ userId: session.userId, username: session.username, page: "巡店调研表", action: "批量导出", result: "成功", detail: `导出 ${rows.length} 条调研记录，包含 ${detailColumns.size} 个调研明细字段`, request }).catch(() => undefined);
    return new NextResponse(Buffer.from(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}` } });
  } catch {
    await writeOperationLog({ userId: session.userId, username: session.username, page: "巡店调研表", action: "批量导出", result: "失败", detail: "调研记录导出失败", request }).catch(() => undefined);
    return NextResponse.json({ message: "调研记录导出失败，请稍后重试" }, { status: 500 });
  }
}

import { Prisma } from "@prisma/client";
import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  canItemRequisition, itemRequisitionDataScope, itemRequisitionFilterWhere, itemRequisitionLog,
  type ItemRequisitionFilters, shanghaiDate,
} from "@/lib/item-requisitions";

const filterSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  itemNameKeyword: z.string().trim().max(30).optional(),
  specificationKeyword: z.string().trim().max(50).optional(),
  personnelKeyword: z.string().trim().max(50).optional(),
}).strict();

const bodySchema = z.object({
  recordIds: z.array(z.string().min(1)).max(10000).optional(),
  filters: filterSchema.default({}),
}).strict();

function timestamp() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value || "";
  return `${part("year")}${part("month")}${part("day")}_${part("hour")}${part("minute")}${part("second")}`;
}

function excelDateInShanghai(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(item => item.type === type)?.value || 0);
  return new Date(Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second")));
}

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canItemRequisition(session, "export")) return NextResponse.json({ message: "无领用管理导出权限" }, { status: 403 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message || "导出参数不正确" }, { status: 400 });
  const { filters } = parsed.data as { filters: ItemRequisitionFilters };
  for (const value of [filters.startDate, filters.endDate]) {
    if (!value) continue;
    const parsedDate = new Date(`${value}T00:00:00+08:00`);
    if (Number.isNaN(parsedDate.valueOf()) || shanghaiDate(parsedDate) !== value) return NextResponse.json({ message: "领用日期格式不正确" }, { status: 400 });
  }
  if (filters.startDate && filters.endDate && filters.startDate > filters.endDate) return NextResponse.json({ message: "领用开始日期不能晚于领用截止日期" }, { status: 400 });
  const ids = parsed.data.recordIds?.length ? [...new Set(parsed.data.recordIds)] : undefined;
  try {
    const where: Prisma.ItemRequisitionWhereInput = { AND: [
      await itemRequisitionDataScope(session),
      ids ? { id: { in: ids } } : itemRequisitionFilterWhere(filters),
    ] };
    const total = await db.itemRequisition.count({ where });
    if (total > 50000) return NextResponse.json({ message: "当前导出记录超过 50000 条，请缩小筛选范围后重试" }, { status: 413 });
    const rows = await db.itemRequisition.findMany({
      where,
      select: {
        id: true, requisitionNo: true, requisitionedAt: true, personnelNameSnapshot: true,
        itemNameSnapshot: true, quantity: true, createdByNameSnapshot: true, createdAt: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    if (ids && rows.length !== ids.length) return NextResponse.json({ message: "部分所选记录已不存在或无权访问，请刷新列表后重试" }, { status: 409 });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "餐饮管理系统";
    workbook.created = new Date();
    const sheet = workbook.addWorksheet("领用记录");
    sheet.columns = [
      { header: "领用单号", key: "requisitionNo", width: 17 },
      { header: "领用日期", key: "requisitionDate", width: 14 },
      { header: "领用人", key: "personnelName", width: 16 },
      { header: "领用物品", key: "itemName", width: 24 },
      { header: "领用数量", key: "quantity", width: 14 },
      { header: "创建人", key: "createdByName", width: 16 },
      { header: "创建时间", key: "createdAt", width: 22 },
    ];
    for (const row of rows) sheet.addRow({
      requisitionNo: row.requisitionNo,
      requisitionDate: shanghaiDate(row.requisitionedAt),
      personnelName: row.personnelNameSnapshot,
      itemName: row.itemNameSnapshot,
      quantity: row.quantity,
      createdByName: row.createdByNameSnapshot,
      createdAt: excelDateInShanghai(row.createdAt),
    });
    sheet.getRow(1).height = 24;
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1677FF" } };
    sheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = { from: "A1", to: "G1" };
    sheet.getColumn("quantity").numFmt = "#,##0";
    sheet.getColumn("createdAt").numFmt = "yyyy-mm-dd hh:mm:ss";
    sheet.eachRow((row, rowNumber) => { if (rowNumber > 1) row.alignment = { vertical: "middle" }; });

    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `领用记录_${timestamp()}.xlsx`;
    await itemRequisitionLog(session, "批量导出", "成功", `导出 ${rows.length} 条领用记录${ids ? "（已选记录）" : "（当前筛选结果）"}`, request);
    return new NextResponse(Buffer.from(buffer), { headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    } });
  } catch {
    await itemRequisitionLog(session, "批量导出", "失败", "领用记录导出失败", request);
    return NextResponse.json({ message: "领用记录导出失败，请稍后重试" }, { status: 500 });
  }
}

import { Prisma, RecordStatus } from "@prisma/client";
import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { canWorkwearInventory, workwearInventoryLog } from "@/lib/workwear-inventory";

const filterSchema = z.object({
  itemName: z.string().trim().max(30).optional(),
  itemType: z.string().trim().max(100).optional(),
  status: z.nativeEnum(RecordStatus).optional(),
}).strict();

const bodySchema = z.object({
  ids: z.array(z.string().min(1)).max(10000).optional(),
  filters: filterSchema.default({}),
}).strict();

function timestamp() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value || "";
  return `${value("year")}${value("month")}${value("day")}_${value("hour")}${value("minute")}${value("second")}`;
}

function excelDateInShanghai(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(item => item.type === type)?.value || 0);
  return new Date(Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second")));
}

function stockValue(value: bigint | null) {
  if (value === null) return "-";
  return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value.toString();
}

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canWorkwearInventory(session, "export")) return NextResponse.json({ message: "无物品管理导出权限" }, { status: 403 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message || "导出参数不正确" }, { status: 400 });
  const ids = parsed.data.ids?.length ? [...new Set(parsed.data.ids)] : undefined;
  const { filters } = parsed.data;
  const where: Prisma.InventoryItemWhereInput = ids ? { id: { in: ids } } : {
    ...(filters.itemName ? { itemName: { contains: filters.itemName } } : {}),
    ...(filters.itemType ? { itemTypeCode: filters.itemType } : {}),
    ...(filters.status ? { status: filters.status } : {}),
  };
  try {
    const total = await db.inventoryItem.count({ where });
    if (total > 50000) return NextResponse.json({ message: "当前导出记录超过 50000 条，请缩小筛选范围后重试" }, { status: 413 });
    const rows = await db.inventoryItem.findMany({
      where,
      select: {
        id: true, recordNo: true, itemName: true, itemTypeNameSnapshot: true, specification: true,
        unit: true, stockQuantity: true, status: true, createdByName: true, createdAt: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    if (ids && rows.length !== ids.length) return NextResponse.json({ message: "部分所选记录已不存在，请刷新列表后重试" }, { status: 409 });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "餐饮管理系统";
    workbook.created = new Date();
    const sheet = workbook.addWorksheet("物品管理");
    sheet.columns = [
      { header: "记录编号", key: "recordNo", width: 17 },
      { header: "物品名称", key: "itemName", width: 24 },
      { header: "物品类型", key: "itemType", width: 20 },
      { header: "规格", key: "specification", width: 20 },
      { header: "单位", key: "unit", width: 10 },
      { header: "库存数量", key: "stockQuantity", width: 14 },
      { header: "物品状态", key: "status", width: 14 },
      { header: "创建人", key: "createdByName", width: 16 },
      { header: "创建日期", key: "createdAt", width: 22 },
    ];
    for (const row of rows) sheet.addRow({
      recordNo: row.recordNo,
      itemName: row.itemName,
      itemType: row.itemTypeNameSnapshot,
      specification: row.specification || "-",
      unit: row.unit,
      stockQuantity: stockValue(row.stockQuantity),
      status: row.status === RecordStatus.ENABLED ? "已启用" : "已禁用",
      createdByName: row.createdByName,
      createdAt: excelDateInShanghai(row.createdAt),
    });
    sheet.getRow(1).height = 24;
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1677FF" } };
    sheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = { from: "A1", to: "I1" };
    sheet.getColumn("stockQuantity").numFmt = "#,##0";
    sheet.getColumn("createdAt").numFmt = "yyyy-mm-dd hh:mm:ss";
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) row.alignment = { vertical: "middle" };
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `物品管理_${timestamp()}.xlsx`;
    await workwearInventoryLog(session.userId, session.username, "批量导出", "成功", `导出 ${rows.length} 条物品记录${ids ? "（已选记录）" : "（当前筛选结果）"}`, request);
    return new NextResponse(Buffer.from(buffer), { headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    } });
  } catch {
    await workwearInventoryLog(session.userId, session.username, "批量导出", "失败", "物品数据导出失败", request);
    return NextResponse.json({ message: "物品数据导出失败，请稍后重试" }, { status: 500 });
  }
}

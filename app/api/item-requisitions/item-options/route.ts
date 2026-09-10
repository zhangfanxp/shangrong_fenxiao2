import { RecordStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { getBusinessDictionaryOptions } from "@/lib/business-dictionaries";
import { db } from "@/lib/db";
import { canItemRequisition } from "@/lib/item-requisitions";

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canItemRequisition(session, "create")) return NextResponse.json({ message: "无领用物品选择权限" }, { status: 403 });
  const search = new URL(request.url).searchParams;
  const itemType = (search.get("itemType") || "").trim();
  const page = Math.max(1, Number(search.get("page")) || 1);
  const requestedPageSize = Number(search.get("pageSize"));
  const pageSize = [10, 20, 50].includes(requestedPageSize) ? requestedPageSize : 10;
  try {
    const itemTypes = await getBusinessDictionaryOptions("ITEM_REQUISITION_TYPE");
    if (itemType && !itemTypes.some(option => option.value === itemType)) return NextResponse.json({ message: "所选物品类型不存在或已禁用" }, { status: 400 });
    const where = { status: RecordStatus.ENABLED, ...(itemType ? { itemTypeCode: itemType } : {}) } as const;
    const [total, rows] = await db.$transaction([
      db.inventoryItem.count({ where }),
      db.inventoryItem.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    return NextResponse.json({
      itemTypes,
      rows: rows.map(row => ({
        itemId: row.id,
        recordNo: row.recordNo,
        itemName: row.itemName,
        itemTypeCode: row.itemTypeCode,
        itemType: row.itemTypeNameSnapshot,
        specification: row.specification,
        unit: row.unit,
        manageStock: row.manageStock,
        stockQuantity: row.stockQuantity === null ? null : row.stockQuantity.toString(),
        status: row.status,
      })),
      total, page, pageSize,
    });
  } catch {
    return NextResponse.json({ message: "物品数据加载失败，请稍后重试" }, { status: 500 });
  }
}

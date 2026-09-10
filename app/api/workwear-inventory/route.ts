import { InventoryManageStock, Prisma, RecordStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  canWorkwearInventory, inventoryCreateSchema, inventoryData, nextInventoryItemRecordNo,
  resolveInventoryItemType, safeInventoryError, serializeInventoryItem, workwearInventoryLog,
} from "@/lib/workwear-inventory";

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canWorkwearInventory(session, "query")) return NextResponse.json({ message: "无物品管理查询权限" }, { status: 403 });
  const search = new URL(request.url).searchParams;
  const itemName = (search.get("itemName") || "").trim();
  const itemType = (search.get("itemType") || "").trim();
  const statusText = (search.get("status") || "").trim();
  if (statusText && !Object.values(RecordStatus).includes(statusText as RecordStatus)) return NextResponse.json({ message: "物品状态筛选值不正确" }, { status: 400 });
  const status = statusText as RecordStatus | "";
  const page = Math.max(1, Number(search.get("page")) || 1);
  const requestedPageSize = Number(search.get("pageSize"));
  const pageSize = [20, 50, 100].includes(requestedPageSize) ? requestedPageSize : 20;
  const where: Prisma.InventoryItemWhereInput = {
    ...(itemName ? { itemName: { contains: itemName } } : {}),
    ...(itemType ? { itemTypeCode: itemType } : {}),
    ...(status ? { status } : {}),
  };
  try {
    const [total, rows] = await db.$transaction([
      db.inventoryItem.count({ where }),
      db.inventoryItem.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    void workwearInventoryLog(session.userId, session.username, "筛选", "成功", `物品名称：${itemName || "全部"}；物品类型：${itemType || "全部"}；状态：${status || "全部"}；结果：${total}条`, request);
    return NextResponse.json({ rows: rows.map(serializeInventoryItem), total, page, pageSize });
  } catch {
    return NextResponse.json({ message: "物品数据加载失败，请稍后重试" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canWorkwearInventory(session, "create")) return NextResponse.json({ message: "无物品管理新增权限" }, { status: 403 });
  const parsed = inventoryCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message }, { status: 400 });
  try {
    const itemType = await resolveInventoryItemType(parsed.data.itemTypeCode);
    const row = await db.$transaction(async tx => {
      const recordNo = await nextInventoryItemRecordNo(tx);
      return tx.inventoryItem.create({ data: {
        ...inventoryData(parsed.data, itemType), recordNo, manageStock: parsed.data.manageStock,
        stockQuantity: parsed.data.manageStock === InventoryManageStock.MANAGED ? 0n : null,
        status: RecordStatus.ENABLED, createdByUserId: session.userId, createdByName: session.realName,
      } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    await workwearInventoryLog(session.userId, session.username, "新增", "成功", `新增物品：${row.recordNo} ${row.itemName}`, request);
    return NextResponse.json(serializeInventoryItem(row), { status: 201 });
  } catch (error) {
    const message = safeInventoryError(error, "物品新增失败，请稍后重试");
    await workwearInventoryLog(session.userId, session.username, "新增", "失败", message, request);
    return NextResponse.json({ message }, { status: message.includes("已存在") ? 409 : 400 });
  }
}

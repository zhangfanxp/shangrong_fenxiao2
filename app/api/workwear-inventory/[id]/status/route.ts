import { RecordStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  canWorkwearInventory, inventoryStatusSchema, safeInventoryError, serializeInventoryItem,
  workwearInventoryLog,
} from "@/lib/workwear-inventory";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  const parsed = inventoryStatusSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message }, { status: 400 });
  const enabling = parsed.data.status === RecordStatus.ENABLED;
  const action = enabling ? "启用" : "禁用";
  if (!canWorkwearInventory(session, enabling ? "enable" : "disable")) {
    return NextResponse.json({ message: `无物品管理${action}权限` }, { status: 403 });
  }
  const { id } = await params;
  try {
    const current = await db.inventoryItem.findUnique({ where: { id } });
    if (!current) return NextResponse.json({ message: "物品不存在或已被删除" }, { status: 404 });
    if (current.version !== parsed.data.version || current.status === parsed.data.status) {
      return NextResponse.json({ message: "当前物品状态已发生变化，请刷新后重新操作" }, { status: 409 });
    }
    const updated = await db.inventoryItem.updateMany({
      where: { id, version: parsed.data.version, status: current.status },
      data: { status: parsed.data.status, updatedByUserId: session.userId, version: { increment: 1 } },
    });
    if (!updated.count) return NextResponse.json({ message: "当前物品状态已发生变化，请刷新后重新操作" }, { status: 409 });
    const row = await db.inventoryItem.findUniqueOrThrow({ where: { id } });
    await workwearInventoryLog(session.userId, session.username, action, "成功", `${action}物品：${row.recordNo} ${row.itemName}`, request);
    return NextResponse.json(serializeInventoryItem(row));
  } catch (error) {
    const message = safeInventoryError(error, `物品${action}失败，请稍后重试`);
    await workwearInventoryLog(session.userId, session.username, action, "失败", message, request);
    return NextResponse.json({ message }, { status: message.includes("不存在") ? 404 : message.includes("刷新") ? 409 : 400 });
  }
}

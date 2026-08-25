import { RecordStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { canPublishNotification } from "@/lib/notifications";

export async function GET() {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canPublishNotification(session, "select-users")) return NextResponse.json({ message: "暂无接收用户选择权限" }, { status: 403 });
  const roles = await db.role.findMany({
    where: { status: RecordStatus.ENABLED },
    orderBy: [{ type: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });
  return NextResponse.json({ roles }, { headers: { "Cache-Control": "no-store" } });
}

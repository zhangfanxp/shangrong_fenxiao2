import { RecordStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiSession, sessionHasPermission } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!sessionHasPermission(session, "settings:users")) return NextResponse.json({ message: "暂无用户管理权限" }, { status: 403 });
  const roles = await db.role.findMany({ where: { status: RecordStatus.ENABLED }, orderBy: [{ type: "asc" }, { name: "asc" }], select: { id: true, name: true, code: true, status: true } });
  return NextResponse.json({ roles });
}

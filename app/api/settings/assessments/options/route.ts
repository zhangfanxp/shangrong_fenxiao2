import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { canAssessment } from "@/lib/assessment-permissions";
import { db } from "@/lib/db";

export async function GET() {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canAssessment(session, "query")) return NextResponse.json({ message: "暂无考核表格查询权限" }, { status: 403 });
  const r2Storages = await db.r2StorageConfig.findMany({
    where: { status: "ENABLED", deletedAt: null },
    select: { id: true, name: true },
    orderBy: [{ name: "asc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ r2Storages });
}

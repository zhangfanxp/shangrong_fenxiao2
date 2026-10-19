import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { canTaskRecord } from "@/lib/task-records";

export async function GET() {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canTaskRecord(session, "query")) return NextResponse.json({ message: "暂无任务记录查询权限" }, { status: 403 });
  try {
    const tasks = await db.task.findMany({
      where: { deletedAt: null, configFileName: { not: null } },
      select: { id: true, title: true, status: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return NextResponse.json({ tasks }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch {
    return NextResponse.json({ message: "任务名称加载失败，请稍后重试" }, { status: 500 });
  }
}

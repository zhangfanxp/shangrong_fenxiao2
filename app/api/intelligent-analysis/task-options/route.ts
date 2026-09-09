import { RecordStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { canIntelligentAnalysis } from "@/lib/intelligent-analysis";

export async function GET() {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canIntelligentAnalysis(session, "query")) return NextResponse.json({ message: "暂无智能分析查询权限" }, { status: 403 });
  try {
    const tasks = await db.task.findMany({
      where: { status: RecordStatus.ENABLED, deletedAt: null, configFileName: { not: null } },
      select: { id: true, title: true },
      orderBy: [{ title: "asc" }, { id: "asc" }],
    });
    return NextResponse.json({ tasks: tasks.map(task => ({ taskSettingId: task.id, taskName: task.title })) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ message: "任务名称加载失败，请稍后重试" }, { status: 500 });
  }
}

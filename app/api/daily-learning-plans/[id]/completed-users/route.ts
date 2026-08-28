import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { dailyLearningCan, dailyLearningPeople } from "@/lib/daily-learning";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!dailyLearningCan(session, "view")) return NextResponse.json({ message: "暂无每日学习查看权限" }, { status: 403 });
  const url = new URL(request.url); const page = Math.max(1, Number(url.searchParams.get("page")) || 1); const pageSize = Math.min(100, Math.max(20, Number(url.searchParams.get("pageSize")) || 20)); const weekDay = Number(url.searchParams.get("weekDay")) || undefined;
  try {
    const result = await dailyLearningPeople((await params).id, true, page, pageSize, weekDay);
    return result ? NextResponse.json(result) : NextResponse.json({ message: "每日学习计划不存在" }, { status: 404 });
  } catch { return NextResponse.json({ message: "学习人员完成情况加载失败，请稍后重试" }, { status: 500 }); }
}

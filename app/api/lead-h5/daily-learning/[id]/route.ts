import { NextResponse } from "next/server";
import { dailyLearningTodayDetail, safeDailyLearningError } from "@/lib/daily-learning";
import { getLeadH5Session } from "@/lib/lead-h5-auth";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getLeadH5Session();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  try {
    const detail = await dailyLearningTodayDetail((await params).id, session.userId);
    return NextResponse.json({ detail }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ message: safeDailyLearningError(error, "每日学习内容加载失败，请稍后重试") }, { status: 404 });
  }
}

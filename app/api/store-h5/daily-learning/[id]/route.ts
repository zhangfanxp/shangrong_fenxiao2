import { NextResponse } from "next/server";
import { dailyLearningTodayDetail, safeDailyLearningError } from "@/lib/daily-learning";
import { getStoreH5Session } from "@/lib/store-h5-auth";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getStoreH5Session("store-h5:daily-learning:view");
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  try {
    const detail = await dailyLearningTodayDetail((await params).id, session.userId);
    return NextResponse.json({ detail }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ message: safeDailyLearningError(error, "每日学习内容加载失败，请稍后重试") }, { status: 404 });
  }
}

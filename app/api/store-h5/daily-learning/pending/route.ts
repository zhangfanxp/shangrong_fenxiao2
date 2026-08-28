import { NextResponse } from "next/server";
import { hasPendingDailyLearningTask } from "@/lib/daily-learning";
import { getStoreH5Session } from "@/lib/store-h5-auth";

export async function GET() {
  const session = await getStoreH5Session();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  try {
    return NextResponse.json(
      { pending: await hasPendingDailyLearningTask(session.userId) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ message: "每日学习状态加载失败，请稍后重试" }, { status: 500 });
  }
}

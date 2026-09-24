import { NextResponse } from "next/server";
import { mobileDailyLearningPlans } from "@/lib/daily-learning";
import { getLeadH5Session } from "@/lib/lead-h5-auth";

export async function GET() {
  const session = await getLeadH5Session("lead-h5:daily-learning:view");
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  try { return NextResponse.json({ plans: await mobileDailyLearningPlans(session.userId) }); }
  catch { return NextResponse.json({ message: "每日学习内容加载失败，请稍后重试" }, { status: 500 }); }
}

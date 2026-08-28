import { NextResponse } from "next/server";
import { completeDailyLearningDay, safeDailyLearningError } from "@/lib/daily-learning";
import { getLeadH5Session } from "@/lib/lead-h5-auth";
import { writeOperationLog } from "@/lib/operation-log";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getLeadH5Session();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  const body = await request.json().catch(() => ({})); const planId = (await params).id;
  try {
    await completeDailyLearningDay(planId, session.userId, Number(body.weekDay));
    await writeOperationLog({ userId: session.userId, username: session.username, client: "运营移动端", page: "每日学习", action: "完成学习", result: "成功", detail: `计划：${planId}，星期：${body.weekDay}`, request }).catch(() => undefined);
    return NextResponse.json({ success: true });
  } catch (error) { return NextResponse.json({ message: safeDailyLearningError(error, "学习完成状态保存失败，请稍后重试") }, { status: 400 }); }
}

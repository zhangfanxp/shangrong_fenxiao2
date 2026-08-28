import { NextResponse } from "next/server";
import { mobileDailyLearningTasks } from "@/lib/daily-learning";
import { getLeadH5Session } from "@/lib/lead-h5-auth";
import { writeOperationLog } from "@/lib/operation-log";

export async function GET(request: Request) {
  const session = await getLeadH5Session();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  try {
    const tasks = await mobileDailyLearningTasks(session.userId);
    const task = tasks.find(item => !item.completed) || tasks[0] || null;
    await writeOperationLog({
      userId: session.userId,
      username: session.username,
      client: "运营移动端",
      page: "每日学习",
      action: "查询今日计划",
      result: "成功",
      detail: task ? `今日计划：${task.recordNo}` : "当日暂无每日学习计划",
      request,
    }).catch(() => undefined);
    return NextResponse.json({ task, pending: tasks.some(item => !item.completed) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ message: "每日学习计划加载失败，请稍后重试" }, { status: 500 });
  }
}

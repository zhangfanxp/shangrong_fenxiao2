import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { dailyLearningCan, regenerateDailyLearningAssignments } from "@/lib/daily-learning";
import { writeOperationLog } from "@/lib/operation-log";

const inputSchema = z.object({ planIds: z.array(z.string().min(1)).min(1, "请至少勾选一条每日学习计划").max(100, "单次最多更新100条每日学习计划") });

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!dailyLearningCan(session, "update")) return NextResponse.json({ message: "暂无每日学习更新任务权限" }, { status: 403 });
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message }, { status: 400 });
  try {
    const result = await regenerateDailyLearningAssignments(parsed.data.planIds);
    await writeOperationLog({
      userId: session.userId, username: session.username, page: "每日学习", action: "更新任务", result: "成功",
      detail: `勾选计划：${result.selected}；实际处理：${result.processed}；新增学员：${result.added}；刷新快照：${result.refreshed}；移除未完成且不匹配学员：${result.removed}；保护已有学习记录学员：${result.protectedWithProgress}；跳过历史计划：${result.historicalSkipped}；无效记录：${result.missing}`,
      request,
    }).catch(() => undefined);
    return NextResponse.json(result);
  } catch {
    await writeOperationLog({ userId: session.userId, username: session.username, page: "每日学习", action: "更新任务", result: "失败", detail: "每日学习任务重新生成失败", request }).catch(() => undefined);
    return NextResponse.json({ message: "每日学习任务更新失败，请稍后重试" }, { status: 500 });
  }
}

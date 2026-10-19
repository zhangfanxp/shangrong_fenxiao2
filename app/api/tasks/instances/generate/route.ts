import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { generateStoreTaskInstances, shanghaiDateKey } from "@/lib/store-h5-tasks";
import { writeOperationLog } from "@/lib/operation-log";
import { canTaskSettingsAction } from "@/lib/task-settings-permissions";

const bodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  taskIds: z.array(z.string().trim().min(1)).min(1).max(1000).optional(),
});

export async function POST(request: Request) {
  const configuredSecret = process.env.TASK_SCHEDULER_SECRET;
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const secretAuthorized = Boolean(configuredSecret && bearer === configuredSecret);
  const session = secretAuthorized ? null : await requireApiSession();
  if (!secretAuthorized) {
    if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
    if (!canTaskSettingsAction(session.permissions, "update")) return NextResponse.json({ message: "暂无任务更新权限" }, { status: 403 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ message: "更新任务参数不正确，请重新选择任务后再试" }, { status: 400 });
  if (!secretAuthorized && !parsed.data.taskIds?.length) return NextResponse.json({ message: "请至少勾选一条需要更新的任务设置记录" }, { status: 400 });
  try {
    const result = await generateStoreTaskInstances(
      parsed.data.date || shanghaiDateKey(),
      parsed.data.taskIds,
      session ? "manual" : "automatic",
    );
    if (session) await writeOperationLog({ userId: session.userId, username: session.username, page: "任务设置", action: "更新任务", result: "成功", detail: `勾选任务：${parsed.data.taskIds?.length || 0}；执行日期：${result.date}；处理：${result.total}；新创建：${result.created}；覆盖：${result.covered}；未生成：${result.notGenerated}；转逾期：${result.overdue}`, request }).catch(() => undefined);
    return NextResponse.json(result);
  } catch {
    if (session) await writeOperationLog({ userId: session.userId, username: session.username, page: "任务设置", action: "更新任务", result: "失败", detail: "关联任务生成失败", request }).catch(() => undefined);
    return NextResponse.json({ message: "任务实例生成失败，请检查任务配置和数据库状态" }, { status: 500 });
  }
}

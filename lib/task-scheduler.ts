import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";
import { getPlatformConfig } from "@/lib/platform-config";
import { dateKeyAsDbDate, expireOverdueTaskInstances, generateStoreTaskInstances, shanghaiDateKey, shanghaiTimeKey } from "@/lib/store-h5-tasks";

export async function runScheduledTaskGeneration(now = new Date()) {
  // 调度器每分钟执行一次；即使今日任务已生成，也要继续迁移刚到截止时间的任务。
  const newlyOverdue = await expireOverdueTaskInstances(now);
  const platform = await getPlatformConfig();
  const date = shanghaiDateKey(now);
  const currentTime = shanghaiTimeKey(now);
  if (currentTime < platform.automaticTaskExecutionTime) return { status: "not-due" as const, date, scheduledTime: platform.automaticTaskExecutionTime, overdue: newlyOverdue };

  const executionDate = dateKeyAsDbDate(date);
  let run = await db.taskSchedulerRun.findUnique({ where: { executionDate } });
  if (run?.status === "SUCCESS") return { status: "already-completed" as const, date, scheduledTime: platform.automaticTaskExecutionTime, overdue: newlyOverdue, result: run.result };
  const staleBefore = new Date(now.getTime() - 30 * 60 * 1000);
  if (run?.status === "RUNNING" && run.startedAt >= staleBefore) return { status: "already-running" as const, date, scheduledTime: platform.automaticTaskExecutionTime, overdue: newlyOverdue };

  if (!run) {
    try {
      run = await db.taskSchedulerRun.create({ data: { executionDate, scheduledTime: platform.automaticTaskExecutionTime, status: "RUNNING", startedAt: now } });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
      return { status: "already-running" as const, date, scheduledTime: platform.automaticTaskExecutionTime, overdue: newlyOverdue };
    }
  } else {
    const claimed = await db.taskSchedulerRun.updateMany({ where: { id: run.id, status: run.status, startedAt: run.startedAt }, data: { status: "RUNNING", scheduledTime: platform.automaticTaskExecutionTime, startedAt: now, completedAt: null, error: null } });
    if (!claimed.count) return { status: "already-running" as const, date, scheduledTime: platform.automaticTaskExecutionTime, overdue: newlyOverdue };
  }

  try {
    const generated = await generateStoreTaskInstances(date, undefined, "automatic");
    const result = { ...generated, overdue: newlyOverdue + generated.overdue };
    await db.taskSchedulerRun.update({ where: { executionDate }, data: { status: "SUCCESS", completedAt: new Date(), result: result as unknown as Prisma.InputJsonValue, error: null } });
    await writeOperationLog({ username: "系统", page: "定时任务", action: "自动生成任务", result: "成功", detail: `执行日期：${date}；新创建：${result.created}；已存在：${result.notGenerated}；转逾期：${result.overdue}；异常配置：${result.ignoredTasks}` }).catch(() => undefined);
    return { status: "completed" as const, ...result, scheduledTime: platform.automaticTaskExecutionTime };
  } catch (error) {
    const message = error instanceof Error ? error.message : "自动任务生成失败";
    await db.taskSchedulerRun.update({ where: { executionDate }, data: { status: "FAILED", completedAt: new Date(), error: message.slice(0, 10000) } }).catch(() => undefined);
    await writeOperationLog({ username: "系统", page: "定时任务", action: "自动生成任务", result: "失败", detail: `执行日期：${date}；${message}` }).catch(() => undefined);
    throw error;
  }
}

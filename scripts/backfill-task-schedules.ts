import { TaskType } from "@prisma/client";
import { loadEnvConfig } from "@next/env";

async function main() {
  loadEnvConfig(process.cwd());
  const { db } = await import("@/lib/db");
  const tasks = await db.task.findMany({ select: { id: true, type: true, executionDays: true, weeklyExecutionDay: true, monthlyExecutionDay: true } });
  let updated = 0;
  for (const task of tasks) {
    const legacyDays = Array.isArray(task.executionDays) ? task.executionDays.filter((value): value is string => typeof value === "string") : [];
    const data = task.type === TaskType.WEEKLY && !task.weeklyExecutionDay
      ? { weeklyExecutionDay: legacyDays[0] || "周一" }
      : task.type === TaskType.MONTHLY && !task.monthlyExecutionDay
        ? { monthlyExecutionDay: "1" }
        : null;
    if (data) { await db.task.update({ where: { id: task.id }, data }); updated += 1; }
  }
  await db.$disconnect();
  process.stdout.write(`${JSON.stringify({ total: tasks.length, updated })}\n`);
}

main().catch(error => { process.stderr.write(`${error instanceof Error ? error.message : "任务排期兼容失败"}\n`); process.exitCode = 1; });

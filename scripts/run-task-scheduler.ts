import { loadEnvConfig } from "@next/env";

async function main() {
  loadEnvConfig(process.cwd());
  const [{ db }, { runScheduledTaskGeneration }, { publishDueNotifications }] = await Promise.all([
    import("@/lib/db"),
    import("@/lib/task-scheduler"),
    import("@/lib/notifications"),
  ]);
  try {
    const [taskResult, notificationResult] = await Promise.allSettled([runScheduledTaskGeneration(), publishDueNotifications()]);
    process.stdout.write(`${JSON.stringify({
      tasks: taskResult.status === "fulfilled" ? taskResult.value : { status: "failed", message: taskResult.reason instanceof Error ? taskResult.reason.message : "任务生成失败" },
      notifications: notificationResult.status === "fulfilled" ? notificationResult.value : { status: "failed", message: notificationResult.reason instanceof Error ? notificationResult.reason.message : "通知发布失败" },
    })}\n`);
    if (taskResult.status === "rejected" || notificationResult.status === "rejected") throw new Error("一个或多个定时任务执行失败");
  } finally {
    await db.$disconnect();
  }
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : "定时任务执行失败"}\n`);
  process.exitCode = 1;
});

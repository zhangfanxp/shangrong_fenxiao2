import { loadEnvConfig } from "@next/env";

async function main() {
  loadEnvConfig(process.cwd());
  const [{ db }, { runScheduledTaskGeneration }, { publishDueNotifications }, { runDueDatabaseBackups }] = await Promise.all([
    import("@/lib/db"),
    import("@/lib/task-scheduler"),
    import("@/lib/notifications"),
    import("@/lib/database-backup"),
  ]);
  try {
    const [taskResult, notificationResult, backupResult] = await Promise.allSettled([runScheduledTaskGeneration(), publishDueNotifications(), runDueDatabaseBackups()]);
    const output = {
      tasks: taskResult.status === "fulfilled" ? taskResult.value : { status: "failed", message: taskResult.reason instanceof Error ? taskResult.reason.message : "任务生成失败" },
      notifications: notificationResult.status === "fulfilled" ? notificationResult.value : { status: "failed", message: notificationResult.reason instanceof Error ? notificationResult.reason.message : "通知发布失败" },
      databaseBackups: backupResult.status === "fulfilled" ? backupResult.value : { status: "failed", message: backupResult.reason instanceof Error ? backupResult.reason.message : "数据库备份失败" },
    };
    const meaningful = taskResult.status === "rejected"
      || notificationResult.status === "rejected"
      || backupResult.status === "rejected"
      || (taskResult.status === "fulfilled" && taskResult.value.status === "completed")
      || (notificationResult.status === "fulfilled" && notificationResult.value.published > 0)
      || (backupResult.status === "fulfilled" && backupResult.value.status === "completed");
    if (meaningful) process.stdout.write(`${JSON.stringify(output)}\n`);
    if (taskResult.status === "rejected" || notificationResult.status === "rejected" || backupResult.status === "rejected") throw new Error("一个或多个定时任务执行失败");
  } finally {
    await db.$disconnect();
  }
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : "定时任务执行失败"}\n`);
  process.exitCode = 1;
});

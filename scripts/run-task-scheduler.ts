import { loadEnvConfig } from "@next/env";

async function main() {
  loadEnvConfig(process.cwd());
  const [{ db }, { runScheduledTaskGeneration }, { publishDueNotifications }, { runDueDatabaseBackups }, { runScheduledContractExpiryCalculation }, { runScheduledBirthdayReminderCalculation }] = await Promise.all([
    import("@/lib/db"),
    import("@/lib/task-scheduler"),
    import("@/lib/notifications"),
    import("@/lib/database-backup"),
    import("@/lib/contract-expiry-scheduler"),
    import("@/lib/birthday-reminder-scheduler"),
  ]);
  try {
    const [taskResult, notificationResult, backupResult, contractExpiryResult, birthdayReminderResult] = await Promise.allSettled([runScheduledTaskGeneration(), publishDueNotifications(), runDueDatabaseBackups(), runScheduledContractExpiryCalculation(), runScheduledBirthdayReminderCalculation()]);
    const output = {
      tasks: taskResult.status === "fulfilled" ? taskResult.value : { status: "failed", message: taskResult.reason instanceof Error ? taskResult.reason.message : "任务生成失败" },
      notifications: notificationResult.status === "fulfilled" ? notificationResult.value : { status: "failed", message: notificationResult.reason instanceof Error ? notificationResult.reason.message : "通知发布失败" },
      databaseBackups: backupResult.status === "fulfilled" ? backupResult.value : { status: "failed", message: backupResult.reason instanceof Error ? backupResult.reason.message : "数据库备份失败" },
      contractExpiry: contractExpiryResult.status === "fulfilled" ? contractExpiryResult.value : { status: "failed", message: contractExpiryResult.reason instanceof Error ? contractExpiryResult.reason.message : "合同即将到期状态计算失败" },
      birthdayReminder: birthdayReminderResult.status === "fulfilled" ? birthdayReminderResult.value : { status: "failed", message: birthdayReminderResult.reason instanceof Error ? birthdayReminderResult.reason.message : "员工生日提醒计算失败" },
    };
    const meaningful = taskResult.status === "rejected"
      || notificationResult.status === "rejected"
      || backupResult.status === "rejected"
      || contractExpiryResult.status === "rejected"
      || birthdayReminderResult.status === "rejected"
      || (taskResult.status === "fulfilled" && taskResult.value.status === "completed")
      || (notificationResult.status === "fulfilled" && notificationResult.value.published > 0)
      || (backupResult.status === "fulfilled" && backupResult.value.status === "completed")
      || (contractExpiryResult.status === "fulfilled" && contractExpiryResult.value.status === "completed")
      || (birthdayReminderResult.status === "fulfilled" && birthdayReminderResult.value.status === "completed");
    if (meaningful) process.stdout.write(`${JSON.stringify(output)}\n`);
    if (taskResult.status === "rejected" || notificationResult.status === "rejected" || backupResult.status === "rejected" || contractExpiryResult.status === "rejected" || birthdayReminderResult.status === "rejected") throw new Error("一个或多个定时任务执行失败");
  } finally {
    await db.$disconnect();
  }
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : "定时任务执行失败"}\n`);
  process.exitCode = 1;
});

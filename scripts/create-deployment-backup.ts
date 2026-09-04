import { loadEnvConfig } from "@next/env";

async function main() {
  loadEnvConfig(process.cwd());
  const [{ db }, { executeDatabaseBackup }] = await Promise.all([import("../lib/db"), import("../lib/database-backup")]);
  try {
    const [setting, administrator] = await Promise.all([
      db.databaseBackupSetting.findUnique({ where: { id: "database-backup" }, select: { r2StorageId: true } }),
      db.user.findFirst({ where: { role: { code: "SUPER_ADMIN" }, status: "ENABLED" }, select: { id: true } }),
    ]);
    if (!setting) {
      process.stdout.write(`${JSON.stringify({ skipped: true, reason: "尚未配置数据库备份" })}\n`);
      return;
    }
    if (!administrator) throw new Error("缺少超级管理员，无法在升级前自动备份");
    const backup = await executeDatabaseBackup({ r2StorageId: setting.r2StorageId, backupType: "MANUAL", createdByUserId: administrator.id, createdByName: "版本升级前自动备份" });
    process.stdout.write(`${JSON.stringify({ backupFileName: backup.fileName, sizeBytes: backup.sizeBytes, checksumSha256: backup.checksumSha256 })}\n`);
  } finally { await db.$disconnect(); }
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : "升级前数据库备份失败"}\n`);
  process.exitCode = 1;
});

import { loadEnvConfig } from "@next/env";

async function readStdin() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as { administratorId: string; r2StorageId: string };
}

async function main() {
  loadEnvConfig(process.cwd());
  const input = await readStdin();
  const [{ db }, { executeDatabaseBackup }] = await Promise.all([import("../lib/db"), import("../lib/database-backup")]);
  try {
    const [administrator, r2Storage, roleCount, dictionaryCount] = await Promise.all([
      db.user.findUnique({ where: { id: input.administratorId }, select: { id: true, realName: true } }),
      db.r2StorageConfig.findFirst({ where: { id: input.r2StorageId, status: "ENABLED", deletedAt: null }, select: { id: true } }),
      db.role.count({ where: { code: "SUPER_ADMIN", status: "ENABLED" } }),
      db.dataDictionary.count({ where: { status: "ENABLED" } }),
    ]);
    if (!administrator || !r2Storage || roleCount !== 1 || dictionaryCount < 12) throw new Error("数据库初始化结果不完整");
    const backup = await executeDatabaseBackup({
      r2StorageId: r2Storage.id,
      backupType: "MANUAL",
      createdByUserId: administrator.id,
      createdByName: "首次部署验证",
    });
    process.stdout.write(`${JSON.stringify({ database: true, r2: true, backup: true, backupFileName: backup.fileName, backupSizeBytes: backup.sizeBytes })}\n`);
  } finally {
    await db.$disconnect();
  }
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : "部署验证失败"}\n`);
  process.exitCode = 1;
});

import { loadEnvConfig } from "@next/env";

async function main() {
  loadEnvConfig(process.cwd());
  const [{ db }, { verifyDatabaseBackupEnvironment }] = await Promise.all([import("@/lib/db"), import("@/lib/database-backup")]);
  try {
    const result = await verifyDatabaseBackupEnvironment();
    process.stdout.write(`${JSON.stringify({ status: "success", ...result })}\n`);
  } finally {
    await db.$disconnect();
  }
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : "数据库备份环境校验失败"}\n`);
  process.exitCode = 1;
});

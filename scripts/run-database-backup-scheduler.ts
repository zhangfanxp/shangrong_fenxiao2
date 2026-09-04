import { loadEnvConfig } from "@next/env";

async function main() {
  loadEnvConfig(process.cwd());
  const [{ db }, { runDueDatabaseBackups }] = await Promise.all([import("@/lib/db"), import("@/lib/database-backup")]);
  try {
    process.stdout.write(`${JSON.stringify(await runDueDatabaseBackups())}\n`);
  } finally {
    await db.$disconnect();
  }
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : "数据库定时备份失败"}\n`);
  process.exitCode = 1;
});

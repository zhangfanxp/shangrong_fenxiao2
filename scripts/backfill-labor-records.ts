import { loadEnvConfig } from "@next/env";

async function main() {
  loadEnvConfig(process.cwd());
  const [{ db }, { reconcileAllLaborRecords }] = await Promise.all([
    import("../lib/db"),
    import("../lib/labor-records"),
  ]);
  try {
    const result = await reconcileAllLaborRecords();
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await db.$disconnect();
  }
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : "用工记录历史数据回填失败"}\n`);
  process.exitCode = 1;
});

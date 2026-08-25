import { loadEnvConfig } from "@next/env";

async function main() {
  loadEnvConfig(process.cwd());
  const [{ db }, { generateStoreTaskInstances, shanghaiDateKey }] = await Promise.all([
    import("@/lib/db"),
    import("@/lib/store-h5-tasks"),
  ]);
  const date = process.argv[2] || shanghaiDateKey();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("日期格式应为 YYYY-MM-DD");
  try {
    const result = await generateStoreTaskInstances(date, undefined, "automatic");
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await db.$disconnect();
  }
}

main()
  .catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : "任务实例生成失败"}\n`);
    process.exitCode = 1;
  });

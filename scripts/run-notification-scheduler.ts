import { loadEnvConfig } from "@next/env";

async function main() {
  loadEnvConfig(process.cwd());
  const [{ db }, { publishDueNotifications }] = await Promise.all([import("@/lib/db"), import("@/lib/notifications")]);
  try {
    process.stdout.write(`${JSON.stringify(await publishDueNotifications())}\n`);
  } finally {
    await db.$disconnect();
  }
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : "通知定时发布失败"}\n`);
  process.exitCode = 1;
});

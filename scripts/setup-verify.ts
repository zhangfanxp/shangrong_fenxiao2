import { loadEnvConfig } from "@next/env";
import { fixedSystemRoles } from "../lib/system-roles";

async function readStdin() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as { administratorId: string };
}

async function main() {
  loadEnvConfig(process.cwd());
  const input = await readStdin();
  const { db } = await import("../lib/db");
  try {
    const [administrator, roles, dictionaryCount, database] = await Promise.all([
      db.user.findUnique({ where: { id: input.administratorId }, select: { id: true, realName: true } }),
      db.role.findMany({ where: { code: { in: fixedSystemRoles.map(role => role.code) }, type: "SYSTEM", status: "ENABLED" }, select: { code: true, name: true } }),
      db.dataDictionary.count({ where: { status: "ENABLED" } }),
      db.$queryRaw<Array<{ ok: number | bigint }>>`SELECT 1 AS ok`,
    ]);
    const roleIdentities = new Set(roles.map(role => `${role.code}:${role.name}`));
    const rolesComplete = fixedSystemRoles.every(role => roleIdentities.has(`${role.code}:${role.name}`));
    if (!administrator || !rolesComplete || dictionaryCount < 12 || Number(database[0]?.ok) !== 1) throw new Error("数据库初始化结果不完整");
    process.stdout.write(`${JSON.stringify({ database: true, administrator: true, systemRoles: roles.length, dictionaries: dictionaryCount })}\n`);
  } finally {
    await db.$disconnect();
  }
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : "部署验证失败"}\n`);
  process.exitCode = 1;
});

import { loadEnvConfig } from "@next/env";
import { SYSTEM_DICTIONARIES } from "../lib/deployment";
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
    const [administrator, userCount, roles, dictionaries, database] = await Promise.all([
      db.user.findUnique({ where: { id: input.administratorId }, select: { id: true, username: true, realName: true } }),
      db.user.count(),
      db.role.findMany({ where: { code: { in: fixedSystemRoles.map(role => role.code) }, type: "SYSTEM", status: "ENABLED" }, select: { code: true, name: true } }),
      db.dataDictionary.findMany({
        where: { code: { in: SYSTEM_DICTIONARIES.map(dictionary => dictionary.code) }, status: "ENABLED" },
        select: { recordNo: true, name: true, code: true, fileName: true },
      }),
      db.$queryRaw<Array<{ ok: number | bigint }>>`SELECT 1 AS ok`,
    ]);
    const roleIdentities = new Set(roles.map(role => `${role.code}:${role.name}`));
    const rolesComplete = fixedSystemRoles.every(role => roleIdentities.has(`${role.code}:${role.name}`));
    const dictionaryIdentities = new Set(dictionaries.map(dictionary => `${dictionary.recordNo}:${dictionary.name}:${dictionary.code}:${dictionary.fileName}`));
    const dictionariesComplete = SYSTEM_DICTIONARIES.every(dictionary => dictionaryIdentities.has(`${dictionary.recordNo}:${dictionary.name}:${dictionary.code}:${dictionary.fileName}`));
    if (!administrator || administrator.username !== "admin" || userCount !== 1 || !rolesComplete || !dictionariesComplete || Number(database[0]?.ok) !== 1) throw new Error("数据库初始化结果不完整，必须只创建admin超级管理员用户");
    process.stdout.write(`${JSON.stringify({ database: true, administrator: true, users: userCount, systemRoles: roles.length, dictionaries: dictionaries.length })}\n`);
  } finally {
    await db.$disconnect();
  }
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : "部署验证失败"}\n`);
  process.exitCode = 1;
});

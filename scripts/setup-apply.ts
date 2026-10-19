import { loadEnvConfig } from "@next/env";
import bcrypt from "bcryptjs";
import { RecordStatus, UserType } from "@prisma/client";
import { setupInputSchema } from "../lib/deployment";
import { synchronizeSystemDictionaries } from "../lib/system-dictionary-sync";
import { synchronizeFixedSystemRoles } from "../lib/system-role-sync";

async function readStdin() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  loadEnvConfig(process.cwd());
  const input = setupInputSchema.parse(JSON.parse(await readStdin()));
  const [{ db }, { getPlatformConfig, savePlatformConfig }] = await Promise.all([
    import("../lib/db"),
    import("../lib/platform-config"),
  ]);

  try {
    const roles = await synchronizeFixedSystemRoles(db);
    const role = roles.find(item => item.code === "SUPER_ADMIN");
    if (!role) throw new Error("超级管理员角色初始化失败");
    const passwordHash = await bcrypt.hash(input.administrator.password, 12);
    const administrator = await db.user.upsert({
      where: { username: input.administrator.username },
      create: {
        username: input.administrator.username,
        passwordHash,
        mustChangePassword: true,
        realName: input.administrator.realName,
        phone: input.administrator.phone || null,
        type: UserType.SYSTEM,
        status: RecordStatus.ENABLED,
        roleId: role.id,
      },
      update: {
        passwordHash,
        mustChangePassword: true,
        realName: input.administrator.realName,
        phone: input.administrator.phone || null,
        type: UserType.SYSTEM,
        status: RecordStatus.ENABLED,
        roleId: role.id,
      },
    });

    const dictionaries = await synchronizeSystemDictionaries(db);

    const positionLevels = ["实习生", "员工·一星", "员工·二星", "主管·三星", "店长·四星", "店长·五星"];
    for (const [sort, label] of positionLevels.entries()) {
      await db.dictionaryItem.upsert({
        where: { type_value: { type: "POSITION_LEVEL", value: `LEVEL_${sort + 1}` } },
        create: { type: "POSITION_LEVEL", value: `LEVEL_${sort + 1}`, label, sort, status: RecordStatus.ENABLED },
        update: { label, sort, status: RecordStatus.ENABLED },
      });
    }

    const currentPlatform = await getPlatformConfig();
    await savePlatformConfig({
      ...currentPlatform,
      platformName: input.platformName,
    });
    process.stdout.write(`${JSON.stringify({ administratorId: administrator.id, systemRoles: roles.length, dictionaries: dictionaries.length })}\n`);
  } finally {
    await db.$disconnect();
  }
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : "初始化基础数据失败"}\n`);
  process.exitCode = 1;
});

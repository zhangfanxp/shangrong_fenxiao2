import { loadEnvConfig } from "@next/env";
import bcrypt from "bcryptjs";
import { RecordStatus, UserType } from "@prisma/client";
import { setupInputSchema, SYSTEM_DICTIONARIES } from "../lib/deployment";

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
    const role = await db.role.upsert({
      where: { code: "SUPER_ADMIN" },
      create: { code: "SUPER_ADMIN", name: "超级管理员", type: "SYSTEM", status: RecordStatus.ENABLED, permissions: ["*"] },
      update: { name: "超级管理员", type: "SYSTEM", status: RecordStatus.ENABLED, permissions: ["*"] },
    });
    const passwordHash = await bcrypt.hash(input.administrator.password, 12);
    const administrator = await db.user.upsert({
      where: { username: input.administrator.username },
      create: {
        username: input.administrator.username,
        passwordHash,
        realName: input.administrator.realName,
        phone: input.administrator.phone || null,
        type: UserType.SYSTEM,
        status: RecordStatus.ENABLED,
        roleId: role.id,
      },
      update: {
        passwordHash,
        realName: input.administrator.realName,
        phone: input.administrator.phone || null,
        type: UserType.SYSTEM,
        status: RecordStatus.ENABLED,
        roleId: role.id,
      },
    });

    for (const dictionary of SYSTEM_DICTIONARIES) {
      await db.dataDictionary.upsert({
        where: { code: dictionary.code },
        create: { ...dictionary, status: RecordStatus.ENABLED },
        update: { name: dictionary.name, fileName: dictionary.fileName, status: RecordStatus.ENABLED },
      });
    }

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
    process.stdout.write(`${JSON.stringify({ administratorId: administrator.id })}\n`);
  } finally {
    await db.$disconnect();
  }
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : "初始化基础数据失败"}\n`);
  process.exitCode = 1;
});

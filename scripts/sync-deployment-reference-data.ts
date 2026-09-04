import { loadEnvConfig } from "@next/env";
import { RecordStatus } from "@prisma/client";
import { SYSTEM_DICTIONARIES } from "../lib/deployment";

async function main() {
  loadEnvConfig(process.cwd());
  const { db } = await import("../lib/db");
  try {
    await db.role.upsert({
      where: { code: "SUPER_ADMIN" },
      create: { code: "SUPER_ADMIN", name: "超级管理员", type: "SYSTEM", status: RecordStatus.ENABLED, permissions: ["*"] },
      update: { name: "超级管理员", type: "SYSTEM", status: RecordStatus.ENABLED, permissions: ["*"] },
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
    process.stdout.write(`${JSON.stringify({ dictionaries: SYSTEM_DICTIONARIES.length, positionLevels: positionLevels.length })}\n`);
  } finally { await db.$disconnect(); }
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : "基础数据同步失败"}\n`);
  process.exitCode = 1;
});

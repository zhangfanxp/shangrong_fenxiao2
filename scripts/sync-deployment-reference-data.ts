import { loadEnvConfig } from "@next/env";
import { RecordStatus } from "@prisma/client";
import { synchronizeSystemDictionaries } from "../lib/system-dictionary-sync";
import { synchronizeFixedSystemRoles } from "../lib/system-role-sync";

async function main() {
  loadEnvConfig(process.cwd());
  const { db } = await import("../lib/db");
  try {
    const roles = await synchronizeFixedSystemRoles(db);
    const dictionaries = await synchronizeSystemDictionaries(db);
    const positionLevels = ["实习生", "员工·一星", "员工·二星", "主管·三星", "店长·四星", "店长·五星"];
    for (const [sort, label] of positionLevels.entries()) {
      await db.dictionaryItem.upsert({
        where: { type_value: { type: "POSITION_LEVEL", value: `LEVEL_${sort + 1}` } },
        create: { type: "POSITION_LEVEL", value: `LEVEL_${sort + 1}`, label, sort, status: RecordStatus.ENABLED },
        update: { label, sort, status: RecordStatus.ENABLED },
      });
    }
    process.stdout.write(`${JSON.stringify({ systemRoles: roles.length, dictionaries: dictionaries.length, positionLevels: positionLevels.length })}\n`);
  } finally { await db.$disconnect(); }
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : "基础数据同步失败"}\n`);
  process.exitCode = 1;
});

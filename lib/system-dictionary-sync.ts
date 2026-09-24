import { RecordStatus, type PrismaClient } from "@prisma/client";
import { SYSTEM_DICTIONARIES } from "./deployment";

export async function synchronizeSystemDictionaries(db: Pick<PrismaClient, "dataDictionary">) {
  const synchronized = [];

  for (const definition of SYSTEM_DICTIONARIES) {
    const matches = await db.dataDictionary.findMany({
      where: {
        OR: [
          { recordNo: definition.recordNo },
          { name: definition.name },
          { code: definition.code },
          { fileName: definition.fileName },
        ],
      },
    });

    if (matches.length > 1) {
      throw new Error(`系统数据字典“${definition.name}”的编号、名称、英文名称或文件名被多条记录占用，请先合并冲突数据`);
    }

    const existing = matches[0];
    const dictionary = existing
      ? await db.dataDictionary.update({
          where: { id: existing.id },
          data: {
            recordNo: definition.recordNo,
            name: definition.name,
            code: definition.code,
            fileName: definition.fileName,
            status: RecordStatus.ENABLED,
          },
        })
      : await db.dataDictionary.create({
          data: { ...definition, status: RecordStatus.ENABLED },
        });

    synchronized.push(dictionary);
  }

  return synchronized;
}

import { loadEnvConfig } from "@next/env";
import bcrypt from "bcryptjs";
import { RecordStatus, UserType } from "@prisma/client";
import { setupInputSchema, SYSTEM_DICTIONARIES } from "../lib/deployment";

async function readStdin() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function shanghaiDatePrefix() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: string) => parts.find(item => item.type === type)?.value || "";
  return `${part("year")}${part("month")}${part("day")}`;
}

async function main() {
  loadEnvConfig(process.cwd());
  const input = setupInputSchema.parse(JSON.parse(await readStdin()));
  const [{ db }, { encryptR2Credential }, { writeR2ConfigDocument }, { getPlatformConfig, savePlatformConfig }] = await Promise.all([
    import("../lib/db"),
    import("../lib/r2-crypto"),
    import("../lib/r2-config-file"),
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

    const encryptedAccessKey = encryptR2Credential(input.r2.accessKeyId);
    const encryptedSecret = encryptR2Credential(input.r2.secretAccessKey);
    const existingR2 = await db.r2StorageConfig.findFirst({ where: { accountId: input.r2.accountId, bucketName: input.r2.bucketName, deletedAt: null } });
    const r2Storage = existingR2
      ? await db.r2StorageConfig.update({
          where: { id: existingR2.id },
          data: {
            name: input.r2.name,
            accessKeyIdEncrypted: encryptedAccessKey,
            secretAccessKeyEncrypted: encryptedSecret,
            endpoint: input.r2.endpoint,
            signedUrlExpireSeconds: input.r2.signedUrlExpireSeconds,
            status: RecordStatus.ENABLED,
            createdByUserId: administrator.id,
            version: { increment: 1 },
          },
        })
      : await db.r2StorageConfig.create({
          data: {
            recordNo: `${shanghaiDatePrefix()}0001`,
            name: input.r2.name,
            accountId: input.r2.accountId,
            accessKeyIdEncrypted: encryptedAccessKey,
            secretAccessKeyEncrypted: encryptedSecret,
            bucketName: input.r2.bucketName,
            endpoint: input.r2.endpoint,
            signedUrlExpireSeconds: input.r2.signedUrlExpireSeconds,
            status: RecordStatus.ENABLED,
            createdByUserId: administrator.id,
          },
        });

    const r2Rows = await db.r2StorageConfig.findMany({
      where: { deletedAt: null },
      include: { createdBy: { select: { realName: true } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    await writeR2ConfigDocument({
      buckets: r2Rows.map(row => ({
        id: row.id,
        recordNo: row.recordNo,
        name: row.name,
        accountId: row.accountId,
        accessKeyId: row.accessKeyIdEncrypted,
        secretAccessKey: row.secretAccessKeyEncrypted,
        bucketName: row.bucketName,
        endpoint: row.endpoint,
        signedUrlExpireSeconds: row.signedUrlExpireSeconds,
        status: row.status,
        createdBy: row.createdBy?.realName || "系统",
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        version: row.version,
      })),
    });

    const currentPlatform = await getPlatformConfig();
    await savePlatformConfig({
      ...currentPlatform,
      platformName: input.platformName,
      dailyLearningR2StorageId: input.r2.usages.dailyLearning ? r2Storage.id : null,
      trainingVideoR2StorageId: input.r2.usages.trainingVideo ? r2Storage.id : null,
      trainingAudioR2StorageId: input.r2.usages.trainingAudio ? r2Storage.id : null,
      trainingDocumentR2StorageId: input.r2.usages.trainingDocument ? r2Storage.id : null,
    });

    await db.$transaction([
      db.databaseBackupSetting.upsert({
        where: { id: "database-backup" },
        create: {
          id: "database-backup",
          r2StorageId: r2Storage.id,
          enabled: true,
          frequency: input.backup.frequency,
          weekdays: input.backup.frequency === "WEEKLY" ? input.backup.weekdays : [],
          executionTimes: input.backup.executionTimes,
          updatedByUserId: administrator.id,
          updatedByName: administrator.realName,
        },
        update: {
          r2StorageId: r2Storage.id,
          enabled: true,
          frequency: input.backup.frequency,
          weekdays: input.backup.frequency === "WEEKLY" ? input.backup.weekdays : [],
          executionTimes: input.backup.executionTimes,
          updatedByUserId: administrator.id,
          updatedByName: administrator.realName,
        },
      }),
      db.r2StorageReference.upsert({
        where: { businessType_businessId: { businessType: "DATABASE_BACKUP_SETTING", businessId: "PLATFORM" } },
        create: { r2ConfigId: r2Storage.id, businessType: "DATABASE_BACKUP_SETTING", businessId: "PLATFORM" },
        update: { r2ConfigId: r2Storage.id },
      }),
    ]);

    process.stdout.write(`${JSON.stringify({ administratorId: administrator.id, r2StorageId: r2Storage.id })}\n`);
  } finally {
    await db.$disconnect();
  }
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : "初始化基础数据失败"}\n`);
  process.exitCode = 1;
});

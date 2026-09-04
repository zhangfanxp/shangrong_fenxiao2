import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { chmod, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip, createGzip } from "node:zlib";
import { DeleteObjectCommand, DeleteObjectsCommand, GetObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";
import { getEnabledR2Config, getR2ConfigForCleanup } from "@/lib/r2-config-service";
import type { BackupFrequency } from "@/lib/database-backup-validation";

const SETTING_ID = "database-backup";
const ACTIVE_LOCK_KEY = "database-backup";
const STORAGE_SETTING_REFERENCE = "DATABASE_BACKUP_SETTING";
const STORAGE_FILES_REFERENCE = "DATABASE_BACKUP_FILES";
const RUNNING_STALE_AFTER_MS = 6 * 60 * 60 * 1000;

export type DatabaseBackupType = "MANUAL" | "SCHEDULED";

export class DatabaseBackupError extends Error {
  constructor(public readonly code: "busy" | "duplicate" | "invalid" | "dump" | "upload" | "not-found" | "running", message: string) {
    super(message);
  }
}

function stringArray(value: Prisma.JsonValue | null | undefined) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function numberArray(value: Prisma.JsonValue | null | undefined) {
  return Array.isArray(value) ? value.filter((item): item is number => typeof item === "number" && Number.isInteger(item) && item >= 1 && item <= 7) : [];
}

export function serializeDatabaseBackupSetting(row: Awaited<ReturnType<typeof getDatabaseBackupSetting>>) {
  if (!row) return { r2StorageId: null, enabled: false, frequency: "DAILY" as const, weekdays: [], executionTimes: [] };
  return {
    r2StorageId: row.r2StorageId,
    enabled: row.enabled,
    frequency: row.frequency === "WEEKLY" ? "WEEKLY" as const : "DAILY" as const,
    weekdays: numberArray(row.weekdays),
    executionTimes: stringArray(row.executionTimes),
    updatedAt: row.updatedAt.toISOString(),
    updatedByName: row.updatedByName,
  };
}

export function serializeDatabaseBackupFile(row: {
  id: string; fileName: string; r2StorageId: string; r2StorageNameSnapshot: string; bucketNameSnapshot: string;
  backupType: string; status: string; sizeBytes: bigint; checksumSha256: string | null; durationSeconds: number | null;
  errorMessage: string | null; createdByName: string; startedAt: Date; completedAt: Date | null;
}) {
  return {
    ...row,
    sizeBytes: Number(row.sizeBytes),
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

export async function getDatabaseBackupSetting() {
  return db.databaseBackupSetting.findUnique({ where: { id: SETTING_ID } });
}

export async function saveDatabaseBackupSetting(input: {
  r2StorageId: string;
  enabled: boolean;
  frequency: BackupFrequency;
  weekdays: number[];
  executionTimes: string[];
  userId: string;
  userName: string;
}) {
  await getEnabledR2Config(input.r2StorageId);
  const weekdays = [...new Set(input.weekdays)].sort((a, b) => a - b);
  const executionTimes = [...new Set(input.executionTimes)].sort();
  return db.$transaction(async tx => {
    const setting = await tx.databaseBackupSetting.upsert({
      where: { id: SETTING_ID },
      create: {
        id: SETTING_ID, r2StorageId: input.r2StorageId, enabled: input.enabled, frequency: input.frequency,
        weekdays, executionTimes, updatedByUserId: input.userId, updatedByName: input.userName,
      },
      update: {
        r2StorageId: input.r2StorageId, enabled: input.enabled, frequency: input.frequency,
        weekdays, executionTimes, updatedByUserId: input.userId, updatedByName: input.userName,
      },
    });
    await tx.r2StorageReference.upsert({
      where: { businessType_businessId: { businessType: STORAGE_SETTING_REFERENCE, businessId: "PLATFORM" } },
      create: { r2ConfigId: input.r2StorageId, businessType: STORAGE_SETTING_REFERENCE, businessId: "PLATFORM" },
      update: { r2ConfigId: input.r2StorageId },
    });
    return setting;
  });
}

function shanghaiParts(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short", hourCycle: "h23",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value || "";
  const weekday = ({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 } as Record<string, number>)[part("weekday")] || 1;
  return {
    year: part("year"), month: part("month"), day: part("day"), hour: part("hour"), minute: part("minute"), second: part("second"), weekday,
  };
}

function safeIniValue(value: string) {
  if (/[\r\n]/.test(value)) throw new DatabaseBackupError("invalid", "DATABASE_URL包含无法用于数据库备份的字符");
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function databaseConnection() {
  const source = process.env.DATABASE_URL;
  if (!source) throw new DatabaseBackupError("invalid", "服务器尚未配置DATABASE_URL，无法执行数据库备份");
  let url: URL;
  try { url = new URL(source); } catch { throw new DatabaseBackupError("invalid", "服务器DATABASE_URL格式无效，无法执行数据库备份"); }
  if (url.protocol !== "mysql:") throw new DatabaseBackupError("invalid", "当前数据库不是MySQL，无法使用此全量备份流程");
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!url.hostname || !url.username || !database) throw new DatabaseBackupError("invalid", "服务器DATABASE_URL缺少主机、用户或数据库名称");
  return {
    host: url.hostname,
    port: url.port || "3306",
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
  };
}

async function runDumpCommand(executable: string, defaultsFile: string, database: string, outputPath: string) {
  const isMaria = path.basename(executable).startsWith("mariadb");
  const args = [
    `--defaults-extra-file=${defaultsFile}`,
    "--single-transaction", "--quick", "--routines", "--events", "--triggers", "--hex-blob",
    "--default-character-set=utf8mb4", "--add-drop-database", "--no-tablespaces",
    ...(!isMaria ? ["--set-gtid-purged=OFF"] : []),
    "--databases", database,
  ];
  const child = spawn(executable, args, { stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  child.stderr?.on("data", chunk => { if (stderr.length < 8_000) stderr += String(chunk); });
  const timeout = setTimeout(() => child.kill("SIGTERM"), 60 * 60 * 1000);
  const completed = new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", code => code === 0 ? resolve() : reject(Object.assign(new Error(stderr.trim() || `数据库导出进程异常退出（${code ?? "unknown"}）`), { exitCode: code })));
  });
  try {
    if (!child.stdout) throw new Error("无法读取数据库导出结果");
    await Promise.all([completed, pipeline(child.stdout, createGzip({ level: 9 }), createWriteStream(outputPath, { mode: 0o600 }))]);
  } catch (error) {
    if (child.exitCode === null) child.kill("SIGTERM");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function createFullDump(outputPath: string, defaultsFile: string, database: string) {
  const configured = process.env.MYSQLDUMP_BIN?.trim();
  const candidates = configured ? [configured] : ["mysqldump", "mariadb-dump"];
  let missingCount = 0;
  for (const candidate of candidates) {
    try {
      await runDumpCommand(candidate, defaultsFile, database, outputPath);
      const info = await stat(outputPath);
      if (info.size < 20) throw new DatabaseBackupError("dump", "数据库导出结果为空，备份已停止");
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === "ENOENT") { missingCount += 1; continue; }
      const detail = error instanceof Error ? error.message.replace(/password\s*[:=]\s*\S+/gi, "password=[已脱敏]").slice(0, 600) : "未知错误";
      throw new DatabaseBackupError("dump", `数据库全量导出失败：${detail}`);
    }
  }
  if (missingCount === candidates.length) throw new DatabaseBackupError("dump", "服务器未安装mysqldump或mariadb-dump，无法生成可恢复的全量备份");
}

async function appendRestoreSafetyEpilogue(outputPath: string) {
  const sql = [
    "\n-- A restored backup cannot contain a genuinely running backup process.",
    "UPDATE `DatabaseBackupFile`",
    "SET `status` = 'FAILED', `activeLockKey` = NULL,",
    "    `completedAt` = COALESCE(`completedAt`, CURRENT_TIMESTAMP(3)),",
    "    `errorMessage` = COALESCE(`errorMessage`, '该运行记录来自数据库恢复，不代表当前服务器存在备份进程')",
    "WHERE `status` = 'RUNNING';",
    "",
  ].join("\n");
  await pipeline(Readable.from([sql]), createGzip({ level: 9 }), createWriteStream(outputPath, { flags: "a", mode: 0o600 }));
}

async function fileSha256(filePath: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

async function generateFullBackupFile(temporaryDirectory: string, fileName: string) {
  const defaultsFile = path.join(temporaryDirectory, "mysql-client.cnf");
  const dumpPath = path.join(temporaryDirectory, fileName);
  const connection = databaseConnection();
  const clientConfig = `[client]\nhost=${safeIniValue(connection.host)}\nport=${connection.port}\nuser=${safeIniValue(connection.user)}\npassword=${safeIniValue(connection.password)}\nprotocol=TCP\n`;
  await writeFile(defaultsFile, clientConfig, { encoding: "utf8", mode: 0o600 });
  await chmod(defaultsFile, 0o600);
  await createFullDump(dumpPath, defaultsFile, connection.database);
  await appendRestoreSafetyEpilogue(dumpPath);
  await rm(defaultsFile, { force: true });
  const [fileInfo, checksum] = await Promise.all([stat(dumpPath), fileSha256(dumpPath), verifyDumpIsReadable(dumpPath)]);
  return { dumpPath, sizeBytes: fileInfo.size, checksum };
}

async function verifyDumpIsReadable(filePath: string) {
  const markers = new Map([["CREATE DATABASE", false], ["CREATE TABLE", false], ["UPDATE `DatabaseBackupFile`", false]]);
  let carry = "";
  const input = createReadStream(filePath).pipe(createGunzip());
  for await (const chunk of input) {
    const text = carry + Buffer.from(chunk as Uint8Array).toString("utf8");
    for (const marker of markers.keys()) if (text.includes(marker)) markers.set(marker, true);
    carry = text.slice(-128);
  }
  if ([...markers.values()].some(found => !found)) throw new DatabaseBackupError("dump", "全量备份文件完整性检查失败，缺少必要的数据库结构语句");
}

/** Deployment check: creates and validates a complete local dump, but does not upload or retain it. */
export async function verifyDatabaseBackupEnvironment() {
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "canyin-db-backup-check-"));
  try {
    const result = await generateFullBackupFile(temporaryDirectory, "database-backup-check.sql.gz");
    return { sizeBytes: result.sizeBytes, checksumSha256: result.checksum };
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined);
  }
}

function r2Client(config: Awaited<ReturnType<typeof getEnabledR2Config>> | Awaited<ReturnType<typeof getR2ConfigForCleanup>>) {
  return new S3Client({
    region: "auto", endpoint: config.endpoint,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    maxAttempts: 3, requestChecksumCalculation: "WHEN_REQUIRED",
  });
}

async function uploadFullBackup(config: Awaited<ReturnType<typeof getEnabledR2Config>>, objectKey: string, fileName: string, filePath: string, sizeBytes: number, checksum: string) {
  const client = r2Client(config);
  try {
    const upload = new Upload({
      client,
      params: {
        Bucket: config.bucketName, Key: objectKey, Body: createReadStream(filePath), ContentLength: sizeBytes,
        ContentType: "application/gzip", ContentDisposition: `attachment; filename="${fileName}"`,
        Metadata: { "backup-format": "mysql-full-sql-gzip", "sha256": checksum },
      },
      queueSize: 4,
      partSize: 8 * 1024 * 1024,
      leavePartsOnError: false,
    });
    await upload.done();
    const uploaded = await client.send(new HeadObjectCommand({ Bucket: config.bucketName, Key: objectKey }));
    if (uploaded.ContentLength !== sizeBytes || uploaded.Metadata?.sha256 !== checksum) throw new Error("上传后的对象完整性校验失败");
  } catch (error) {
    await client.send(new DeleteObjectCommand({ Bucket: config.bucketName, Key: objectKey })).catch(() => undefined);
    const detail = error instanceof Error ? error.message.slice(0, 300) : "未知错误";
    throw new DatabaseBackupError("upload", `备份文件上传至R2失败：${detail}`);
  } finally {
    client.destroy();
  }
}

async function releaseUnusedFileReference(r2StorageId: string) {
  const retained = await db.databaseBackupFile.count({ where: { r2StorageId, status: { in: ["RUNNING", "SUCCESS"] } } });
  if (!retained) await db.r2StorageReference.deleteMany({ where: { businessType: STORAGE_FILES_REFERENCE, businessId: r2StorageId } });
}

async function failStaleRunningBackups(now = new Date()) {
  const staleBefore = new Date(now.getTime() - RUNNING_STALE_AFTER_MS);
  const stale = await db.databaseBackupFile.findMany({ where: { status: "RUNNING", startedAt: { lt: staleBefore } }, select: { id: true, r2StorageId: true } });
  if (!stale.length) return;
  await db.databaseBackupFile.updateMany({
    where: { id: { in: stale.map(item => item.id) }, status: "RUNNING" },
    data: { status: "FAILED", activeLockKey: null, completedAt: now, errorMessage: "备份进程异常中断，运行锁已自动释放" },
  });
  for (const storageId of new Set(stale.map(item => item.r2StorageId))) await releaseUnusedFileReference(storageId);
}

export async function executeDatabaseBackup(input: {
  r2StorageId: string;
  backupType: DatabaseBackupType;
  createdByUserId?: string | null;
  createdByName: string;
  scheduleKey?: string | null;
}) {
  const startedAt = new Date();
  await failStaleRunningBackups(startedAt);
  if (input.scheduleKey) {
    const existing = await db.databaseBackupFile.findUnique({ where: { scheduleKey: input.scheduleKey }, select: { id: true, status: true } });
    if (existing) throw new DatabaseBackupError("duplicate", "当前定时备份时点已经执行过");
  }
  const [config, storage] = await Promise.all([
    getEnabledR2Config(input.r2StorageId),
    db.r2StorageConfig.findFirst({ where: { id: input.r2StorageId, status: "ENABLED", deletedAt: null }, select: { id: true, name: true, bucketName: true } }),
  ]);
  if (!storage) throw new DatabaseBackupError("not-found", "所选R2存储桶不存在或已停用，请重新选择");

  const stamp = shanghaiParts(startedAt);
  const timestamp = `${stamp.year}${stamp.month}${stamp.day}_${stamp.hour}${stamp.minute}${stamp.second}`;
  const suffix = input.backupType === "MANUAL" ? "manual" : "scheduled";
  const fileName = `canyin_mysql_full_${timestamp}_${suffix}_${randomUUID().slice(0, 8)}.sql.gz`;
  const objectKey = `database-backups/${stamp.year}/${stamp.month}/${fileName}`;
  let record: Awaited<ReturnType<typeof db.databaseBackupFile.create>>;
  try {
    record = await db.$transaction(async tx => {
      const created = await tx.databaseBackupFile.create({ data: {
        fileName, r2StorageId: storage.id, r2StorageNameSnapshot: storage.name, bucketNameSnapshot: storage.bucketName,
        objectKey, backupType: input.backupType, status: "RUNNING", scheduleKey: input.scheduleKey ?? null,
        activeLockKey: ACTIVE_LOCK_KEY, createdByUserId: input.createdByUserId ?? null, createdByName: input.createdByName, startedAt,
      } });
      await tx.r2StorageReference.upsert({
        where: { businessType_businessId: { businessType: STORAGE_FILES_REFERENCE, businessId: storage.id } },
        create: { r2ConfigId: storage.id, businessType: STORAGE_FILES_REFERENCE, businessId: storage.id },
        update: { r2ConfigId: storage.id },
      });
      return created;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const scheduled = input.scheduleKey ? await db.databaseBackupFile.findUnique({ where: { scheduleKey: input.scheduleKey }, select: { id: true } }) : null;
      throw new DatabaseBackupError(scheduled ? "duplicate" : "busy", scheduled ? "当前定时备份时点已经执行过" : "已有数据库备份正在执行，请完成后再试");
    }
    throw error;
  }

  let temporaryDirectory: string | null = null;
  let uploaded = false;
  try {
    temporaryDirectory = await mkdtemp(path.join(tmpdir(), "canyin-db-backup-"));
    const dump = await generateFullBackupFile(temporaryDirectory, fileName);
    await uploadFullBackup(config, objectKey, fileName, dump.dumpPath, dump.sizeBytes, dump.checksum);
    uploaded = true;
    const completedAt = new Date();
    const updated = await db.databaseBackupFile.update({ where: { id: record.id }, data: {
      status: "SUCCESS", sizeBytes: BigInt(dump.sizeBytes), checksumSha256: dump.checksum,
      durationSeconds: Math.max(1, Math.ceil((completedAt.getTime() - startedAt.getTime()) / 1000)),
      completedAt, activeLockKey: null, errorMessage: null,
    } });
    return serializeDatabaseBackupFile(updated);
  } catch (error) {
    const committed = await db.databaseBackupFile.findUnique({ where: { id: record.id } }).catch(() => null);
    if (committed?.status === "SUCCESS") return serializeDatabaseBackupFile(committed);
    if (uploaded) {
      const client = r2Client(config);
      try { await client.send(new DeleteObjectCommand({ Bucket: config.bucketName, Key: objectKey })); } catch { /* A later delete can retry if the object remains. */ }
      finally { client.destroy(); }
    }
    const message = error instanceof DatabaseBackupError ? error.message : "数据库备份失败，请检查服务器日志后重试";
    await db.databaseBackupFile.update({ where: { id: record.id }, data: {
      status: "FAILED", completedAt: new Date(), activeLockKey: null, errorMessage: message.slice(0, 1000),
      durationSeconds: Math.max(1, Math.ceil((Date.now() - startedAt.getTime()) / 1000)),
    } }).catch(() => undefined);
    await releaseUnusedFileReference(input.r2StorageId).catch(() => undefined);
    throw error instanceof DatabaseBackupError ? error : new DatabaseBackupError("dump", message);
  } finally {
    if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function createDatabaseBackupDownloadUrl(id: string) {
  const row = await db.databaseBackupFile.findUnique({ where: { id } });
  if (!row) throw new DatabaseBackupError("not-found", "备份文件记录不存在或已删除");
  if (row.status !== "SUCCESS") throw new DatabaseBackupError("invalid", "只有备份成功的文件才可以下载");
  const config = await getR2ConfigForCleanup(row.r2StorageId);
  const client = r2Client(config);
  try {
    return await getSignedUrl(client, new GetObjectCommand({
      Bucket: config.bucketName, Key: row.objectKey, ResponseContentType: "application/gzip",
      ResponseContentDisposition: `attachment; filename="${row.fileName}"`,
    }), { expiresIn: Math.max(60, Math.min(config.signedUrlExpireSeconds, 600)) });
  } catch { throw new DatabaseBackupError("not-found", "备份文件暂时无法下载，请检查R2存储空间后重试"); }
  finally { client.destroy(); }
}

export async function deleteDatabaseBackups(ids: string[]) {
  const uniqueIds = [...new Set(ids)];
  const rows = await db.databaseBackupFile.findMany({ where: { id: { in: uniqueIds } } });
  if (rows.length !== uniqueIds.length) throw new DatabaseBackupError("not-found", "部分备份记录不存在，请刷新列表后重试");
  if (rows.some(row => row.status === "RUNNING")) throw new DatabaseBackupError("running", "正在执行的备份不能删除，请完成后再试");

  const successfulByStorage = new Map<string, typeof rows>();
  for (const row of rows.filter(item => item.status === "SUCCESS")) {
    successfulByStorage.set(row.r2StorageId, [...(successfulByStorage.get(row.r2StorageId) || []), row]);
  }
  for (const [storageId, storageRows] of successfulByStorage) {
    const config = await getR2ConfigForCleanup(storageId);
    const client = r2Client(config);
    try {
      for (let offset = 0; offset < storageRows.length; offset += 1000) {
        const response = await client.send(new DeleteObjectsCommand({
          Bucket: config.bucketName,
          Delete: { Objects: storageRows.slice(offset, offset + 1000).map(row => ({ Key: row.objectKey })), Quiet: true },
        }));
        if (response.Errors?.length) throw new Error("R2返回了对象删除失败结果");
      }
    } catch { throw new DatabaseBackupError("upload", "部分备份文件未能从R2删除，请检查存储空间连接后重试"); }
    finally { client.destroy(); }
  }
  await db.databaseBackupFile.deleteMany({ where: { id: { in: uniqueIds } } });
  for (const storageId of new Set(rows.map(row => row.r2StorageId))) await releaseUnusedFileReference(storageId);
  return { deleted: rows.length };
}

export async function runDueDatabaseBackups(now = new Date()) {
  await failStaleRunningBackups(now);
  const setting = await getDatabaseBackupSetting();
  if (!setting?.enabled) return { status: "disabled" as const };
  const parts = shanghaiParts(now);
  const currentTime = `${parts.hour}:${parts.minute}`;
  const times = stringArray(setting.executionTimes);
  if (!times.includes(currentTime)) return { status: "not-due" as const, currentTime };
  if (setting.frequency === "WEEKLY" && !numberArray(setting.weekdays).includes(parts.weekday)) return { status: "not-due" as const, currentTime };
  const scheduleKey = `${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}`;
  try {
    const result = await executeDatabaseBackup({ r2StorageId: setting.r2StorageId, backupType: "SCHEDULED", createdByName: "系统", scheduleKey });
    await writeOperationLog({ username: "系统", page: "数据库备份", action: "定时备份", result: "成功", detail: `全量备份：${result.fileName}；大小：${result.sizeBytes}字节；SHA-256：${result.checksumSha256}` }).catch(() => undefined);
    return { status: "completed" as const, fileName: result.fileName, sizeBytes: result.sizeBytes };
  } catch (error) {
    if (error instanceof DatabaseBackupError && error.code === "duplicate") return { status: "already-completed" as const, scheduleKey };
    if (error instanceof DatabaseBackupError && error.code === "busy") return { status: "already-running" as const, scheduleKey };
    await writeOperationLog({ username: "系统", page: "数据库备份", action: "定时备份", result: "失败", detail: error instanceof Error ? error.message : "数据库定时备份失败" }).catch(() => undefined);
    throw error;
  }
}

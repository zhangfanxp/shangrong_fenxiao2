import { Prisma, RecordStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { decryptR2Credential, encryptR2Credential, maskAccessKey } from "@/lib/r2-crypto";
import { readR2ConfigDocument, R2ConfigFileError, type R2ConfigFileEntry, writeR2ConfigDocument } from "@/lib/r2-config-file";
import type { CreateR2Input, EditR2Input } from "@/lib/r2-validation";

type R2Row = Prisma.R2StorageConfigGetPayload<{ include: { createdBy: { select: { realName: true } }, _count: { select: { references: true } } } }>;

let mutationQueue = Promise.resolve();
async function withMutationLock<T>(operation: () => Promise<T>) {
  const previous = mutationQueue;
  let release: () => void = () => {};
  mutationQueue = new Promise<void>(resolve => { release = resolve; });
  await previous;
  try { return await operation(); } finally { release(); }
}

export class R2ConfigError extends Error {
  constructor(public readonly code: "duplicate" | "not-found" | "conflict" | "referenced" | "incomplete" | "file", message: string) { super(message); }
}

const include = { createdBy: { select: { realName: true } }, _count: { select: { references: true } } } as const;

function shanghaiDatePrefix() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: string) => parts.find(item => item.type === type)?.value || "";
  return `${part("year")}${part("month")}${part("day")}`;
}

async function nextRecordNo() {
  const prefix = shanghaiDatePrefix();
  const last = await db.r2StorageConfig.findFirst({ where: { recordNo: { startsWith: prefix } }, select: { recordNo: true }, orderBy: { recordNo: "desc" } });
  const next = last ? Number(last.recordNo.slice(8)) + 1 : 1;
  if (next > 9999) throw new R2ConfigError("conflict", "当日R2存储空间记录已达上限，请联系系统管理员");
  return `${prefix}${String(next).padStart(4, "0")}`;
}

function toFileEntry(row: R2Row): R2ConfigFileEntry {
  return {
    id: row.id, recordNo: row.recordNo, name: row.name, accountId: row.accountId,
    accessKeyId: row.accessKeyIdEncrypted, secretAccessKey: row.secretAccessKeyEncrypted,
    bucketName: row.bucketName, endpoint: row.endpoint, signedUrlExpireSeconds: row.signedUrlExpireSeconds,
    status: row.status, createdBy: row.createdBy?.realName || "系统",
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), version: row.version,
  };
}

function fileError(error: unknown): never {
  if (error instanceof R2ConfigFileError) throw new R2ConfigError("file", error.message);
  throw error;
}

async function currentDocument() {
  const count = await db.r2StorageConfig.count({ where: { deletedAt: null } });
  try { return await readR2ConfigDocument(count); } catch (error) { return fileError(error); }
}

export async function assertR2ConfigFileHealthy() { await currentDocument(); }

export function publicR2Detail(row: R2Row) {
  let accessKeyIdMasked = "已配置";
  try { accessKeyIdMasked = maskAccessKey(decryptR2Credential(row.accessKeyIdEncrypted)); } catch { /* Never expose a decryption error or encrypted value. */ }
  const { accessKeyIdEncrypted: _accessKeyIdEncrypted, secretAccessKeyEncrypted: _secretAccessKeyEncrypted, ...safe } = row;
  return { ...safe, accessKeyIdMasked, secretAccessKeyMasked: "••••••••••••••••", credentialsConfigured: Boolean(_accessKeyIdEncrypted && _secretAccessKeyEncrypted) };
}

export async function createR2Config(input: CreateR2Input, userId: string) {
  return withMutationLock(async () => {
    const document = await currentDocument();
    const duplicate = await db.r2StorageConfig.findFirst({ where: { accountId: input.accountId, bucketName: input.bucketName, deletedAt: null }, select: { id: true } });
    if (duplicate) throw new R2ConfigError("duplicate", "该R2存储桶配置已存在，请勿重复添加");
    const encryptedAccessKey = encryptR2Credential(input.accessKeyId);
    const encryptedSecret = encryptR2Credential(input.secretAccessKey);
    let created: R2Row | undefined;
    for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
      try {
        created = await db.r2StorageConfig.create({ data: {
          recordNo: await nextRecordNo(), name: input.name, accountId: input.accountId,
          accessKeyIdEncrypted: encryptedAccessKey, secretAccessKeyEncrypted: encryptedSecret,
          bucketName: input.bucketName, endpoint: input.endpoint,
          signedUrlExpireSeconds: input.signedUrlExpireSeconds, status: input.status, createdByUserId: userId,
        }, include });
      } catch (error) {
        if ((error as { code?: string }).code !== "P2002") throw error;
      }
    }
    if (!created) throw new R2ConfigError("conflict", "记录编号生成失败，请稍后重试");
    try { await writeR2ConfigDocument({ buckets: [...document.buckets, toFileEntry(created)] }); }
    catch (error) { await db.r2StorageConfig.delete({ where: { id: created.id } }).catch(() => undefined); return fileError(error); }
    return created;
  });
}

export async function updateR2Config(id: string, input: EditR2Input) {
  return withMutationLock(async () => {
    const document = await currentDocument();
    const current = await db.r2StorageConfig.findFirst({ where: { id, deletedAt: null }, include });
    if (!current) throw new R2ConfigError("not-found", "R2存储空间不存在或已删除");
    if (current.updatedAt.getTime() !== new Date(input.updatedAt).getTime()) throw new R2ConfigError("conflict", "当前R2存储配置已被其他用户修改，请刷新后重新操作");
    if (!document.buckets.some(bucket => bucket.id === id)) throw new R2ConfigError("file", "R2配置文件与数据库记录不一致，请联系系统管理员处理");
    const duplicate = await db.r2StorageConfig.findFirst({ where: { id: { not: id }, accountId: input.accountId, bucketName: input.bucketName, deletedAt: null }, select: { id: true } });
    if (duplicate) throw new R2ConfigError("duplicate", "该R2存储桶配置已存在，请勿重复添加");
    const updatedCount = await db.r2StorageConfig.updateMany({ where: { id, deletedAt: null, updatedAt: current.updatedAt }, data: {
      name: input.name, accountId: input.accountId, bucketName: input.bucketName, endpoint: input.endpoint,
      signedUrlExpireSeconds: input.signedUrlExpireSeconds, status: input.status, version: { increment: 1 },
      ...(input.accessKeyId ? { accessKeyIdEncrypted: encryptR2Credential(input.accessKeyId) } : {}),
      ...(input.secretAccessKey ? { secretAccessKeyEncrypted: encryptR2Credential(input.secretAccessKey) } : {}),
    } });
    if (!updatedCount.count) throw new R2ConfigError("conflict", "当前R2存储配置已被其他用户修改，请刷新后重新操作");
    const updated = await db.r2StorageConfig.findUniqueOrThrow({ where: { id }, include });
    try { await writeR2ConfigDocument({ buckets: document.buckets.map(bucket => bucket.id === id ? toFileEntry(updated) : bucket) }); }
    catch (error) {
      await db.r2StorageConfig.update({ where: { id }, data: {
        name: current.name, accountId: current.accountId, accessKeyIdEncrypted: current.accessKeyIdEncrypted,
        secretAccessKeyEncrypted: current.secretAccessKeyEncrypted, bucketName: current.bucketName,
        endpoint: current.endpoint, signedUrlExpireSeconds: current.signedUrlExpireSeconds,
        status: current.status, version: current.version, updatedAt: current.updatedAt,
      } }).catch(() => undefined);
      return fileError(error);
    }
    return updated;
  });
}

export async function changeR2Status(id: string, status: RecordStatus, updatedAt: string) {
  return withMutationLock(async () => {
    const document = await currentDocument();
    const current = await db.r2StorageConfig.findFirst({ where: { id, deletedAt: null }, include });
    if (!current) throw new R2ConfigError("not-found", "R2存储空间不存在或已删除");
    if (current.updatedAt.getTime() !== new Date(updatedAt).getTime()) throw new R2ConfigError("conflict", "当前R2存储配置已被其他用户修改，请刷新后重新操作");
    if (!document.buckets.some(bucket => bucket.id === id)) throw new R2ConfigError("file", "R2配置文件与数据库记录不一致，请联系系统管理员处理");
    if (status === RecordStatus.ENABLED && (!current.accountId || !current.accessKeyIdEncrypted || !current.secretAccessKeyEncrypted || !current.bucketName || !current.endpoint || current.signedUrlExpireSeconds < 1 || current.signedUrlExpireSeconds > 604800)) throw new R2ConfigError("incomplete", "当前R2配置不完整，请完善配置后再启用");
    const result = await db.r2StorageConfig.updateMany({ where: { id, deletedAt: null, updatedAt: current.updatedAt }, data: { status, version: { increment: 1 } } });
    if (!result.count) throw new R2ConfigError("conflict", "当前R2存储配置已被其他用户修改，请刷新后重新操作");
    const updated = await db.r2StorageConfig.findUniqueOrThrow({ where: { id }, include });
    try { await writeR2ConfigDocument({ buckets: document.buckets.map(bucket => bucket.id === id ? toFileEntry(updated) : bucket) }); }
    catch (error) { await db.r2StorageConfig.update({ where: { id }, data: { status: current.status, version: current.version, updatedAt: current.updatedAt } }).catch(() => undefined); return fileError(error); }
    return updated;
  });
}

export async function deleteR2Config(id: string, updatedAt: string) {
  return withMutationLock(async () => {
    const document = await currentDocument();
    const current = await db.r2StorageConfig.findFirst({ where: { id, deletedAt: null }, include });
    if (!current) throw new R2ConfigError("not-found", "R2存储空间不存在或已删除");
    if (current.updatedAt.getTime() !== new Date(updatedAt).getTime()) throw new R2ConfigError("conflict", "当前R2存储配置已被其他用户修改，请刷新后重新操作");
    if (current._count.references > 0) throw new R2ConfigError("referenced", "该R2存储空间正在被系统业务使用，暂不能删除，请先调整相关业务配置或使用“禁用”操作。");
    if (!document.buckets.some(bucket => bucket.id === id)) throw new R2ConfigError("file", "R2配置文件与数据库记录不一致，请联系系统管理员处理");
    const deletedAt = new Date();
    const result = await db.r2StorageConfig.updateMany({ where: { id, deletedAt: null, updatedAt: current.updatedAt }, data: { deletedAt, version: { increment: 1 } } });
    if (!result.count) throw new R2ConfigError("conflict", "当前R2存储配置已被其他用户修改，请刷新后重新操作");
    try { await writeR2ConfigDocument({ buckets: document.buckets.filter(bucket => bucket.id !== id) }); }
    catch (error) { await db.r2StorageConfig.update({ where: { id }, data: { deletedAt: null, version: current.version, updatedAt: current.updatedAt } }).catch(() => undefined); return fileError(error); }
  });
}

export async function getEnabledR2Config(id: string) {
  const row = await db.r2StorageConfig.findFirst({ where: { id, deletedAt: null, status: RecordStatus.ENABLED }, include });
  if (!row) throw new R2ConfigError("not-found", "指定的R2存储空间不可用");
  const document = await currentDocument();
  const fileEntry = document.buckets.find(bucket => bucket.id === id && bucket.status === "ENABLED");
  if (!fileEntry) throw new R2ConfigError("file", "R2配置文件与数据库记录不一致，请联系系统管理员处理");
  return {
    id: row.id, accountId: row.accountId, bucketName: row.bucketName, endpoint: row.endpoint,
    accessKeyId: decryptR2Credential(row.accessKeyIdEncrypted), secretAccessKey: decryptR2Credential(row.secretAccessKeyEncrypted),
    signedUrlExpireSeconds: row.signedUrlExpireSeconds,
  };
}

import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { R2TestStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { getEnabledR2Config, R2ConfigError } from "@/lib/r2-config-service";

export class R2StorageTestError extends Error {
  constructor(public readonly code: "disabled" | "limit" | "credentials" | "bucket" | "network" | "upload" | "read", message: string) { super(message); }
}

function shanghaiDatePrefix() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: string) => parts.find(item => item.type === type)?.value || "";
  return `${part("year")}${part("month")}${part("day")}`;
}

async function reserveFileName(r2ConfigId: string, createdByUserId: string) {
  const prefix = shanghaiDatePrefix();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const last = await db.r2StorageTest.findFirst({ where: { r2ConfigId, fileName: { startsWith: prefix } }, select: { fileName: true }, orderBy: { fileName: "desc" } });
    const sequence = last ? Number(last.fileName.slice(8, 11)) + 1 : 1;
    if (sequence > 999) throw new R2StorageTestError("limit", "当前R2存储空间今日测试文件已达到999个，请明日再试");
    const fileName = `${prefix}${String(sequence).padStart(3, "0")}.txt`;
    try {
      return await db.r2StorageTest.create({ data: { r2ConfigId, fileName, createdByUserId }, select: { id: true, fileName: true } });
    } catch (error) {
      if ((error as { code?: string }).code !== "P2002") throw error;
    }
  }
  throw new R2StorageTestError("upload", "测试文件编号生成失败，请稍后重试");
}

function errorIdentity(error: unknown) {
  const value = error as { name?: string; code?: string; $metadata?: { httpStatusCode?: number } };
  return { name: value?.name || value?.code || "Unknown", status: value?.$metadata?.httpStatusCode };
}

function isExistingObject(error: unknown) {
  const identity = errorIdentity(error);
  return identity.status === 412 || ["PreconditionFailed", "ConditionalRequestConflict"].includes(identity.name);
}

function safeUploadError(error: unknown) {
  if (error instanceof R2StorageTestError) return error;
  const identity = errorIdentity(error);
  if (["InvalidAccessKeyId", "SignatureDoesNotMatch", "AccessDenied", "InvalidToken"].includes(identity.name) || identity.status === 401 || identity.status === 403) return new R2StorageTestError("credentials", "R2测试失败：访问凭证无效或没有对象读写权限");
  if (identity.name === "NoSuchKey") return new R2StorageTestError("read", "R2测试文件写入后无法读取，请检查对象读取权限");
  if (["NoSuchBucket", "InvalidBucketName"].includes(identity.name) || identity.status === 404) return new R2StorageTestError("bucket", "R2测试失败：未找到配置的存储桶，请检查bucketName");
  if (["AbortError", "TimeoutError", "NetworkingError"].includes(identity.name)) return new R2StorageTestError("network", "R2测试失败：无法连接endpoint，请检查网络或endpoint配置");
  return new R2StorageTestError("upload", "R2测试文件上传失败，请检查当前R2配置后重试");
}

async function writeAndReadTestObject(config: Awaited<ReturnType<typeof getEnabledR2Config>>, fileName: string) {
  const client = new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    maxAttempts: 2,
  });
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), 20_000);
  try {
    await client.send(new PutObjectCommand({
      Bucket: config.bucketName,
      Key: fileName,
      Body: Buffer.from("test", "utf8"),
      ContentType: "text/plain; charset=utf-8",
      ContentLength: 4,
      IfNoneMatch: "*",
    }), { abortSignal: abortController.signal });
    const downloaded = await client.send(new GetObjectCommand({ Bucket: config.bucketName, Key: fileName }), { abortSignal: abortController.signal });
    if (!downloaded.Body) throw new R2StorageTestError("read", "R2测试文件写入成功，但未能读取文件内容");
    const content = await downloaded.Body.transformToString("utf-8");
    if (content !== "test") throw new R2StorageTestError("read", "R2测试文件可以读取，但读取内容与写入内容不一致");
  } finally {
    clearTimeout(timeout);
    client.destroy();
  }
}

export async function testR2Storage(r2ConfigId: string, userId: string) {
  let config: Awaited<ReturnType<typeof getEnabledR2Config>>;
  try { config = await getEnabledR2Config(r2ConfigId); }
  catch (error) {
    if (error instanceof R2ConfigError && error.code === "not-found") throw new R2StorageTestError("disabled", "当前R2存储空间已禁用或不存在，无法执行测试");
    throw error;
  }

  for (let collisionAttempt = 0; collisionAttempt < 20; collisionAttempt += 1) {
    const test = await reserveFileName(r2ConfigId, userId);
    try {
      await writeAndReadTestObject(config, test.fileName);
      await db.r2StorageTest.update({ where: { id: test.id }, data: { status: R2TestStatus.SUCCESS, completedAt: new Date() } });
      return { fileName: test.fileName };
    } catch (error) {
      if (isExistingObject(error)) {
        await db.r2StorageTest.update({ where: { id: test.id }, data: { status: R2TestStatus.FAILED, errorCode: "OBJECT_EXISTS", completedAt: new Date() } }).catch(() => undefined);
        continue;
      }
      const safe = safeUploadError(error);
      await db.r2StorageTest.update({ where: { id: test.id }, data: { status: R2TestStatus.FAILED, errorCode: safe.code.toUpperCase(), completedAt: new Date() } }).catch(() => undefined);
      throw safe;
    }
  }
  throw new R2StorageTestError("upload", "R2中存在过多同名测试文件，请稍后重试");
}

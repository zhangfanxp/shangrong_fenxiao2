import { DeleteObjectCommand, DeleteObjectsCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getEnabledR2Config, getR2ConfigForCleanup, R2ConfigError } from "@/lib/r2-config-service";
import { taskAttachmentMaxBytes, taskAttachmentMaxMb } from "@/lib/task-attachment-rules";

export type IncomingTaskFile = { name: string; type: string; size: number; dataUrl: string };
export type UploadedTaskFile = { name: string; type: string; size: number; objectKey: string; bucketName: string; r2StorageId: string };

export class TaskAttachmentError extends Error {}

function decodeFile(file: IncomingTaskFile, dataType: "photo" | "video" | "document") {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(file.dataUrl);
  if (!match) throw new TaskAttachmentError(`附件“${file.name}”数据格式不正确`);
  const mimeType = match[1].toLowerCase();
  if (mimeType !== file.type.toLowerCase()) throw new TaskAttachmentError(`附件“${file.name}”类型校验失败`);
  if (dataType === "photo" && !mimeType.startsWith("image/")) throw new TaskAttachmentError(`附件“${file.name}”必须为照片`);
  if (dataType === "video" && !mimeType.startsWith("video/")) throw new TaskAttachmentError(`附件“${file.name}”必须为视频`);
  if (dataType === "document" && !mimeType.startsWith("application/") && !mimeType.startsWith("text/")) throw new TaskAttachmentError(`附件“${file.name}”必须为文档`);
  const body = Buffer.from(match[2].replace(/[\r\n]/g, ""), "base64");
  const maxBytes = taskAttachmentMaxBytes(dataType);
  if (!body.length || body.length > maxBytes) throw new TaskAttachmentError(`附件“${file.name}”不能超过${taskAttachmentMaxMb(dataType)}MB`);
  return { body, mimeType };
}

function safeName(value: string) {
  const normalized = value.normalize("NFKC").replace(/[\\/\0\r\n]/g, "_").replace(/\s+/g, "_");
  return (normalized || "attachment").slice(-100);
}

function shanghaiDatePrefix() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: string) => parts.find(item => item.type === type)?.value || "";
  return `${part("year")}${part("month")}${part("day")}`;
}

function clientFor(config: Awaited<ReturnType<typeof getEnabledR2Config>>) {
  return new S3Client({ region: "auto", endpoint: config.endpoint, credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }, maxAttempts: 2, requestChecksumCalculation: "WHEN_REQUIRED" });
}

function validateBinaryFile(file: { name: string; type: string; size: number; body: Buffer }, dataType: "photo" | "video" | "document") {
  const mimeType = file.type.toLowerCase();
  if (dataType === "photo" && !mimeType.startsWith("image/")) throw new TaskAttachmentError(`附件“${file.name}”必须为照片`);
  if (dataType === "video" && !mimeType.startsWith("video/")) throw new TaskAttachmentError(`附件“${file.name}”必须为视频`);
  if (dataType === "document" && !mimeType.startsWith("application/") && !mimeType.startsWith("text/")) throw new TaskAttachmentError(`附件“${file.name}”必须为文档`);
  const maxBytes = taskAttachmentMaxBytes(dataType);
  if (!file.body.length || file.body.length !== file.size || file.body.length > maxBytes) throw new TaskAttachmentError(`附件“${file.name}”不能超过${taskAttachmentMaxMb(dataType)}MB`);
  return mimeType;
}

export function validateStoreTaskFileMetadata(file: { name: string; type: string; size: number }, dataType: "photo" | "video" | "document") {
  const name = safeName(file.name);
  const mimeType = file.type.toLowerCase().split(";", 1)[0];
  if (dataType === "photo" && !mimeType.startsWith("image/")) throw new TaskAttachmentError(`附件“${name}”必须为照片`);
  if (dataType === "video" && !mimeType.startsWith("video/")) throw new TaskAttachmentError(`附件“${name}”必须为视频`);
  if (dataType === "document" && !mimeType.startsWith("application/") && !mimeType.startsWith("text/")) throw new TaskAttachmentError(`附件“${name}”必须为文档`);
  const maxBytes = taskAttachmentMaxBytes(dataType);
  if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > maxBytes) throw new TaskAttachmentError(`附件“${name}”不能超过${taskAttachmentMaxMb(dataType)}MB`);
  return { name, mimeType, size: file.size };
}

export async function createStoreTaskDirectUpload(input: {
  r2StorageId: string;
  taskRecordNo: string;
  itemIndex: number;
  dataType: "photo" | "video" | "document";
  file: { name: string; type: string; size: number };
}) {
  const metadata = validateStoreTaskFileMetadata(input.file, input.dataType);
  let config: Awaited<ReturnType<typeof getEnabledR2Config>>;
  try { config = await getEnabledR2Config(input.r2StorageId); }
  catch (error) {
    if (error instanceof R2ConfigError) throw new TaskAttachmentError(error.message);
    throw new TaskAttachmentError("任务存储空间不可用，请联系系统管理员");
  }
  const objectKey = `tasks/${shanghaiDatePrefix()}/${input.taskRecordNo}/${input.itemIndex + 1}/${crypto.randomUUID()}-${metadata.name}`;
  const expiresIn = Math.max(1, Math.min(config.signedUrlExpireSeconds, 300));
  const client = clientFor(config);
  try {
    const uploadUrl = await getSignedUrl(client, new PutObjectCommand({
      Bucket: config.bucketName, Key: objectKey, ContentType: metadata.mimeType, IfNoneMatch: "*",
    }), { expiresIn });
    return { uploadUrl, objectKey, expiresIn, r2StorageId: input.r2StorageId, bucketName: config.bucketName, ...metadata };
  } catch {
    throw new TaskAttachmentError("生成R2直传地址失败，请稍后重试");
  } finally {
    client.destroy();
  }
}

export async function createLeadH5ReviewPhotoDirectUpload(input: {
  r2StorageId: string;
  storeId: string;
  reviewType: string;
  itemKey: string;
  file: { name: string; type: string; size: number };
}) {
  const metadata = validateStoreTaskFileMetadata(input.file, "photo");
  let config: Awaited<ReturnType<typeof getEnabledR2Config>>;
  try { config = await getEnabledR2Config(input.r2StorageId); }
  catch (error) {
    if (error instanceof R2ConfigError) throw new TaskAttachmentError(error.message);
    throw new TaskAttachmentError("巡店照片存储空间不可用，请联系系统管理员");
  }
  const safeSegment = (value: string) => value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 100) || "unknown";
  const objectKey = `lead-h5-reviews/${shanghaiDatePrefix()}/${safeSegment(input.storeId)}/${safeSegment(input.reviewType)}/${safeSegment(input.itemKey)}/${crypto.randomUUID()}-${metadata.name}`;
  const expiresIn = Math.max(1, Math.min(config.signedUrlExpireSeconds, 300));
  const client = clientFor(config);
  try {
    const uploadUrl = await getSignedUrl(client, new PutObjectCommand({
      Bucket: config.bucketName, Key: objectKey, ContentType: metadata.mimeType, IfNoneMatch: "*",
    }), { expiresIn });
    return { uploadUrl, objectKey, expiresIn, r2StorageId: input.r2StorageId, bucketName: config.bucketName, ...metadata };
  } catch {
    throw new TaskAttachmentError("生成巡店照片直传地址失败，请稍后重试");
  } finally { client.destroy(); }
}

export async function verifyStoreTaskDirectUpload(input: {
  r2StorageId: string;
  objectKey: string;
  expectedSize: number;
  expectedMimeType: string;
  etag?: string | null;
}) {
  let config: Awaited<ReturnType<typeof getEnabledR2Config>>;
  try { config = await getEnabledR2Config(input.r2StorageId); }
  catch (error) {
    if (error instanceof R2ConfigError) throw new TaskAttachmentError(error.message);
    throw new TaskAttachmentError("任务存储空间不可用，请联系系统管理员");
  }
  const client = clientFor(config);
  try {
    const head = await client.send(new HeadObjectCommand({ Bucket: config.bucketName, Key: input.objectKey }));
    const actualType = (head.ContentType || "").toLowerCase().split(";", 1)[0];
    if (head.ContentLength !== input.expectedSize || actualType !== input.expectedMimeType) throw new TaskAttachmentError("R2附件校验失败，请重新上传");
    const expectedEtag = input.etag?.replaceAll('"', "").trim();
    const actualEtag = head.ETag?.replaceAll('"', "").trim();
    if (expectedEtag && actualEtag && expectedEtag !== actualEtag) throw new TaskAttachmentError("R2附件完整性校验失败，请重新上传");
    return { size: head.ContentLength, mimeType: actualType, etag: actualEtag || null };
  } catch (error) {
    if (error instanceof TaskAttachmentError) throw error;
    throw new TaskAttachmentError("未能确认R2附件上传结果，请重新上传");
  } finally {
    client.destroy();
  }
}

export async function deleteUploadedTaskFiles(r2StorageId: string, files: UploadedTaskFile[]) {
  if (!files.length) return;
  try {
    const config = await getEnabledR2Config(r2StorageId); const client = clientFor(config);
    try { await Promise.all(files.map(file => client.send(new DeleteObjectCommand({ Bucket: config.bucketName, Key: file.objectKey })).catch(() => undefined))); }
    finally { client.destroy(); }
  } catch { /* Best-effort compensation; never expose credentials or endpoint details. */ }
}

export async function deleteTaskDraftFiles(files: { r2StorageId: string; objectKey: string }[]) {
  const groups = new Map<string, string[]>();
  files.forEach(file => groups.set(file.r2StorageId, [...(groups.get(file.r2StorageId) || []), file.objectKey]));
  for (const [r2StorageId, objectKeys] of groups) {
    let config: Awaited<ReturnType<typeof getR2ConfigForCleanup>>;
    try { config = await getR2ConfigForCleanup(r2StorageId); }
    catch (error) { throw new TaskAttachmentError(error instanceof R2ConfigError ? error.message : "原附件存储空间不可用，无法完成覆盖清理"); }
    const client = clientFor(config);
    try {
      for (let index = 0; index < objectKeys.length; index += 1000) {
        const response = await client.send(new DeleteObjectsCommand({ Bucket: config.bucketName, Delete: { Objects: objectKeys.slice(index, index + 1000).map(Key => ({ Key })), Quiet: true } }));
        if (response.Errors?.length) throw new TaskAttachmentError("部分临时附件清理失败，请稍后重试更新任务");
      }
    } catch (error) {
      if (error instanceof TaskAttachmentError) throw error;
      throw new TaskAttachmentError("临时附件清理失败，请检查R2存储空间后重试");
    } finally { client.destroy(); }
  }
}

export async function createTaskAttachmentReadUrl(input: { r2StorageId: string; objectKey: string }) {
  let config: Awaited<ReturnType<typeof getR2ConfigForCleanup>>;
  try { config = await getR2ConfigForCleanup(input.r2StorageId); }
  catch (error) {
    if (error instanceof R2ConfigError) throw new TaskAttachmentError(error.message);
    throw new TaskAttachmentError("附件存储空间不可用，请联系系统管理员");
  }
  const client = clientFor(config);
  try {
    return await getSignedUrl(client, new GetObjectCommand({ Bucket: config.bucketName, Key: input.objectKey }), {
      expiresIn: Math.max(1, Math.min(config.signedUrlExpireSeconds, 3600)),
    });
  } catch {
    throw new TaskAttachmentError("附件访问地址生成失败，请稍后重试");
  } finally {
    client.destroy();
  }
}

export async function uploadTaskFiles(input: { r2StorageId: string; taskRecordNo: string; entries: { itemIndex: number; dataType: "photo" | "video" | "document"; file: IncomingTaskFile }[] }) {
  let config: Awaited<ReturnType<typeof getEnabledR2Config>>;
  try { config = await getEnabledR2Config(input.r2StorageId); }
  catch (error) {
    if (error instanceof R2ConfigError) throw new TaskAttachmentError(error.message);
    throw new TaskAttachmentError("任务存储空间不可用，请联系系统管理员");
  }
  const client = clientFor(config); const uploaded: (UploadedTaskFile & { itemIndex: number })[] = [];
  try {
    for (const entry of input.entries) {
      const { body, mimeType } = decodeFile(entry.file, entry.dataType);
      const objectKey = `tasks/${shanghaiDatePrefix()}/${input.taskRecordNo}/${entry.itemIndex + 1}/${crypto.randomUUID()}-${safeName(entry.file.name)}`;
      await client.send(new PutObjectCommand({ Bucket: config.bucketName, Key: objectKey, Body: body, ContentType: mimeType, ContentLength: body.length }));
      uploaded.push({ itemIndex: entry.itemIndex, name: entry.file.name, type: mimeType, size: body.length, objectKey, bucketName: config.bucketName, r2StorageId: input.r2StorageId });
    }
    return uploaded;
  } catch (error) {
    await Promise.all(uploaded.map(file => client.send(new DeleteObjectCommand({ Bucket: config.bucketName, Key: file.objectKey })).catch(() => undefined)));
    if (error instanceof TaskAttachmentError) throw error;
    throw new TaskAttachmentError("附件上传至R2存储空间失败，请稍后重试");
  } finally { client.destroy(); }
}

export async function uploadStoreTaskFile(input: {
  r2StorageId: string;
  taskRecordNo: string;
  itemIndex: number;
  dataType: "photo" | "video" | "document";
  file: { name: string; type: string; size: number; body: Buffer };
}) {
  let config: Awaited<ReturnType<typeof getEnabledR2Config>>;
  try { config = await getEnabledR2Config(input.r2StorageId); }
  catch (error) {
    if (error instanceof R2ConfigError) throw new TaskAttachmentError(error.message);
    throw new TaskAttachmentError("任务存储空间不可用，请联系系统管理员");
  }
  const mimeType = validateBinaryFile(input.file, input.dataType);
  const objectKey = `tasks/${shanghaiDatePrefix()}/${input.taskRecordNo}/${input.itemIndex + 1}/${crypto.randomUUID()}-${safeName(input.file.name)}`;
  const client = clientFor(config);
  try {
    await client.send(new PutObjectCommand({ Bucket: config.bucketName, Key: objectKey, Body: input.file.body, ContentType: mimeType, ContentLength: input.file.body.length }));
    return { name: input.file.name, type: mimeType, size: input.file.body.length, objectKey, bucketName: config.bucketName, r2StorageId: input.r2StorageId } satisfies UploadedTaskFile;
  } catch {
    throw new TaskAttachmentError("附件上传至R2存储空间失败，请稍后重试");
  } finally {
    client.destroy();
  }
}

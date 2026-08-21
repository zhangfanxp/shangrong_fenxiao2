import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getEnabledR2Config, R2ConfigError } from "@/lib/r2-config-service";

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
  const maxBytes = (dataType === "photo" ? 10 : 20) * 1024 * 1024;
  if (!body.length || body.length > maxBytes) throw new TaskAttachmentError(`附件“${file.name}”大小不符合要求`);
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
  return new S3Client({ region: "auto", endpoint: config.endpoint, credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }, maxAttempts: 2 });
}

export async function deleteUploadedTaskFiles(r2StorageId: string, files: UploadedTaskFile[]) {
  if (!files.length) return;
  try {
    const config = await getEnabledR2Config(r2StorageId); const client = clientFor(config);
    try { await Promise.all(files.map(file => client.send(new DeleteObjectCommand({ Bucket: config.bucketName, Key: file.objectKey })).catch(() => undefined))); }
    finally { client.destroy(); }
  } catch { /* Best-effort compensation; never expose credentials or endpoint details. */ }
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

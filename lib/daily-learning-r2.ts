import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "@/lib/db";
import { getPlatformConfig } from "@/lib/platform-config";
import { getEnabledR2Config, getR2ConfigForCleanup, R2ConfigError } from "@/lib/r2-config-service";

const MAX_RECORDING_BYTES = 20 * 1024 * 1024;
const acceptedMimeTypes = new Set(["audio/webm", "audio/mp4", "audio/ogg", "audio/mpeg", "audio/wav", "audio/x-m4a"]);

export class DailyLearningRecordingError extends Error {}

function clientFor(config: Awaited<ReturnType<typeof getEnabledR2Config>>) {
  return new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    maxAttempts: 2,
    requestChecksumCalculation: "WHEN_REQUIRED",
  });
}

function safeName(value: string) {
  const normalized = value.normalize("NFKC").replace(/[\\/\0\r\n]/g, "_").replace(/\s+/g, "_");
  return (normalized || "recording.webm").slice(-120);
}

function extensionFor(mimeType: string) {
  return ({
    "audio/webm": "webm",
    "audio/mp4": "m4a",
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/x-m4a": "m4a",
  } as Record<string, string>)[mimeType] || "audio";
}

export function validateDailyLearningRecording(file: { name: string; type: string; size: number }) {
  const name = safeName(file.name);
  const mimeType = file.type.toLowerCase().split(";", 1)[0];
  if (!acceptedMimeTypes.has(mimeType)) throw new DailyLearningRecordingError("当前浏览器生成的录音格式暂不支持，请更换浏览器后重试");
  if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > MAX_RECORDING_BYTES) throw new DailyLearningRecordingError("录音文件大小不符合要求（最大20MB）");
  return { name, mimeType, size: file.size };
}

export async function createDailyLearningDirectUpload(input: {
  planId: string;
  userId: string;
  learningDate: string;
  file: { name: string; type: string; size: number };
}) {
  const metadata = validateDailyLearningRecording(input.file);
  const platform = await getPlatformConfig();
  if (!platform.dailyLearningR2StorageId) throw new DailyLearningRecordingError("系统尚未配置《每日学习》R2存储空间，请联系管理员");
  let config: Awaited<ReturnType<typeof getEnabledR2Config>>;
  try { config = await getEnabledR2Config(platform.dailyLearningR2StorageId); }
  catch (error) {
    if (error instanceof R2ConfigError) throw new DailyLearningRecordingError("《每日学习》R2存储空间不可用，请联系管理员");
    throw error;
  }
  await db.r2StorageReference.upsert({
    where: { businessType_businessId: { businessType: "DAILY_LEARNING", businessId: "PLATFORM" } },
    create: { r2ConfigId: config.id, businessType: "DAILY_LEARNING", businessId: "PLATFORM" },
    update: { r2ConfigId: config.id },
  }).catch(() => { throw new DailyLearningRecordingError("《每日学习》R2存储配置登记失败，请联系管理员"); });
  const dateKey = input.learningDate.replaceAll("-", "");
  const objectKey = `daily-learning/${dateKey}/${input.planId}/${input.userId}/${crypto.randomUUID()}.${extensionFor(metadata.mimeType)}`;
  const expiresIn = Math.max(1, Math.min(config.signedUrlExpireSeconds, 300));
  const client = clientFor(config);
  try {
    const uploadUrl = await getSignedUrl(client, new PutObjectCommand({
      Bucket: config.bucketName,
      Key: objectKey,
      ContentType: metadata.mimeType,
      IfNoneMatch: "*",
    }), { expiresIn });
    return { uploadUrl, objectKey, expiresIn, r2StorageId: config.id, ...metadata };
  } catch {
    throw new DailyLearningRecordingError("生成录音上传地址失败，请稍后重试");
  } finally {
    client.destroy();
  }
}

export async function verifyDailyLearningDirectUpload(input: {
  r2StorageId: string;
  objectKey: string;
  expectedSize: number;
  expectedMimeType: string;
  etag?: string | null;
}) {
  let config: Awaited<ReturnType<typeof getEnabledR2Config>>;
  try { config = await getEnabledR2Config(input.r2StorageId); }
  catch { throw new DailyLearningRecordingError("《每日学习》R2存储空间不可用，请联系管理员"); }
  const client = clientFor(config);
  try {
    const head = await client.send(new HeadObjectCommand({ Bucket: config.bucketName, Key: input.objectKey }));
    const actualType = (head.ContentType || "").toLowerCase().split(";", 1)[0];
    if (head.ContentLength !== input.expectedSize || actualType !== input.expectedMimeType) throw new DailyLearningRecordingError("R2录音文件校验失败，请重新录制并上传");
    const expectedEtag = input.etag?.replaceAll('"', "").trim();
    const actualEtag = head.ETag?.replaceAll('"', "").trim();
    if (expectedEtag && actualEtag && expectedEtag !== actualEtag) throw new DailyLearningRecordingError("R2录音文件完整性校验失败，请重新上传");
  } catch (error) {
    if (error instanceof DailyLearningRecordingError) throw error;
    throw new DailyLearningRecordingError("未能确认R2录音上传结果，请重新上传");
  } finally {
    client.destroy();
  }
}

export async function deleteDailyLearningRecording(r2StorageId: string, objectKey: string) {
  try {
    const config = await getR2ConfigForCleanup(r2StorageId);
    const client = clientFor(config);
    try { await client.send(new DeleteObjectCommand({ Bucket: config.bucketName, Key: objectKey })); }
    finally { client.destroy(); }
  } catch { /* Compensation is best-effort and must not expose R2 credentials. */ }
}

function contentDisposition(disposition: "inline" | "attachment", originalName: string) {
  const normalized = safeName(originalName || "daily-learning-recording.mp3");
  const asciiName = normalized.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_") || "daily-learning-recording.mp3";
  return `${disposition}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(normalized)}`;
}

export async function createDailyLearningRecordingReadUrl(input: {
  r2StorageId: string;
  objectKey: string;
  originalName: string;
  mimeType: string;
  download?: boolean;
}) {
  let config: Awaited<ReturnType<typeof getR2ConfigForCleanup>>;
  try { config = await getR2ConfigForCleanup(input.r2StorageId); }
  catch { throw new DailyLearningRecordingError("录音存储空间不可用，请联系管理员"); }
  const client = new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    maxAttempts: 2,
    requestChecksumCalculation: "WHEN_REQUIRED",
  });
  try {
    return await getSignedUrl(client, new GetObjectCommand({
      Bucket: config.bucketName,
      Key: input.objectKey,
      ResponseContentType: input.mimeType || "audio/mpeg",
      ResponseContentDisposition: contentDisposition(input.download ? "attachment" : "inline", input.originalName),
    }), { expiresIn: Math.max(1, Math.min(config.signedUrlExpireSeconds, 3600)) });
  } catch { throw new DailyLearningRecordingError("录音访问地址生成失败，请稍后重试"); }
  finally { client.destroy(); }
}

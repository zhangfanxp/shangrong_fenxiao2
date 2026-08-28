import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { jwtVerify, SignJWT } from "jose";
import { getPlatformConfig } from "@/lib/platform-config";
import { getEnabledR2Config, getR2ConfigForCleanup, R2ConfigError } from "@/lib/r2-config-service";

export type CourseAssetType = "COURSE_COVER" | "LESSON_COVER" | "VIDEO" | "AUDIO" | "PDF" | "PPT";
export type CourseAssetMetadata = {
  r2StorageId: string;
  objectKey: string;
  originalName: string;
  mimeType: string;
  size: number;
};

const assetProofSecret = new TextEncoder().encode(`${process.env.AUTH_SECRET || "development-secret-change-me"}:course-asset-proof`);
const assetProofAudience = "course-asset-save";

export class CourseAssetError extends Error {}

const MiB = 1024 * 1024;
const rules: Record<CourseAssetType, { extensions: string[]; mimeTypes: string[]; maxBytes: number }> = {
  COURSE_COVER: { extensions: ["jpg", "jpeg", "png", "webp"], mimeTypes: ["image/jpeg", "image/png", "image/webp"], maxBytes: 5 * MiB },
  LESSON_COVER: { extensions: ["jpg", "jpeg", "png", "webp"], mimeTypes: ["image/jpeg", "image/png", "image/webp"], maxBytes: 5 * MiB },
  VIDEO: { extensions: ["mp4", "webm", "mov"], mimeTypes: ["video/mp4", "video/webm", "video/quicktime"], maxBytes: 100 * MiB },
  AUDIO: { extensions: ["mp3", "aac", "m4a", "wav"], mimeTypes: ["audio/mpeg", "audio/aac", "audio/mp4", "audio/x-m4a", "audio/wav", "audio/x-wav"], maxBytes: 100 * MiB },
  PDF: { extensions: ["pdf"], mimeTypes: ["application/pdf"], maxBytes: 50 * MiB },
  PPT: { extensions: ["ppt", "pptx"], mimeTypes: ["application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation"], maxBytes: 50 * MiB },
};

function safeName(value: string) {
  const name = value.normalize("NFKC").replace(/[\\/\0\r\n]/g, "_").trim();
  return (name || "course-asset").slice(-255);
}

function extension(name: string) {
  return name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || "";
}

function clientFor(config: Awaited<ReturnType<typeof getEnabledR2Config>>) {
  return new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    maxAttempts: 2,
    requestChecksumCalculation: "WHEN_REQUIRED",
  });
}

function typeLabel(type: CourseAssetType) {
  return ({ COURSE_COVER: "课程封面", LESSON_COVER: "课时封面", VIDEO: "视频文件", AUDIO: "音频文件", PDF: "PDF文件", PPT: "PPT文件" } as const)[type];
}

export function validateCourseAssetMetadata(type: CourseAssetType, file: { name: string; type: string; size: number }) {
  const rule = rules[type];
  const name = safeName(file.name);
  const mimeType = file.type.toLowerCase().split(";", 1)[0];
  if (!rule.extensions.includes(extension(name)) || !rule.mimeTypes.includes(mimeType)) {
    throw new CourseAssetError(`${typeLabel(type)}格式不符合要求`);
  }
  if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > rule.maxBytes) {
    throw new CourseAssetError(`${typeLabel(type)}不能超过${rule.maxBytes / MiB}MB`);
  }
  return { name, mimeType, size: file.size };
}

async function storageIdFor(type: CourseAssetType) {
  const platform = await getPlatformConfig();
  const id = type === "VIDEO" ? platform.trainingVideoR2StorageId : type === "AUDIO" ? platform.trainingAudioR2StorageId : platform.trainingDocumentR2StorageId;
  if (!id) throw new CourseAssetError(`系统尚未配置${type === "VIDEO" ? "培训视频" : type === "AUDIO" ? "培训音频" : "培训文档"}R2存储空间，请联系管理员`);
  return id;
}

function shanghaiDateKey() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = (type: string) => parts.find(item => item.type === type)?.value || "";
  return `${get("year")}${get("month")}${get("day")}`;
}

export async function createCourseAssetUpload(type: CourseAssetType, file: { name: string; type: string; size: number }) {
  const metadata = validateCourseAssetMetadata(type, file);
  const r2StorageId = await storageIdFor(type);
  let config: Awaited<ReturnType<typeof getEnabledR2Config>>;
  try { config = await getEnabledR2Config(r2StorageId); }
  catch (error) {
    if (error instanceof R2ConfigError) throw new CourseAssetError("课程资源R2存储空间不可用，请联系管理员");
    throw error;
  }
  const objectKey = `course-assets/${shanghaiDateKey()}/${type.toLowerCase()}/${crypto.randomUUID()}-${metadata.name}`;
  const expiresIn = Math.max(1, Math.min(config.signedUrlExpireSeconds, 300));
  const client = clientFor(config);
  try {
    const uploadUrl = await getSignedUrl(client, new PutObjectCommand({ Bucket: config.bucketName, Key: objectKey, ContentType: metadata.mimeType, IfNoneMatch: "*" }), { expiresIn });
    return { uploadUrl, expiresIn, method: "PUT" as const, headers: { "Content-Type": metadata.mimeType, "If-None-Match": "*" }, r2StorageId, objectKey, originalName: metadata.name, mimeType: metadata.mimeType, size: metadata.size };
  } catch { throw new CourseAssetError("生成课件上传地址失败，请稍后重试"); }
  finally { client.destroy(); }
}

async function streamPrefix(body: unknown, max = 16) {
  if (!body || typeof body !== "object" || !("transformToByteArray" in body)) throw new Error("missing body");
  const bytes = await (body as { transformToByteArray(): Promise<Uint8Array> }).transformToByteArray();
  return bytes.slice(0, max);
}

function ascii(bytes: Uint8Array, start = 0, end = bytes.length) {
  return String.fromCharCode(...bytes.slice(start, end));
}

function matchesMagic(type: CourseAssetType, mimeType: string, bytes: Uint8Array) {
  const hex = Array.from(bytes).map(value => value.toString(16).padStart(2, "0")).join("");
  if (type === "COURSE_COVER" || type === "LESSON_COVER") {
    if (mimeType === "image/jpeg") return hex.startsWith("ffd8ff");
    if (mimeType === "image/png") return hex.startsWith("89504e470d0a1a0a");
    return ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP";
  }
  if (type === "VIDEO") return mimeType === "video/webm" ? hex.startsWith("1a45dfa3") : ascii(bytes, 4, 8) === "ftyp";
  if (type === "AUDIO") {
    if (["audio/mp4", "audio/x-m4a"].includes(mimeType)) return ascii(bytes, 4, 8) === "ftyp";
    if (["audio/wav", "audio/x-wav"].includes(mimeType)) return ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WAVE";
    return ascii(bytes, 0, 3) === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
  }
  if (type === "PDF") return ascii(bytes, 0, 4) === "%PDF";
  return hex.startsWith("d0cf11e0a1b11ae1") || hex.startsWith("504b0304");
}

export async function verifyCourseAsset(type: CourseAssetType, input: CourseAssetMetadata) {
  validateCourseAssetMetadata(type, { name: input.originalName, type: input.mimeType, size: input.size });
  const expectedPrefix = new RegExp(`^course-assets/\\d{8}/${type.toLowerCase()}/`);
  if (!expectedPrefix.test(input.objectKey)) throw new CourseAssetError("课程资源Object Key不合法");
  let config: Awaited<ReturnType<typeof getEnabledR2Config>>;
  try { config = await getEnabledR2Config(input.r2StorageId); }
  catch { throw new CourseAssetError("课程资源R2存储空间不可用，请联系管理员"); }
  if (input.r2StorageId !== await storageIdFor(type)) throw new CourseAssetError("课程资源存储配置已变化，请重新上传");
  const client = clientFor(config);
  try {
    const [head, prefix] = await Promise.all([
      client.send(new HeadObjectCommand({ Bucket: config.bucketName, Key: input.objectKey })),
      client.send(new GetObjectCommand({ Bucket: config.bucketName, Key: input.objectKey, Range: "bytes=0-15" })).then(result => streamPrefix(result.Body)),
    ]);
    const actualType = (head.ContentType || "").toLowerCase().split(";", 1)[0];
    if (head.ContentLength !== input.size || actualType !== input.mimeType || !matchesMagic(type, actualType, prefix)) {
      throw new CourseAssetError(`${typeLabel(type)}真实性校验失败，请重新上传`);
    }
    return input;
  } catch (error) {
    if (error instanceof CourseAssetError) throw error;
    throw new CourseAssetError("未能确认课程资源上传结果，请重新上传");
  } finally { client.destroy(); }
}

export async function createCourseAssetProof(type: CourseAssetType, input: CourseAssetMetadata, userId: string) {
  return new SignJWT({
    assetType: type, r2StorageId: input.r2StorageId, objectKey: input.objectKey,
    originalName: input.originalName, mimeType: input.mimeType, size: input.size,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setAudience(assetProofAudience)
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(assetProofSecret);
}

async function matchesCourseAssetProof(type: CourseAssetType, input: CourseAssetMetadata, userId: string, proof: string) {
  try {
    const { payload } = await jwtVerify(proof, assetProofSecret, { audience: assetProofAudience, subject: userId });
    return payload.assetType === type && payload.r2StorageId === input.r2StorageId && payload.objectKey === input.objectKey
      && payload.originalName === input.originalName && payload.mimeType === input.mimeType && payload.size === input.size;
  } catch { return false; }
}

export async function verifyConfirmedCourseAsset(type: CourseAssetType, input: CourseAssetMetadata, userId: string, proof?: string) {
  validateCourseAssetMetadata(type, { name: input.originalName, type: input.mimeType, size: input.size });
  if (proof && await matchesCourseAssetProof(type, input, userId, proof)) return input;
  return verifyCourseAsset(type, input);
}

function contentDisposition(name: string, download: boolean) {
  const normalized = safeName(name);
  const asciiName = normalized.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  return `${download ? "attachment" : "inline"}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(normalized)}`;
}

export async function createCourseAssetReadUrl(input: CourseAssetMetadata & { download?: boolean }) {
  let config: Awaited<ReturnType<typeof getR2ConfigForCleanup>>;
  try { config = await getR2ConfigForCleanup(input.r2StorageId); }
  catch { throw new CourseAssetError("课程资源存储空间不可用，请联系管理员"); }
  const client = new S3Client({ region: "auto", endpoint: config.endpoint, credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }, maxAttempts: 2, requestChecksumCalculation: "WHEN_REQUIRED" });
  try {
    return await getSignedUrl(client, new GetObjectCommand({ Bucket: config.bucketName, Key: input.objectKey, ResponseContentType: input.mimeType, ResponseContentDisposition: contentDisposition(input.originalName, Boolean(input.download)) }), { expiresIn: Math.max(1, Math.min(config.signedUrlExpireSeconds, 3600)) });
  } catch { throw new CourseAssetError("课程资源访问地址生成失败，请稍后重试"); }
  finally { client.destroy(); }
}

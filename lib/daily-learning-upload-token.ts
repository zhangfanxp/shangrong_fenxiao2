import { SignJWT, jwtVerify } from "jose";

const secret = new TextEncoder().encode(process.env.AUTH_SECRET || "development-secret-change-me");
const audience = "daily_learning_recording_upload";

export type DailyLearningUploadGrant = {
  userId: string;
  planId: string;
  weekDay: number;
  learningDate: string;
  r2StorageId: string;
  objectKey: string;
  originalName: string;
  mimeType: string;
  size: number;
  durationSeconds: number;
};

export async function createDailyLearningUploadToken(grant: DailyLearningUploadGrant, expiresIn: number) {
  return new SignJWT({ ...grant, channel: audience })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(`${expiresIn}s`)
    .sign(secret);
}

export async function verifyDailyLearningUploadToken(token: string): Promise<DailyLearningUploadGrant> {
  const { payload } = await jwtVerify(token, secret, { audience });
  if (payload.channel !== audience || typeof payload.userId !== "string" || typeof payload.planId !== "string"
    || !Number.isInteger(payload.weekDay) || typeof payload.learningDate !== "string" || typeof payload.r2StorageId !== "string"
    || typeof payload.objectKey !== "string" || typeof payload.originalName !== "string" || typeof payload.mimeType !== "string"
    || !Number.isSafeInteger(payload.size) || !Number.isInteger(payload.durationSeconds)) throw new Error("上传凭证无效");
  return {
    userId: payload.userId,
    planId: payload.planId,
    weekDay: payload.weekDay as number,
    learningDate: payload.learningDate,
    r2StorageId: payload.r2StorageId,
    objectKey: payload.objectKey,
    originalName: payload.originalName,
    mimeType: payload.mimeType,
    size: payload.size as number,
    durationSeconds: payload.durationSeconds as number,
  };
}

import { SignJWT, jwtVerify } from "jose";

const secret = new TextEncoder().encode(process.env.AUTH_SECRET || "development-secret-change-me");
const audience = "task_record_edit_upload";

export type TaskRecordEditUploadGrant = {
  userId: string;
  taskRecordId: string;
  itemId: string;
  itemIndex: number;
  r2StorageId: string;
  objectKey: string;
  originalName: string;
  mimeType: string;
  size: number;
};

export async function createTaskRecordEditUploadToken(grant: TaskRecordEditUploadGrant, expiresIn: number) {
  return new SignJWT({ ...grant, channel: audience })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(`${expiresIn}s`)
    .sign(secret);
}

export async function verifyTaskRecordEditUploadToken(token: string): Promise<TaskRecordEditUploadGrant> {
  const { payload } = await jwtVerify(token, secret, { audience });
  if (payload.channel !== audience || typeof payload.userId !== "string" || typeof payload.taskRecordId !== "string"
    || typeof payload.itemId !== "string" || !Number.isInteger(payload.itemIndex) || typeof payload.r2StorageId !== "string"
    || typeof payload.objectKey !== "string" || typeof payload.originalName !== "string" || typeof payload.mimeType !== "string"
    || !Number.isSafeInteger(payload.size)) {
    throw new Error("上传凭证无效");
  }
  return {
    userId: payload.userId,
    taskRecordId: payload.taskRecordId,
    itemId: payload.itemId,
    itemIndex: payload.itemIndex as number,
    r2StorageId: payload.r2StorageId,
    objectKey: payload.objectKey,
    originalName: payload.originalName,
    mimeType: payload.mimeType,
    size: payload.size as number,
  };
}

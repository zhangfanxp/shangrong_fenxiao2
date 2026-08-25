import { SignJWT, jwtVerify } from "jose";

const secret = new TextEncoder().encode(process.env.AUTH_SECRET || "development-secret-change-me");
const audience = "store_h5_upload";

export type StoreH5UploadGrant = {
  userId: string;
  taskRecordId: string;
  itemIndex: number;
  r2StorageId: string;
  objectKey: string;
  originalName: string;
  mimeType: string;
  size: number;
};

export async function createStoreH5UploadToken(grant: StoreH5UploadGrant, expiresIn: number) {
  return new SignJWT({ ...grant, channel: audience })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(`${expiresIn}s`)
    .sign(secret);
}

export async function verifyStoreH5UploadToken(token: string): Promise<StoreH5UploadGrant> {
  const { payload } = await jwtVerify(token, secret, { audience });
  if (payload.channel !== audience || typeof payload.userId !== "string" || typeof payload.taskRecordId !== "string"
    || !Number.isInteger(payload.itemIndex) || typeof payload.r2StorageId !== "string" || typeof payload.objectKey !== "string"
    || typeof payload.originalName !== "string" || typeof payload.mimeType !== "string" || !Number.isSafeInteger(payload.size)) {
    throw new Error("上传凭证无效");
  }
  return {
    userId: payload.userId,
    taskRecordId: payload.taskRecordId,
    itemIndex: payload.itemIndex as number,
    r2StorageId: payload.r2StorageId,
    objectKey: payload.objectKey,
    originalName: payload.originalName,
    mimeType: payload.mimeType,
    size: payload.size as number,
  };
}

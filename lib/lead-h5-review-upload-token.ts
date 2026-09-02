import { SignJWT, jwtVerify } from "jose";

const secret = new TextEncoder().encode(process.env.AUTH_SECRET || "development-secret-change-me");
const audience = "lead_h5_review_photo_upload";

export type LeadH5ReviewPhotoUploadGrant = {
  userId: string;
  storeId: string;
  reviewMonth: string;
  reviewType: string;
  assessmentId: string;
  assessmentVersion: number;
  itemKey: string;
  r2StorageId: string;
  objectKey: string;
  originalName: string;
  mimeType: string;
  size: number;
};

export async function createLeadH5ReviewPhotoUploadToken(grant: LeadH5ReviewPhotoUploadGrant, expiresIn: number) {
  return new SignJWT({ ...grant, channel: audience }).setProtectedHeader({ alg: "HS256" }).setAudience(audience).setIssuedAt().setExpirationTime(`${expiresIn}s`).sign(secret);
}

export async function verifyLeadH5ReviewPhotoUploadToken(token: string): Promise<LeadH5ReviewPhotoUploadGrant> {
  const { payload } = await jwtVerify(token, secret, { audience });
  if (payload.channel !== audience || typeof payload.userId !== "string" || typeof payload.storeId !== "string"
    || typeof payload.reviewMonth !== "string" || typeof payload.reviewType !== "string" || typeof payload.assessmentId !== "string"
    || !Number.isInteger(payload.assessmentVersion) || typeof payload.itemKey !== "string" || typeof payload.r2StorageId !== "string"
    || typeof payload.objectKey !== "string" || typeof payload.originalName !== "string" || typeof payload.mimeType !== "string"
    || !Number.isSafeInteger(payload.size)) throw new Error("上传凭证无效");
  return payload as unknown as LeadH5ReviewPhotoUploadGrant;
}

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const VERSION = "v1";

function encryptionKey() {
  const secret = process.env.R2_CONFIG_ENCRYPTION_KEY || process.env.AUTH_SECRET;
  if (!secret && process.env.NODE_ENV === "production") throw new Error("R2 encryption key is not configured");
  return createHash("sha256").update(secret || "canyin-r2-local-development-key").digest();
}

export function encryptR2Credential(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(":");
}

export function decryptR2Credential(value: string) {
  const [version, iv, tag, encrypted] = value.split(":");
  if (version !== VERSION || !iv || !tag || !encrypted) throw new Error("Invalid encrypted credential");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}

export function maskAccessKey(value: string) {
  if (value.length <= 8) return "********";
  return `${value.slice(0, 4)}${"*".repeat(Math.max(8, value.length - 8))}${value.slice(-4)}`;
}

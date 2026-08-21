import { constants } from "node:fs";
import { access, chmod, mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import path from "node:path";

export type R2ConfigFileEntry = {
  id: string;
  recordNo: string;
  name: string;
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  endpoint: string;
  signedUrlExpireSeconds: number;
  status: "ENABLED" | "DISABLED";
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  version: number;
};

type R2ConfigDocument = { buckets: R2ConfigFileEntry[] };

const directoryPath = path.join(process.cwd(), "data", "R2_Bucket");
const configPath = path.join(directoryPath, "cloudflare_R2.json");

export class R2ConfigFileError extends Error {
  constructor(public readonly kind: "missing" | "invalid" | "write", message: string) { super(message); }
}

function validateDocument(value: unknown): R2ConfigDocument {
  if (!value || typeof value !== "object" || !Array.isArray((value as R2ConfigDocument).buckets)) throw new R2ConfigFileError("invalid", "R2配置文件格式异常，请联系系统管理员处理");
  const document = value as R2ConfigDocument;
  const ids = new Set<string>(); const recordNos = new Set<string>();
  for (const bucket of document.buckets) {
    if (!bucket || typeof bucket !== "object" || typeof bucket.id !== "string" || typeof bucket.recordNo !== "string" || ids.has(bucket.id) || recordNos.has(bucket.recordNo)) throw new R2ConfigFileError("invalid", "R2配置文件格式异常，请联系系统管理员处理");
    ids.add(bucket.id); recordNos.add(bucket.recordNo);
  }
  return document;
}

export async function readR2ConfigDocument(databaseRecordCount: number) {
  try {
    await access(configPath, constants.F_OK);
  } catch {
    if (databaseRecordCount === 0) return { buckets: [] } satisfies R2ConfigDocument;
    throw new R2ConfigFileError("missing", "R2本地配置文件缺失，请联系系统管理员处理");
  }
  try {
    return validateDocument(JSON.parse(await readFile(configPath, "utf8")));
  } catch (error) {
    if (error instanceof R2ConfigFileError) throw error;
    throw new R2ConfigFileError("invalid", "R2配置文件格式异常，请联系系统管理员处理");
  }
}

export async function writeR2ConfigDocument(document: R2ConfigDocument) {
  validateDocument(document);
  await mkdir(directoryPath, { recursive: true, mode: 0o700 });
  await chmod(directoryPath, 0o700).catch(() => undefined);
  const tempPath = `${configPath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    const serialized = `${JSON.stringify(document, null, 2)}\n`;
    JSON.parse(serialized);
    handle = await open(tempPath, "wx", 0o600);
    await handle.writeFile(serialized, "utf8");
    await handle.sync();
    await handle.close(); handle = undefined;
    await rename(tempPath, configPath);
    await chmod(configPath, 0o600);
  } catch {
    await handle?.close().catch(() => undefined);
    await unlink(tempPath).catch(() => undefined);
    throw new R2ConfigFileError("write", "R2配置文件保存失败，请检查系统配置后重试");
  }
}

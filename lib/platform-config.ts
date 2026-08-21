import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export const DEFAULT_PLATFORM_NAME = "餐饮运营管理";

export type PlatformConfig = {
  platformName: string;
  logoDataUrl: string | null;
  loginBackgroundDataUrl: string | null;
};

const targetPath = () => path.join(process.cwd(), "config", "platform.config.json");

export async function getPlatformConfig(): Promise<PlatformConfig> {
  try {
    const value = JSON.parse(await readFile(targetPath(), "utf8")) as { platformName?: unknown; logoDataUrl?: unknown; loginBackgroundDataUrl?: unknown };
    const platformName = typeof value.platformName === "string" && value.platformName.trim() ? value.platformName.trim() : DEFAULT_PLATFORM_NAME;
    const logoDataUrl = typeof value.logoDataUrl === "string" && value.logoDataUrl.startsWith("data:image/") ? value.logoDataUrl : null;
    const loginBackgroundDataUrl = typeof value.loginBackgroundDataUrl === "string" && value.loginBackgroundDataUrl.startsWith("data:image/") ? value.loginBackgroundDataUrl : null;
    return { platformName, logoDataUrl, loginBackgroundDataUrl };
  } catch {
    return { platformName: DEFAULT_PLATFORM_NAME, logoDataUrl: null, loginBackgroundDataUrl: null };
  }
}

let writeQueue: Promise<void> = Promise.resolve();

export async function savePlatformConfig(config: PlatformConfig) {
  const task = writeQueue.then(async () => {
    const directory = path.dirname(targetPath());
    await mkdir(directory, { recursive: true });
    const temporary = path.join(directory, `.platform.${crypto.randomUUID()}.tmp`);
    try {
      await writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, "utf8");
      await rename(temporary, targetPath());
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
    return config;
  });
  writeQueue = task.then(() => undefined, () => undefined);
  return task;
}

import { copyFile, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export const DEFAULT_PLATFORM_NAME = "餐饮运营管理";

export type PlatformConfig = {
  platformName: string;
  logoDataUrl: string | null;
  loginBackgroundDataUrl: string | null;
  leadPcLoginTags: string;
  leadH5LoginTags: string;
  storeH5LoginTags: string;
  automaticTaskExecutionTime: string;
  defaultTaskDeadlineDayOffset: 0 | 1;
  defaultTaskDeadlineTime: string;
  dailyLearningR2StorageId: string | null;
  trainingVideoR2StorageId: string | null;
  trainingAudioR2StorageId: string | null;
  trainingDocumentR2StorageId: string | null;
};

const targetPath = () => path.join(process.cwd(), "config", "platform.config.json");

export function normalizeLoginTags(value?: unknown) {
  if (typeof value !== "string") return "";
  const tags = value.split(/[|｜]/).map(tag => tag.trim()).filter(Boolean);
  return [...new Set(tags)].join("｜");
}

export function userHasAnyLoginTag(userTags: string | null | undefined, configuredTags: string) {
  const required = new Set(normalizeLoginTags(configuredTags).split("｜").filter(Boolean));
  if (!required.size) return true;
  return normalizeLoginTags(userTags).split("｜").some(tag => required.has(tag));
}

export async function getPlatformConfig(): Promise<PlatformConfig> {
  try {
    const value = JSON.parse(await readFile(targetPath(), "utf8")) as { platformName?: unknown; logoDataUrl?: unknown; loginBackgroundDataUrl?: unknown; leadPcLoginTags?: unknown; leadH5LoginTags?: unknown; storeH5LoginTags?: unknown; automaticTaskExecutionTime?: unknown; defaultTaskDeadlineDayOffset?: unknown; defaultTaskDeadlineTime?: unknown; dailyLearningR2StorageId?: unknown; trainingVideoR2StorageId?: unknown; trainingAudioR2StorageId?: unknown; trainingDocumentR2StorageId?: unknown };
    const platformName = typeof value.platformName === "string" && value.platformName.trim() ? value.platformName.trim() : DEFAULT_PLATFORM_NAME;
    const logoDataUrl = typeof value.logoDataUrl === "string" && value.logoDataUrl.startsWith("data:image/") ? value.logoDataUrl : null;
    const loginBackgroundDataUrl = typeof value.loginBackgroundDataUrl === "string" && value.loginBackgroundDataUrl.startsWith("data:image/") ? value.loginBackgroundDataUrl : null;
    const automaticTaskExecutionTime = typeof value.automaticTaskExecutionTime === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value.automaticTaskExecutionTime) ? value.automaticTaskExecutionTime : "05:30";
    const defaultTaskDeadlineDayOffset = value.defaultTaskDeadlineDayOffset === 1 ? 1 : 0;
    const defaultTaskDeadlineTime = typeof value.defaultTaskDeadlineTime === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value.defaultTaskDeadlineTime) ? value.defaultTaskDeadlineTime : "23:59";
    const dailyLearningR2StorageId = typeof value.dailyLearningR2StorageId === "string" && value.dailyLearningR2StorageId.trim() ? value.dailyLearningR2StorageId.trim() : null;
    const trainingVideoR2StorageId = typeof value.trainingVideoR2StorageId === "string" && value.trainingVideoR2StorageId.trim() ? value.trainingVideoR2StorageId.trim() : null;
    const trainingAudioR2StorageId = typeof value.trainingAudioR2StorageId === "string" && value.trainingAudioR2StorageId.trim() ? value.trainingAudioR2StorageId.trim() : null;
    const trainingDocumentR2StorageId = typeof value.trainingDocumentR2StorageId === "string" && value.trainingDocumentR2StorageId.trim() ? value.trainingDocumentR2StorageId.trim() : null;
    return { platformName, logoDataUrl, loginBackgroundDataUrl, leadPcLoginTags: normalizeLoginTags(value.leadPcLoginTags), leadH5LoginTags: normalizeLoginTags(value.leadH5LoginTags), storeH5LoginTags: normalizeLoginTags(value.storeH5LoginTags), automaticTaskExecutionTime, defaultTaskDeadlineDayOffset, defaultTaskDeadlineTime, dailyLearningR2StorageId, trainingVideoR2StorageId, trainingAudioR2StorageId, trainingDocumentR2StorageId };
  } catch {
    return { platformName: DEFAULT_PLATFORM_NAME, logoDataUrl: null, loginBackgroundDataUrl: null, leadPcLoginTags: "", leadH5LoginTags: "", storeH5LoginTags: "", automaticTaskExecutionTime: "05:30", defaultTaskDeadlineDayOffset: 0, defaultTaskDeadlineTime: "23:59", dailyLearningR2StorageId: null, trainingVideoR2StorageId: null, trainingAudioR2StorageId: null, trainingDocumentR2StorageId: null };
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
      await copyFile(targetPath(), path.join(directory, "platform.config.backup.json")).catch(error => {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      });
      await rename(temporary, targetPath());
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
    return config;
  });
  writeQueue = task.then(() => undefined, () => undefined);
  return task;
}

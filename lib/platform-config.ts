import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { emptyAiServiceApiConfig, isAiModelId, type AiServiceApiConfig } from "@/lib/ai-model-adapters";

export const DEFAULT_PLATFORM_NAME = "餐饮运营管理";

export type PlatformConfig = {
  platformName: string;
  logoDataUrl: string | null;
  loginBackgroundDataUrl: string | null;
  courseCoverDataUrl: string | null;
  lessonCoverDataUrl: string | null;
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
  aiApiServices: Record<string, AiServiceApiConfig>;
};

export type PlatformAssetName = "logo" | "login-background" | "course-cover" | "lesson-cover";

export type PlatformSettings = Omit<PlatformConfig, "logoDataUrl" | "loginBackgroundDataUrl" | "courseCoverDataUrl" | "lessonCoverDataUrl">;

export type PlatformAssetUrls = {
  logo: string | null;
  loginBackground: string | null;
  courseCover: string | null;
  lessonCover: string | null;
};

const targetPath = () => path.join(process.cwd(), "config", "platform.config.json");
const DEFAULT_PLATFORM_CONFIG: PlatformConfig = { platformName: DEFAULT_PLATFORM_NAME, logoDataUrl: null, loginBackgroundDataUrl: null, courseCoverDataUrl: null, lessonCoverDataUrl: null, leadPcLoginTags: "", leadH5LoginTags: "", storeH5LoginTags: "", automaticTaskExecutionTime: "05:30", defaultTaskDeadlineDayOffset: 0, defaultTaskDeadlineTime: "23:59", dailyLearningR2StorageId: null, trainingVideoR2StorageId: null, trainingAudioR2StorageId: null, trainingDocumentR2StorageId: null, aiApiServices: {} };
let platformConfigCache: { mtimeMs: number; size: number; value: PlatformConfig } | null = null;

export function platformAssetVersion(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export function platformAssetUrl(asset: PlatformAssetName, value: string | null) {
  return value ? `/api/settings/platform-assets/${asset}?v=${platformAssetVersion(value)}` : null;
}

export function splitPlatformConfig(config: PlatformConfig): { settings: PlatformSettings; assetUrls: PlatformAssetUrls } {
  const { logoDataUrl, loginBackgroundDataUrl, courseCoverDataUrl, lessonCoverDataUrl, ...settings } = config;
  return {
    settings,
    assetUrls: {
      logo: platformAssetUrl("logo", logoDataUrl),
      loginBackground: platformAssetUrl("login-background", loginBackgroundDataUrl),
      courseCover: platformAssetUrl("course-cover", courseCoverDataUrl),
      lessonCover: platformAssetUrl("lesson-cover", lessonCoverDataUrl),
    },
  };
}

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
    const file = await stat(targetPath());
    if (platformConfigCache?.mtimeMs === file.mtimeMs && platformConfigCache.size === file.size) return platformConfigCache.value;
    const value = JSON.parse(await readFile(targetPath(), "utf8")) as { platformName?: unknown; logoDataUrl?: unknown; loginBackgroundDataUrl?: unknown; courseCoverDataUrl?: unknown; lessonCoverDataUrl?: unknown; leadPcLoginTags?: unknown; leadH5LoginTags?: unknown; storeH5LoginTags?: unknown; automaticTaskExecutionTime?: unknown; defaultTaskDeadlineDayOffset?: unknown; defaultTaskDeadlineTime?: unknown; dailyLearningR2StorageId?: unknown; trainingVideoR2StorageId?: unknown; trainingAudioR2StorageId?: unknown; trainingDocumentR2StorageId?: unknown; aiApiServices?: unknown; aiApiEndpoints?: unknown; imageAnalysisApiUrl?: unknown; videoAnalysisApiUrl?: unknown };
    const platformName = typeof value.platformName === "string" && value.platformName.trim() ? value.platformName.trim() : DEFAULT_PLATFORM_NAME;
    const logoDataUrl = typeof value.logoDataUrl === "string" && value.logoDataUrl.startsWith("data:image/") ? value.logoDataUrl : null;
    const loginBackgroundDataUrl = typeof value.loginBackgroundDataUrl === "string" && value.loginBackgroundDataUrl.startsWith("data:image/") ? value.loginBackgroundDataUrl : null;
    const courseCoverDataUrl = typeof value.courseCoverDataUrl === "string" && value.courseCoverDataUrl.startsWith("data:image/") ? value.courseCoverDataUrl : null;
    const lessonCoverDataUrl = typeof value.lessonCoverDataUrl === "string" && value.lessonCoverDataUrl.startsWith("data:image/") ? value.lessonCoverDataUrl : null;
    const automaticTaskExecutionTime = typeof value.automaticTaskExecutionTime === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value.automaticTaskExecutionTime) ? value.automaticTaskExecutionTime : "05:30";
    const defaultTaskDeadlineDayOffset: 0 | 1 = value.defaultTaskDeadlineDayOffset === 1 ? 1 : 0;
    const defaultTaskDeadlineTime = typeof value.defaultTaskDeadlineTime === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value.defaultTaskDeadlineTime) ? value.defaultTaskDeadlineTime : "23:59";
    const dailyLearningR2StorageId = typeof value.dailyLearningR2StorageId === "string" && value.dailyLearningR2StorageId.trim() ? value.dailyLearningR2StorageId.trim() : null;
    const trainingVideoR2StorageId = typeof value.trainingVideoR2StorageId === "string" && value.trainingVideoR2StorageId.trim() ? value.trainingVideoR2StorageId.trim() : null;
    const trainingAudioR2StorageId = typeof value.trainingAudioR2StorageId === "string" && value.trainingAudioR2StorageId.trim() ? value.trainingAudioR2StorageId.trim() : null;
    const trainingDocumentR2StorageId = typeof value.trainingDocumentR2StorageId === "string" && value.trainingDocumentR2StorageId.trim() ? value.trainingDocumentR2StorageId.trim() : null;
    const aiApiServices: Record<string, AiServiceApiConfig> = {};
    if (value.aiApiServices && typeof value.aiApiServices === "object" && !Array.isArray(value.aiApiServices)) {
      for (const [rawService, rawConfig] of Object.entries(value.aiApiServices)) {
        const service = rawService.trim();
        if (!service || !rawConfig || typeof rawConfig !== "object" || Array.isArray(rawConfig)) continue;
        const candidate = rawConfig as { selectedModel?: unknown; endpoints?: unknown };
        const config = emptyAiServiceApiConfig();
        if (isAiModelId(candidate.selectedModel)) config.selectedModel = candidate.selectedModel;
        if (candidate.endpoints && typeof candidate.endpoints === "object" && !Array.isArray(candidate.endpoints)) {
          const endpoints = candidate.endpoints as Record<string, unknown>;
          config.endpoints.MAGE_VL = typeof endpoints.MAGE_VL === "string" ? endpoints.MAGE_VL.trim() : "";
          config.endpoints.QWEN3_VL = typeof endpoints.QWEN3_VL === "string" ? endpoints.QWEN3_VL.trim() : "";
        }
        aiApiServices[service] = config;
      }
    }
    if (value.aiApiEndpoints && typeof value.aiApiEndpoints === "object" && !Array.isArray(value.aiApiEndpoints)) {
      for (const [rawService, endpoint] of Object.entries(value.aiApiEndpoints)) {
        const service = rawService.trim();
        if (!service || typeof endpoint !== "string") continue;
        const config = aiApiServices[service] || emptyAiServiceApiConfig();
        if (!config.endpoints.MAGE_VL) config.endpoints.MAGE_VL = endpoint.trim();
        aiApiServices[service] = config;
      }
    }
    const migrateLegacyEndpoint = (service: string, endpoint: unknown) => {
      if (typeof endpoint !== "string") return;
      const config = aiApiServices[service] || emptyAiServiceApiConfig();
      if (!config.endpoints.MAGE_VL) config.endpoints.MAGE_VL = endpoint.trim();
      aiApiServices[service] = config;
    };
    migrateLegacyEndpoint("图片分析", value.imageAnalysisApiUrl);
    migrateLegacyEndpoint("视频分析", value.videoAnalysisApiUrl);
    const config = { platformName, logoDataUrl, loginBackgroundDataUrl, courseCoverDataUrl, lessonCoverDataUrl, leadPcLoginTags: normalizeLoginTags(value.leadPcLoginTags), leadH5LoginTags: normalizeLoginTags(value.leadH5LoginTags), storeH5LoginTags: normalizeLoginTags(value.storeH5LoginTags), automaticTaskExecutionTime, defaultTaskDeadlineDayOffset, defaultTaskDeadlineTime, dailyLearningR2StorageId, trainingVideoR2StorageId, trainingAudioR2StorageId, trainingDocumentR2StorageId, aiApiServices };
    platformConfigCache = { mtimeMs: file.mtimeMs, size: file.size, value: config };
    return config;
  } catch {
    platformConfigCache = null;
    return DEFAULT_PLATFORM_CONFIG;
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
      const file = await stat(targetPath());
      platformConfigCache = { mtimeMs: file.mtimeMs, size: file.size, value: config };
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
    return config;
  });
  writeQueue = task.then(() => undefined, () => undefined);
  return task;
}

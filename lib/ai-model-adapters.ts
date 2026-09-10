export const AI_MODEL_IDS = ["MAGE_VL", "QWEN3_VL"] as const;

export type AiModelId = typeof AI_MODEL_IDS[number];
export type AiServiceKind = "image" | "video" | "text" | "generic";

export type AiServiceApiConfig = {
  selectedModel: AiModelId;
  endpoints: Record<AiModelId, string>;
};

export const AI_MODEL_OPTIONS: Array<{ value: AiModelId; label: string }> = [
  { value: "MAGE_VL", label: "微软 Mage VL" },
  { value: "QWEN3_VL", label: "Qwen3 VL" },
];

export function isAiModelId(value: unknown): value is AiModelId {
  return typeof value === "string" && AI_MODEL_IDS.includes(value as AiModelId);
}

export function aiModelLabel(model: AiModelId) {
  return AI_MODEL_OPTIONS.find(option => option.value === model)?.label || model;
}

export function aiServiceKind(service: string, dataType?: string | null): AiServiceKind {
  const normalized = service.toLowerCase();
  if (service.includes("图片") || normalized.includes("image")) return "image";
  if (service.includes("视频") || normalized.includes("video")) return "video";
  if (service.includes("文字") || service.includes("文本") || normalized.includes("text")) return "text";
  if (dataType === "photo") return "image";
  if (dataType === "video") return "video";
  return "generic";
}

export function aiModelSupportsService(model: AiModelId, service: string, dataType?: string | null) {
  return model === "MAGE_VL" || aiServiceKind(service, dataType) === "image";
}

export function emptyAiServiceApiConfig(): AiServiceApiConfig {
  return { selectedModel: "MAGE_VL", endpoints: { MAGE_VL: "", QWEN3_VL: "" } };
}

export function normalizeAiServiceApiConfig(value: AiServiceApiConfig | undefined, service: string): AiServiceApiConfig {
  const selectedModel = value && isAiModelId(value.selectedModel) && aiModelSupportsService(value.selectedModel, service) ? value.selectedModel : "MAGE_VL";
  return {
    selectedModel,
    endpoints: {
      MAGE_VL: value?.endpoints?.MAGE_VL?.trim() || "",
      QWEN3_VL: value?.endpoints?.QWEN3_VL?.trim() || "",
    },
  };
}

export function aiEndpointExample(model: AiModelId, service: string) {
  const kind = aiServiceKind(service);
  if (model === "QWEN3_VL") return kind === "image" ? "http://127.0.0.1:8000/v1/analyze" : "";
  const path = kind === "image" ? "image" : kind === "video" ? "video" : kind === "text" ? "text" : "service";
  return `http://127.0.0.1:8000/api/v1/analyze/${path}`;
}

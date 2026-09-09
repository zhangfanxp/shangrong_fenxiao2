import { createTaskAttachmentReadUrl } from "@/lib/task-r2-upload";

type AiAnalysisKind = "image" | "video" | "text" | "generic";

export type TaskAiAnalysisInput = {
  service: string;
  endpoint: string;
  prompt: string;
  componentType: string;
  dataType: string | null;
  value: string | null;
  attachmentObjectKey: string | null;
  attachmentName: string | null;
  attachmentMimeType: string | null;
  r2StorageId: string | null;
};

export type TaskAiAnalysisOutput = {
  analysisResult: string;
  unqualifiedReasonDescription: string;
};

export class TaskAiAnalysisError extends Error {}

const AI_REQUEST_TIMEOUT_MILLISECONDS = 15 * 60 * 1000;
const ATTACHMENT_DOWNLOAD_TIMEOUT_MILLISECONDS = 2 * 60 * 1000;
const MAX_AI_RESPONSE_CHARACTERS = 100_000;
const MAX_MEDIA_BYTES = 110 * 1024 * 1024;

function serviceKind(service: string, dataType: string | null): AiAnalysisKind {
  const normalized = service.toLowerCase();
  if (service.includes("图片") || normalized.includes("image")) return "image";
  if (service.includes("视频") || normalized.includes("video")) return "video";
  if (service.includes("文字") || service.includes("文本") || normalized.includes("text")) return "text";
  if (dataType === "photo") return "image";
  if (dataType === "video") return "video";
  return "generic";
}

function objectValue(value: unknown, keys: string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const source = value as Record<string, unknown>;
  return keys.map(key => source[key]).find(candidate => typeof candidate === "string" || typeof candidate === "boolean");
}

function stringValue(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "boolean") return value ? "合格" : "不合格";
  return "";
}

function tryParseJson(value: string) {
  const normalized = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  if (!normalized.startsWith("{") || !normalized.endsWith("}")) return null;
  try { return JSON.parse(normalized) as unknown; } catch { return null; }
}

function extractUnqualifiedReason(raw: string) {
  const explicit = raw.match(/(?:不合格原因描述|不合格原因|原因|理由)\s*[:：]\s*([\s\S]+)/)?.[1]?.trim();
  if (explicit) return explicit;
  const afterVerdict = raw.match(/不合格\s*(?:，|,|。|；|;|:|：|因为|原因是)?\s*([\s\S]+)/)?.[1]?.trim();
  return afterVerdict || "AI接口未单独返回不合格原因描述";
}

export function parseTaskAiAnalysisResponse(payload: unknown): TaskAiAnalysisOutput {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new TaskAiAnalysisError("AI接口响应格式不正确");
  const response = payload as Record<string, unknown>;
  if (response.success !== true) throw new TaskAiAnalysisError("AI接口响应未标记为成功");
  let resultPayload = response.result ?? response.data;
  if (typeof resultPayload === "string") resultPayload = tryParseJson(resultPayload) || resultPayload;

  const structuredResult = objectValue(resultPayload, ["analysisResult", "analysis_result", "result", "conclusion", "qualified", "isQualified"])
    ?? objectValue(response, ["analysisResult", "analysis_result", "conclusion", "qualified", "isQualified"]);
  const structuredReason = objectValue(resultPayload, ["unqualifiedReasonDescription", "unqualified_reason_description", "unqualifiedReason", "unqualified_reason", "reason"])
    ?? objectValue(response, ["unqualifiedReasonDescription", "unqualified_reason_description", "unqualifiedReason", "unqualified_reason", "reason"]);

  const rawResult = stringValue(structuredResult) || (typeof resultPayload === "string" ? resultPayload.trim() : "");
  if (!rawResult) throw new TaskAiAnalysisError("AI接口调用成功，但分析结果为空");
  const analysisResult = rawResult.slice(0, MAX_AI_RESPONSE_CHARACTERS);
  const isUnqualified = /不合格/.test(rawResult) || stringValue(structuredResult) === "不合格";
  const isQualified = !isUnqualified && /合格/.test(rawResult);
  const reason = stringValue(structuredReason) || (isUnqualified ? extractUnqualifiedReason(rawResult) : isQualified ? "无" : "AI接口未单独返回不合格原因描述");
  return { analysisResult, unqualifiedReasonDescription: reason.slice(0, MAX_AI_RESPONSE_CHARACTERS) };
}

async function attachmentBlob(input: TaskAiAnalysisInput) {
  if (!input.r2StorageId || !input.attachmentObjectKey || !input.attachmentName) throw new TaskAiAnalysisError("该分析任务没有可用的已提交附件");
  const signedUrl = await createTaskAttachmentReadUrl({ r2StorageId: input.r2StorageId, objectKey: input.attachmentObjectKey });
  const response = await fetch(signedUrl, { cache: "no-store", signal: AbortSignal.timeout(ATTACHMENT_DOWNLOAD_TIMEOUT_MILLISECONDS) });
  if (!response.ok) throw new TaskAiAnalysisError(`读取已提交附件失败（HTTP ${response.status}）`);
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_MEDIA_BYTES) throw new TaskAiAnalysisError("已提交附件超过智能分析大小限制");
  const bytes = await response.arrayBuffer();
  if (!bytes.byteLength) throw new TaskAiAnalysisError("已提交附件内容为空");
  if (bytes.byteLength > MAX_MEDIA_BYTES) throw new TaskAiAnalysisError("已提交附件超过智能分析大小限制");
  return new Blob([bytes], { type: input.attachmentMimeType || response.headers.get("content-type") || "application/octet-stream" });
}

export async function analyzeTaskSubmissionItem(input: TaskAiAnalysisInput): Promise<TaskAiAnalysisOutput> {
  if (!input.endpoint.trim()) throw new TaskAiAnalysisError(`系统参数尚未配置“${input.service}”API接口`);
  const kind = serviceKind(input.service, input.dataType);
  let headers: HeadersInit | undefined;
  let body: BodyInit;
  if (kind === "image" || kind === "video") {
    if (input.componentType !== "attachment") throw new TaskAiAnalysisError(`“${input.service}”只能分析附件任务项`);
    if (kind === "image" && input.dataType !== "photo") throw new TaskAiAnalysisError("图片分析任务没有提交图片");
    if (kind === "video" && input.dataType !== "video") throw new TaskAiAnalysisError("视频分析任务没有提交视频");
    const formData = new FormData();
    formData.append("file", await attachmentBlob(input), input.attachmentName || (kind === "image" ? "task-image" : "task-video"));
    formData.append("prompt", input.prompt);
    formData.append("language", "中文");
    formData.append("max_tokens", "1024");
    formData.append("temperature", "0");
    if (kind === "image") formData.append("image_max_side", "1600");
    else {
      formData.append("frame_count", "16");
      formData.append("frame_max_side", "1280");
    }
    body = formData;
  } else {
    const text = input.value?.trim() || "";
    if (!text) throw new TaskAiAnalysisError("该分析任务没有可用的已提交内容");
    headers = { "Content-Type": "application/json" };
    body = JSON.stringify({ text, input: text, prompt: input.prompt, language: "中文", max_tokens: 1024, temperature: 0 });
  }

  let response: Response;
  try {
    response = await fetch(input.endpoint, { method: "POST", headers, body, cache: "no-store", signal: AbortSignal.timeout(AI_REQUEST_TIMEOUT_MILLISECONDS) });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
    throw new TaskAiAnalysisError(timedOut ? "AI接口响应超时" : "无法连接AI接口，请检查系统参数配置及模型服务状态");
  }
  const responseText = await response.text();
  let payload: unknown;
  try { payload = JSON.parse(responseText); }
  catch { throw new TaskAiAnalysisError(response.ok ? "AI接口未返回有效JSON数据" : `AI接口返回 HTTP ${response.status}`); }
  if (!response.ok) throw new TaskAiAnalysisError(`AI接口返回 HTTP ${response.status}`);
  return parseTaskAiAnalysisResponse(payload);
}

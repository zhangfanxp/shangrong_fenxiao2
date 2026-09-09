const VIDEO_TEST_FILE_BASE64 = "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";

type AiApiTestKind = "image" | "video" | "text" | "generic";

export type AiApiTestResult = {
  service: string;
  label: string;
  ok: boolean;
  message: string;
  elapsedMilliseconds: number;
};

const TEST_TIMEOUT_MILLISECONDS = 15 * 60 * 1000;

function createImageTestFile() {
  const width = 224;
  const height = 224;
  const headerSize = 54;
  const rowSize = width * 3;
  const buffer = Buffer.alloc(headerSize + rowSize * height);
  buffer.fill(255, headerSize);
  buffer.write("BM", 0, "ascii");
  buffer.writeUInt32LE(buffer.length, 2);
  buffer.writeUInt32LE(headerSize, 10);
  buffer.writeUInt32LE(40, 14);
  buffer.writeInt32LE(width, 18);
  buffer.writeInt32LE(height, 22);
  buffer.writeUInt16LE(1, 26);
  buffer.writeUInt16LE(24, 28);
  buffer.writeUInt32LE(rowSize * height, 34);

  for (let y = 48; y < 176; y += 1) {
    for (let x = 48; x < 176; x += 1) {
      const isBorder = x < 54 || x >= 170 || y < 54 || y >= 170;
      if (!isBorder) continue;
      const offset = headerSize + y * rowSize + x * 3;
      buffer[offset] = 0;
      buffer[offset + 1] = 0;
      buffer[offset + 2] = 0;
    }
  }
  return buffer;
}

function remoteErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const value = payload as { detail?: unknown; message?: unknown };
  const candidate = typeof value.detail === "string" ? value.detail : typeof value.message === "string" ? value.message : "";
  return candidate.trim().slice(0, 300);
}

async function analyzeResponse(response: Response, kind: AiApiTestKind) {
  const responseText = await response.text();
  let payload: unknown;
  try {
    payload = JSON.parse(responseText);
  } catch {
    throw new Error(response.ok ? "接口未返回有效的 JSON 数据" : `接口返回 HTTP ${response.status}`);
  }

  if (!response.ok) {
    const detail = remoteErrorMessage(payload);
    throw new Error(`接口返回 HTTP ${response.status}${detail ? `：${detail}` : ""}`);
  }

  if (!payload || typeof payload !== "object") throw new Error("接口响应格式不正确");
  const result = payload as { success?: unknown; media_type?: unknown; result?: unknown };
  if (result.success !== true) throw new Error("接口响应未标记为成功");
  if (kind !== "generic" && result.media_type !== kind) {
    const expectedLabel = kind === "image" ? "图片" : kind === "video" ? "视频" : "文字";
    throw new Error(`接口返回的媒体类型不是${expectedLabel}`);
  }
  if (typeof result.result !== "string" || !result.result.trim()) throw new Error("接口调用成功，但分析结果为空");
}

function serviceTestKind(service: string): AiApiTestKind {
  const normalized = service.toLowerCase();
  if (service.includes("图片") || normalized.includes("image")) return "image";
  if (service.includes("视频") || normalized.includes("video")) return "video";
  if (service.includes("文字") || service.includes("文本") || normalized.includes("text")) return "text";
  return "generic";
}

export async function testAiAnalysisApi(service: string, endpoint: string): Promise<AiApiTestResult> {
  const kind = serviceTestKind(service);
  const label = `【${service}】接口`;
  const startedAt = performance.now();

  try {
    let body: BodyInit;
    let headers: HeadersInit | undefined;
    if (kind === "image" || kind === "video") {
      const formData = new FormData();
      const isImage = kind === "image";
      const fileBytes = isImage ? createImageTestFile() : Buffer.from(VIDEO_TEST_FILE_BASE64, "base64");
      formData.append("file", new Blob([fileBytes], { type: isImage ? "image/bmp" : "video/mp4" }), isImage ? "ai-api-test.bmp" : "ai-api-test.mp4");
      formData.append("prompt", isImage ? "请简短描述这张测试图片。" : "请简短描述这个测试视频。");
      formData.append("language", "中文");
      formData.append("max_tokens", "32");
      formData.append("temperature", "0");
      if (isImage) formData.append("image_max_side", "224");
      else {
        formData.append("frame_count", "2");
        formData.append("frame_max_side", "224");
      }
      body = formData;
    } else {
      headers = { "Content-Type": "application/json" };
      body = JSON.stringify({
        text: "这是一段用于验证Ai文字分析接口是否正常工作的测试文本。",
        input: "这是一段用于验证Ai服务接口是否正常工作的测试内容。",
        prompt: kind === "text" ? "请简短分析这段测试文字。" : `请完成一次${service}测试并简短返回结果。`,
        language: "中文",
        max_tokens: 32,
        temperature: 0,
      });
    }
    const response = await fetch(endpoint, { method: "POST", headers, body, cache: "no-store", signal: AbortSignal.timeout(TEST_TIMEOUT_MILLISECONDS) });
    await analyzeResponse(response, kind);
    return { service, label, ok: true, message: `${label}连接正常，已成功返回分析结果。`, elapsedMilliseconds: Math.round(performance.now() - startedAt) };
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
    const connectionFailed = error instanceof TypeError && error.message === "fetch failed";
    const detail = timedOut
      ? "接口响应超时，请确认模型服务正常运行后重试"
      : connectionFailed
        ? "无法连接接口，请确认地址、端口和模型服务运行状态"
        : error instanceof Error ? error.message : "无法连接接口";
    return { service, label, ok: false, message: detail, elapsedMilliseconds: Math.round(performance.now() - startedAt) };
  }
}

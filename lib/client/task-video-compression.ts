"use client";

import { TASK_VIDEO_MAX_BYTES, TASK_VIDEO_TARGET_BITRATE } from "@/lib/task-attachment-rules";

export type PreparedTaskVideo = {
  file: File;
  optimized: boolean;
  durationSeconds: number;
};

function recorderMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  return ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"]
    .find(type => MediaRecorder.isTypeSupported(type)) || "";
}

function outputFileName(name: string, mimeType: string) {
  const extension = mimeType.startsWith("video/mp4") ? "mp4" : "webm";
  return `${name.replace(/\.[^.]+$/, "") || "task-video"}.${extension}`;
}

function promiseWithTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      value => { window.clearTimeout(timer); resolve(value); },
      reason => { window.clearTimeout(timer); reject(reason); },
    );
  });
}

function waitForMetadata(video: HTMLVideoElement, url: string) {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (reason?: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      video.removeEventListener("loadedmetadata", ready);
      video.removeEventListener("durationchange", ready);
      video.removeEventListener("canplay", ready);
      video.removeEventListener("error", failed);
      if (reason) reject(reason); else resolve();
    };
    const ready = () => {
      if (video.readyState >= HTMLMediaElement.HAVE_METADATA && video.videoWidth > 0 && video.videoHeight > 0) finish();
    };
    const failed = () => finish(new Error("无法读取视频，请确认视频已完整保存在手机本地后重新选择"));
    const timer = window.setTimeout(
      () => finish(new Error("读取视频超时，请确认视频已完整保存在手机本地，或重新拍摄后上传")),
      20_000,
    );

    // 手机 Safari 可能会在设置 src 后立即触发 loadedmetadata，因此必须先监听再加载。
    video.addEventListener("loadedmetadata", ready);
    video.addEventListener("durationchange", ready);
    video.addEventListener("canplay", ready);
    video.addEventListener("error", failed);
    video.src = url;
    video.load();
    ready();
  });
}

async function transcodeVideo(video: HTMLVideoElement, file: File, mimeType: string, onProgress?: (percent: number) => void) {
  if (typeof MediaRecorder === "undefined") throw new Error("当前浏览器不支持视频压缩");
  const maximumWidth = 1280; const maximumHeight = 720;
  const scale = Math.min(1, maximumWidth / video.videoWidth, maximumHeight / video.videoHeight);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(2, Math.round(video.videoWidth * scale / 2) * 2);
  canvas.height = Math.max(2, Math.round(video.videoHeight * scale / 2) * 2);
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("当前浏览器无法处理视频画面");
  const outputStream = canvas.captureStream(30);
  let audioContext: AudioContext | undefined;
  try {
    onProgress?.(1);
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) throw new Error("当前浏览器无法保留视频声音");
    audioContext = new AudioContextClass();
    const source = audioContext.createMediaElementSource(video);
    const destination = audioContext.createMediaStreamDestination();
    source.connect(destination);
    destination.stream.getAudioTracks().forEach(track => outputStream.addTrack(track));
    if (audioContext.state === "suspended") {
      await promiseWithTimeout(audioContext.resume(), 10_000, "启动视频声音处理超时，请重新选择视频");
    }
  } catch {
    if (audioContext && audioContext.state !== "closed") await audioContext.close().catch(() => undefined);
    audioContext = undefined;
    outputStream.getTracks().forEach(track => track.stop());
    throw new Error("当前浏览器无法在压缩时保留视频声音");
  }
  const chunks: BlobPart[] = [];
  const recorder = new MediaRecorder(outputStream, {
    mimeType,
    videoBitsPerSecond: TASK_VIDEO_TARGET_BITRATE,
    audioBitsPerSecond: 128_000,
  });
  let animationFrame = 0; let lastProgress = -1;
  const draw = () => {
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const progress = Math.min(99, Math.round(video.currentTime / video.duration * 100));
    if (progress !== lastProgress) { lastProgress = progress; onProgress?.(progress); }
    if (!video.ended) animationFrame = requestAnimationFrame(draw);
  };
  const completed = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    recorder.onerror = () => reject(new Error("视频压缩失败，请重新选择视频"));
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType });
      if (!blob.size) reject(new Error("视频压缩结果为空，请重新选择视频")); else resolve(blob);
    };
  });
  try {
    video.currentTime = 0; video.muted = true; video.playsInline = true;
    recorder.start(1000); animationFrame = requestAnimationFrame(draw);
    await promiseWithTimeout(video.play(), 20_000, "启动视频压缩超时，请保持页面在前台后重试");
    await promiseWithTimeout(new Promise<void>((resolve, reject) => {
      video.addEventListener("ended", () => resolve(), { once: true });
      video.addEventListener("error", () => reject(new Error("视频播放处理失败，请重新选择视频")), { once: true });
    }), Math.max(60_000, Math.ceil(video.duration * 2_000) + 30_000), "视频压缩超时，请保持页面在前台后重试");
    if (recorder.state !== "inactive") recorder.stop();
    const blob = await completed; onProgress?.(100);
    return new File([blob], outputFileName(file.name, blob.type || mimeType), { type: blob.type || mimeType, lastModified: file.lastModified });
  } finally {
    cancelAnimationFrame(animationFrame); video.pause();
    if (recorder.state !== "inactive") recorder.stop();
    outputStream.getTracks().forEach(track => track.stop());
    if (audioContext && audioContext.state !== "closed") await audioContext.close().catch(() => undefined);
  }
}

export async function optimizeTaskVideo(file: File, onProgress?: (percent: number) => void): Promise<PreparedTaskVideo> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "auto"; video.muted = true; video.playsInline = true;
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.style.cssText = "position:fixed;width:1px;height:1px;left:-9999px;top:0;opacity:0;pointer-events:none";
  document.body.appendChild(video);
  try {
    try {
      await waitForMetadata(video, url);
    } catch (error) {
      // 100MB 内的视频仍可安全直传；读取失败时不应让用户永久停留在 0%。
      if (file.size <= TASK_VIDEO_MAX_BYTES) return { file, optimized: false, durationSeconds: 0 };
      throw error;
    }
    const durationSeconds = Number.isFinite(video.duration) ? video.duration : 0;
    if (!durationSeconds) throw new Error("无法读取视频时长，请重新选择视频");
    const estimatedBitrate = file.size * 8 / durationSeconds;
    const alreadyOptimized = video.videoWidth <= 1280 && video.videoHeight <= 720 && estimatedBitrate <= TASK_VIDEO_TARGET_BITRATE * 1.1;
    const mimeType = recorderMimeType();
    if (alreadyOptimized || !mimeType || typeof document.createElement("canvas").captureStream !== "function") {
      if (file.size > TASK_VIDEO_MAX_BYTES) throw new Error(mimeType ? "当前浏览器无法压缩此视频，请更换浏览器或先将视频压缩到100MB以内" : "当前浏览器不支持视频压缩，请先将视频压缩到100MB以内");
      return { file, optimized: false, durationSeconds };
    }
    try {
      const optimizedFile = await transcodeVideo(video, file, mimeType, onProgress);
      if (optimizedFile.size > TASK_VIDEO_MAX_BYTES) throw new Error("视频压缩后仍超过100MB，请缩短视频或降低拍摄画质");
      if (optimizedFile.size >= file.size && file.size <= TASK_VIDEO_MAX_BYTES) return { file, optimized: false, durationSeconds };
      return { file: optimizedFile, optimized: true, durationSeconds };
    } catch (error) {
      if (file.size <= TASK_VIDEO_MAX_BYTES) return { file, optimized: false, durationSeconds };
      throw error;
    }
  } finally {
    video.removeAttribute("src"); video.load(); URL.revokeObjectURL(url);
    video.remove();
  }
}

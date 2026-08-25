"use client";

export async function optimizeTaskPhoto(file: File) {
  if (!/^image\/(?:jpeg|png|webp)$/i.test(file.type) || file.size <= 1024 * 1024) return { file, optimized: false };
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const maximumSide = 1920;
    const scale = Math.min(1, maximumSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) { bitmap.close(); return { file, optimized: false }; }
    context.fillStyle = "#fff"; context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height); bitmap.close();
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", .82));
    if (!blob || blob.size >= file.size) return { file, optimized: false };
    const name = `${file.name.replace(/\.[^.]+$/, "") || "photo"}.jpg`;
    return { file: new File([blob], name, { type: "image/jpeg", lastModified: file.lastModified }), optimized: true };
  } catch {
    return { file, optimized: false };
  }
}

export function putFileWithProgress(input: {
  url: string;
  file: File;
  headers: Record<string, string>;
  onProgress: (percent: number) => void;
}) {
  return new Promise<{ etag: string | null }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", input.url, true);
    xhr.timeout = 10 * 60 * 1000;
    Object.entries(input.headers).forEach(([name, value]) => xhr.setRequestHeader(name, value));
    xhr.upload.onprogress = event => {
      if (event.lengthComputable && event.total > 0) input.onProgress(Math.min(99, Math.round(event.loaded / event.total * 100)));
    };
    xhr.onerror = () => reject(new Error("无法连接R2，请检查网络或存储桶CORS配置"));
    xhr.ontimeout = () => reject(new Error("附件直传超时，请检查网络后重试"));
    xhr.onabort = () => reject(new Error("附件上传已取消"));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        input.onProgress(100); resolve({ etag: xhr.getResponseHeader("ETag") });
      } else reject(new Error(xhr.status === 403 ? "上传地址已过期，请重新上传" : `R2直传失败（${xhr.status || "网络异常"}）`));
    };
    xhr.send(input.file);
  });
}

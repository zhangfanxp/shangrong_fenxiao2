export type TaskAttachmentDataType = "photo" | "video" | "document";

const MiB = 1024 * 1024;

export const TASK_PHOTO_MAX_BYTES = 10 * MiB;
export const TASK_VIDEO_MAX_BYTES = 100 * MiB;
export const TASK_DOCUMENT_MAX_BYTES = 20 * MiB;
export const TASK_VIDEO_SUGGESTED_MIN_SECONDS = 60;
export const TASK_VIDEO_SUGGESTED_MAX_SECONDS = 90;
export const TASK_VIDEO_TARGET_BITRATE = 4_000_000;

export function taskAttachmentMaxBytes(dataType: TaskAttachmentDataType) {
  if (dataType === "photo") return TASK_PHOTO_MAX_BYTES;
  if (dataType === "video") return TASK_VIDEO_MAX_BYTES;
  return TASK_DOCUMENT_MAX_BYTES;
}

export function taskAttachmentMaxMb(dataType: TaskAttachmentDataType) {
  return taskAttachmentMaxBytes(dataType) / MiB;
}

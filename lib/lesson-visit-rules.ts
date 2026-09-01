export const LESSON_VISIT_HEARTBEAT_MS = 30_000;
export const LESSON_VISIT_TIMEOUT_MS = 120_000;
export type LessonVisitStatus = "ACTIVE" | "ENDED" | "INTERRUPTED" | "LEGACY";
export type LessonVisitChannel = "lead-h5" | "store-h5";
export type LessonVisitEvent = "start" | "heartbeat" | "end";
export type LessonVisitEndReason = "BACK" | "NAVIGATION" | "PAGE_HIDE";
export type LessonVisitResponse = { id: string; status: LessonVisitStatus };

export function lessonVisitStatus(visit: { status: string; lastActiveAt: Date | null }, now = new Date()): LessonVisitStatus {
  if (visit.status === "LEGACY") return "LEGACY";
  if (visit.status === "ENDED") return "ENDED";
  if (visit.status === "INTERRUPTED" || !visit.lastActiveAt || now.getTime() - visit.lastActiveAt.getTime() >= LESSON_VISIT_TIMEOUT_MS) return "INTERRUPTED";
  return "ACTIVE";
}

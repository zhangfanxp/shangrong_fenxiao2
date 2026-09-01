import { Prisma, type CourseLessonVisit } from "@prisma/client";
import { effectiveCourseAssignment } from "@/lib/course-assignment-rules";
import { assignmentTransaction } from "@/lib/course-assignments";
import { lessonVisitStatus, type LessonVisitChannel, type LessonVisitEndReason } from "@/lib/lesson-visit-rules";

export class LessonVisitError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export type LessonVisitIdentity = { visitId: string; userId: string; courseId: string; lessonId: string; channel: LessonVisitChannel };

function availableLessonWhere(input: LessonVisitIdentity): Prisma.CourseLessonWhereInput {
  return { id: input.lessonId, courseId: input.courseId, deletedAt: null, course: { deletedAt: null, status: "ENABLED", assignments: { some: effectiveCourseAssignment(input.userId) } } };
}

async function currentVisitStatus(tx: Prisma.TransactionClient, visit: CourseLessonVisit, input: LessonVisitIdentity, now: Date) {
  const status = lessonVisitStatus(visit, now);
  if (visit.status !== "ACTIVE") return status;
  const endReason = status !== "ACTIVE" ? "TIMEOUT"
    : await tx.courseLesson.count({ where: availableLessonWhere(input) }) ? null : "ACCESS_REVOKED";
  if (!endReason) return status;
  await tx.courseLessonVisit.update({ where: { id: visit.id }, data: { status: "INTERRUPTED", endReason } });
  return "INTERRUPTED" as const;
}

export async function ownedLessonVisit(tx: Prisma.TransactionClient, input: LessonVisitIdentity) {
  const visit = await tx.courseLessonVisit.findFirst({ where: { id: input.visitId, userId: input.userId, courseId: input.courseId, lessonId: input.lessonId, channel: input.channel, legacySourceKey: null } });
  if (!visit) throw new LessonVisitError("本次课时学习记录不存在或无权访问", 404);
  return visit;
}

export function assertActiveLessonVisit(visit: CourseLessonVisit, now = new Date()) {
  if (lessonVisitStatus(visit, now) !== "ACTIVE") throw new LessonVisitError("本次课时学习已结束或中断，请重新进入课时", 409);
}

export async function startLessonVisit(input: LessonVisitIdentity) {
  return assignmentTransaction(async tx => {
    const existing = await tx.courseLessonVisit.findUnique({ where: { id: input.visitId } });
    if (existing) {
      const owned = await ownedLessonVisit(tx, input);
      return { id: owned.id, status: await currentVisitStatus(tx, owned, input, new Date()) };
    }
    const lesson = await tx.courseLesson.findFirst({
      where: availableLessonWhere(input),
      select: { chapterName: true, course: { select: { recordNo: true, courseName: true } } },
    });
    if (!lesson?.course) throw new LessonVisitError("当前课程分配已停用或课时不可用，暂时无法继续学习。", 403);
    const user = await tx.user.findUniqueOrThrow({ where: { id: input.userId }, select: { realName: true } });
    const now = new Date();
    const visit = await tx.courseLessonVisit.create({ data: {
      id: input.visitId, userId: input.userId, courseId: input.courseId, lessonId: input.lessonId, channel: input.channel,
      courseRecordNoSnapshot: lesson.course.recordNo, courseNameSnapshot: lesson.course.courseName,
      chapterNameSnapshot: lesson.chapterName, learnerRealNameSnapshot: user.realName,
      startedAt: now, lastActiveAt: now, createdAt: now,
    } });
    return { id: visit.id, status: lessonVisitStatus(visit, now) };
  }, Prisma.TransactionIsolationLevel.Serializable);
}

export async function updateLessonVisit(input: LessonVisitIdentity, event: "heartbeat" | "end", reason: LessonVisitEndReason = "NAVIGATION") {
  return assignmentTransaction(async tx => {
    const visit = await ownedLessonVisit(tx, input);
    const now = new Date();
    // Finishing an owned visit remains allowed after entitlement is revoked.
    // A heartbeat must not keep a revoked assignment "learning" indefinitely.
    const status = await currentVisitStatus(tx, visit, input, now);
    if (status !== "ACTIVE") return { id: visit.id, status };
    const updated = await tx.courseLessonVisit.update({ where: { id: visit.id }, data: event === "end"
      ? { status: "ENDED", endedAt: now, lastActiveAt: now, endReason: reason }
      : { lastActiveAt: now } });
    return { id: updated.id, status: lessonVisitStatus(updated, now) };
  }, Prisma.TransactionIsolationLevel.Serializable);
}

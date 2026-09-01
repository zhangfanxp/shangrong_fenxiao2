import { CoursewareType, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { CourseAssetMetadata } from "@/lib/course-r2";
import { formatFileSize } from "@/lib/course-management";
import { effectiveCourseAssignment } from "@/lib/course-assignment-rules";
import { assignmentTransaction } from "@/lib/course-assignments";
import { assertActiveLessonVisit, ownedLessonVisit } from "@/lib/lesson-learning-visits";

export type MobileCourseChannel = "lead-h5" | "store-h5";

export class MobileCourseError extends Error {}

function assetPath(channel: MobileCourseChannel, values: Record<string, string>) {
  return `/api/${channel}/online-course-files?${new URLSearchParams(values).toString()}`;
}

function courseWhere(courseId: string, userId: string) {
  return {
    id: courseId,
    status: "ENABLED",
    deletedAt: null,
    assignments: { some: effectiveCourseAssignment(userId) },
  } as const;
}

async function unavailableCourse(courseId: string, userId: string): Promise<never> {
  const course = await db.course.findFirst({ where: { id: courseId, deletedAt: null, assignments: { some: { userId } } }, select: { status: true } });
  if (course?.status === "ENABLED") throw new MobileCourseError("当前课程分配已停用，暂时无法继续学习。");
  throw new MobileCourseError("课程不存在、已禁用、已删除或当前用户无权访问");
}

export async function mobileAssignedCourses(userId: string, channel: MobileCourseChannel) {
  const courses = await db.course.findMany({
    where: { status: "ENABLED", deletedAt: null, assignments: { some: effectiveCourseAssignment(userId) } },
    select: {
      id: true,
      recordNo: true,
      courseName: true,
      courseDescription: true,
      applicablePosition: true,
      status: true,
      lessons: {
        where: { deletedAt: null },
        select: { id: true, learningProgress: { where: { userId }, select: { completedAt: true } } },
      },
      learningProgress: { where: { userId }, select: { progress: true, completedAt: true } },
      assignments: { where: effectiveCourseAssignment(userId), select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  return courses.map(course => {
    const lessonCount = course.lessons.length;
    const completedLessons = course.lessons.filter(lesson => Boolean(lesson.learningProgress[0]?.completedAt)).length;
    const calculatedProgress = lessonCount ? Math.round(completedLessons / lessonCount * 100) : 0;
    const storedProgress = course.learningProgress[0]?.progress || 0;
    return {
      id: course.id,
      recordNo: course.recordNo,
      courseName: course.courseName,
      courseDescription: course.courseDescription,
      applicablePosition: course.applicablePosition,
      status: course.status,
      lessonCount,
      completedLessons,
      progress: Math.max(calculatedProgress, storedProgress),
      completed: Boolean(course.learningProgress[0]?.completedAt) || lessonCount > 0 && completedLessons === lessonCount,
      assignedAt: course.assignments[0]?.createdAt.toISOString() || null,
      coverUrl: assetPath(channel, { courseId: course.id, kind: "cover" }),
    };
  });
}

export async function mobileAssignedCourseDetail(courseId: string, userId: string, channel: MobileCourseChannel) {
  const course = await db.course.findFirst({
    where: courseWhere(courseId, userId),
    select: {
      id: true,
      recordNo: true,
      courseName: true,
      courseDescription: true,
      applicablePosition: true,
      status: true,
      brands: { select: { brandLabel: true }, orderBy: { brandLabel: "asc" } },
      lessons: {
        where: { deletedAt: null },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        select: {
          id: true,
          recordNo: true,
          chapterName: true,
          chapterDescription: true,
          coursewareType: true,
          sortOrder: true,
          fileSizeBytes: true,
          learningProgress: { where: { userId }, select: { progressSeconds: true, completedAt: true } },
        },
      },
    },
  });
  if (!course) return unavailableCourse(courseId, userId);
  const completedLessons = course.lessons.filter(lesson => Boolean(lesson.learningProgress[0]?.completedAt)).length;
  return {
    id: course.id,
    recordNo: course.recordNo,
    courseName: course.courseName,
    courseDescription: course.courseDescription,
    applicablePosition: course.applicablePosition,
    status: course.status,
    brands: course.brands.map(brand => brand.brandLabel),
    coverUrl: assetPath(channel, { courseId: course.id, kind: "cover" }),
    lessonCount: course.lessons.length,
    completedLessons,
    progress: course.lessons.length ? Math.round(completedLessons / course.lessons.length * 100) : 0,
    lessons: course.lessons.map(lesson => ({
      id: lesson.id,
      recordNo: lesson.recordNo,
      chapterName: lesson.chapterName,
      chapterDescription: lesson.chapterDescription,
      coursewareType: lesson.coursewareType,
      coursewareTypeText: coursewareTypeText(lesson.coursewareType),
      sortOrder: lesson.sortOrder,
      fileSizeText: formatFileSize(lesson.fileSizeBytes),
      progressSeconds: lesson.learningProgress[0]?.progressSeconds || 0,
      completed: Boolean(lesson.learningProgress[0]?.completedAt),
      coverUrl: assetPath(channel, { courseId: course.id, lessonId: lesson.id, kind: "cover" }),
    })),
  };
}

export async function mobileAssignedLessonDetail(courseId: string, lessonId: string, userId: string, channel: MobileCourseChannel) {
  const lesson = await db.courseLesson.findFirst({
    where: { id: lessonId, courseId, deletedAt: null, course: courseWhere(courseId, userId) },
    select: {
      id: true,
      recordNo: true,
      chapterName: true,
      chapterDescription: true,
      coursewareType: true,
      originalFileName: true,
      fileSizeBytes: true,
      mimeType: true,
      remark: true,
      sortOrder: true,
      course: { select: { id: true, courseName: true } },
      learningProgress: { where: { userId }, select: { progressSeconds: true, completedAt: true } },
    },
  });
  if (!lesson?.course) {
    const accessible = await db.course.count({ where: courseWhere(courseId, userId) });
    if (!accessible) return unavailableCourse(courseId, userId);
    throw new MobileCourseError("课时不存在或当前用户无权访问");
  }
  return {
    id: lesson.id,
    recordNo: lesson.recordNo,
    courseId: lesson.course.id,
    courseName: lesson.course.courseName,
    chapterName: lesson.chapterName,
    chapterDescription: lesson.chapterDescription,
    coursewareType: lesson.coursewareType,
    coursewareTypeText: coursewareTypeText(lesson.coursewareType),
    originalFileName: lesson.originalFileName,
    fileSizeText: formatFileSize(lesson.fileSizeBytes),
    mimeType: lesson.mimeType,
    remark: lesson.remark,
    sortOrder: lesson.sortOrder,
    progressSeconds: lesson.learningProgress[0]?.progressSeconds || 0,
    completed: Boolean(lesson.learningProgress[0]?.completedAt),
    coverUrl: assetPath(channel, { courseId, lessonId, kind: "cover" }),
    fileUrl: assetPath(channel, { courseId, lessonId, kind: "file" }),
  };
}

export type MobileCourseAsset =
  | { kind: "R2"; metadata: CourseAssetMetadata }
  | { kind: "DATA_URL"; dataUrl: string };

export async function mobileCourseAsset(input: {
  courseId: string;
  lessonId?: string | null;
  kind: "cover" | "file";
  userId: string;
}): Promise<MobileCourseAsset> {
  const course = await db.course.findFirst({
    where: courseWhere(input.courseId, input.userId),
    select: {
      coverR2StorageId: true,
      coverObjectKey: true,
      coverOriginalName: true,
      coverMimeType: true,
      coverSizeBytes: true,
      coverDataUrl: true,
    },
  });
  if (!course) return unavailableCourse(input.courseId, input.userId);
  if (!input.lessonId) {
    if (input.kind !== "cover") throw new MobileCourseError("课程资源参数不正确");
    if (course.coverR2StorageId && course.coverObjectKey && course.coverOriginalName && course.coverMimeType && course.coverSizeBytes) {
      return { kind: "R2", metadata: { r2StorageId: course.coverR2StorageId, objectKey: course.coverObjectKey, originalName: course.coverOriginalName, mimeType: course.coverMimeType, size: course.coverSizeBytes } };
    }
    if (course.coverDataUrl) return { kind: "DATA_URL", dataUrl: course.coverDataUrl };
    throw new MobileCourseError("课程封面不存在");
  }
  const lesson = await db.courseLesson.findFirst({ where: { id: input.lessonId, courseId: input.courseId, deletedAt: null } });
  if (!lesson) throw new MobileCourseError("课时资源不存在或当前用户无权访问");
  if (input.kind === "file") return { kind: "R2", metadata: { r2StorageId: lesson.fileR2StorageId, objectKey: lesson.fileObjectKey, originalName: lesson.originalFileName, mimeType: lesson.mimeType, size: lesson.fileSizeBytes } };
  if (lesson.coverR2StorageId && lesson.coverObjectKey && lesson.coverOriginalName && lesson.coverMimeType && lesson.coverSizeBytes) {
    return { kind: "R2", metadata: { r2StorageId: lesson.coverR2StorageId, objectKey: lesson.coverObjectKey, originalName: lesson.coverOriginalName, mimeType: lesson.coverMimeType, size: lesson.coverSizeBytes } };
  }
  if (lesson.coverDataUrl) return { kind: "DATA_URL", dataUrl: lesson.coverDataUrl };
  throw new MobileCourseError("课时封面不存在");
}

export function dataUrlResponse(dataUrl: string) {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(dataUrl);
  if (!match) throw new MobileCourseError("课程封面数据格式不正确");
  return new Response(Buffer.from(match[2].replace(/[\r\n]/g, ""), "base64"), {
    headers: { "Content-Type": match[1], "Cache-Control": "private, max-age=3600" },
  });
}

export async function saveMobileLessonProgress(input: {
  visitId: string;
  channel: MobileCourseChannel;
  courseId: string;
  lessonId: string;
  userId: string;
  progressSeconds: number;
  completed: boolean;
}) {
  return assignmentTransaction(async tx => {
    const lesson = await tx.courseLesson.findFirst({
      where: { id: input.lessonId, courseId: input.courseId, deletedAt: null, course: courseWhere(input.courseId, input.userId) },
      select: { id: true, courseId: true },
    });
    if (!lesson?.courseId) throw new MobileCourseError("当前课程分配已停用或课时不可用，暂时无法继续学习。");
    const visit = await ownedLessonVisit(tx, input);
    assertActiveLessonVisit(visit);
    const previous = await tx.courseLessonProgress.findUnique({ where: { lessonId_userId: { lessonId: lesson.id, userId: input.userId } } });
    const earliestLegacyLearning = await tx.courseLessonProgress.findFirst({
      where: { userId: input.userId, lesson: { courseId: input.courseId }, OR: [{ progressSeconds: { gt: 0 } }, { completedAt: { not: null } }] },
      orderBy: { createdAt: "asc" }, select: { createdAt: true },
    });
    const completedAt = previous?.completedAt || (input.completed ? new Date() : null);
    const progressSeconds = Math.max(previous?.progressSeconds || 0, input.progressSeconds);
    const lessonProgress = await tx.courseLessonProgress.upsert({
      where: { lessonId_userId: { lessonId: lesson.id, userId: input.userId } },
      create: { lessonId: lesson.id, userId: input.userId, progressSeconds, completedAt },
      update: { progressSeconds, ...(completedAt ? { completedAt } : {}) },
    });
    const [lessonCount, completedLessons, previousCourseProgress] = await Promise.all([
      tx.courseLesson.count({ where: { courseId: input.courseId, deletedAt: null } }),
      tx.courseLessonProgress.count({ where: { userId: input.userId, completedAt: { not: null }, lesson: { courseId: input.courseId, deletedAt: null } } }),
      tx.courseLearningProgress.findUnique({ where: { courseId_userId: { courseId: input.courseId, userId: input.userId } } }),
    ]);
    const calculated = lessonCount ? Math.min(100, Math.round(completedLessons / lessonCount * 100)) : 0;
    const courseProgress = Math.max(previousCourseProgress?.progress || 0, calculated);
    const courseCompletedAt = previousCourseProgress?.completedAt || (lessonCount > 0 && completedLessons === lessonCount ? new Date() : null);
    const validLearning = progressSeconds > 0 || Boolean(completedAt);
    const now = new Date();
    const learner = validLearning && !previousCourseProgress?.firstLearnedAt
      ? await tx.user.findUnique({ where: { id: input.userId }, select: { realName: true } }) : null;
    const learningMetadata = validLearning ? {
      firstLearnedAt: previousCourseProgress?.firstLearnedAt || earliestLegacyLearning?.createdAt || (previousCourseProgress && (previousCourseProgress.progress > 0 || previousCourseProgress.completedAt) ? previousCourseProgress.createdAt : now),
      lastLearnedAt: now,
      learnerRealNameSnapshot: previousCourseProgress?.learnerRealNameSnapshot || learner?.realName,
    } : {};
    await tx.courseLearningProgress.upsert({
      where: { courseId_userId: { courseId: input.courseId, userId: input.userId } },
      create: { courseId: input.courseId, userId: input.userId, progress: courseProgress, completedAt: courseCompletedAt, ...learningMetadata },
      update: { progress: courseProgress, ...(courseCompletedAt ? { completedAt: courseCompletedAt } : {}), ...learningMetadata },
    });
    await tx.courseLessonVisit.update({ where: { id: visit.id }, data: { lastActiveAt: now } });
    return { progressSeconds: lessonProgress.progressSeconds, completed: Boolean(lessonProgress.completedAt), newlyCompleted: !previous?.completedAt && Boolean(lessonProgress.completedAt), courseProgress };
  }, Prisma.TransactionIsolationLevel.Serializable);
}

export function coursewareTypeText(type: CoursewareType) {
  return ({ VIDEO: "视频", AUDIO: "音频", PDF: "PDF文档", PPT: "PPT文档" } as const)[type];
}

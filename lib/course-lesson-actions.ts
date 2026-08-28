import { Prisma } from "@prisma/client";
import type { Session } from "@/lib/auth";
import { assetTypeForCourseware, lessonInclude, nextLessonRecordNo, resolveCoverInput, serializeLesson, type LessonInput } from "@/lib/course-management";
import { verifyConfirmedCourseAsset } from "@/lib/course-r2";
import { db } from "@/lib/db";

export async function createCourseLesson(input: LessonInput, session: Session, parent: { courseId?: string; courseDraftId?: string }) {
  if (input.cover.kind === "EXISTING" || "kind" in input.file) throw new Error("上传中的课件尚未完成");
  const [cover, file] = await Promise.all([
    resolveCoverInput(input.cover, "LESSON_COVER", null, session.userId),
    verifyConfirmedCourseAsset(assetTypeForCourseware(input.coursewareType), input.file, session.userId, input.file.uploadProof),
  ]);
  const parentWhere = parent.courseId ? { courseId: parent.courseId } : { courseDraftId: parent.courseDraftId };
  return db.$transaction(async tx => {
    const aggregate = await tx.courseLesson.aggregate({ where: parentWhere, _max: { sortOrder: true } });
    const recordNo = await nextLessonRecordNo(tx);
    const lesson = await tx.courseLesson.create({ data: {
      recordNo, ...parent, chapterName: input.chapterName, chapterDescription: input.chapterDescription || null, ...cover,
      coursewareType: input.coursewareType, fileR2StorageId: file.r2StorageId, originalFileName: file.originalName,
      fileObjectKey: file.objectKey, fileSizeBytes: file.size, mimeType: file.mimeType, remark: input.remark || null,
      sortOrder: (aggregate._max.sortOrder || 0) + 1, createdByUserId: session.userId, createdByName: session.realName,
    }, include: lessonInclude });
    return serializeLesson(lesson);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15000 });
}

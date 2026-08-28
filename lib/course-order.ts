import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export async function reorderLessons(parent: { courseId?: string; courseDraftId?: string }, lessonIds: string[], versions?: Record<string, number>) {
  if (!lessonIds.length || new Set(lessonIds).size !== lessonIds.length) throw new Error("课时顺序参数不正确");
  return db.$transaction(async tx => {
    const rows = await tx.courseLesson.findMany({ where: { ...parent, deletedAt: null }, select: { id: true, version: true } });
    if (rows.length !== lessonIds.length || rows.some(row => !lessonIds.includes(row.id))) throw new Error("课时顺序已被其他用户修改，请刷新后重试");
    if (versions && rows.some(row => versions[row.id] !== row.version)) throw new Error("课时顺序已被其他用户修改，请刷新后重试");
    const maximum = await tx.courseLesson.aggregate({ where: parent, _max: { sortOrder: true } });
    const temporaryBase = Math.max(maximum._max.sortOrder || 0, lessonIds.length) + lessonIds.length + 1;
    for (let index = 0; index < lessonIds.length; index += 1) await tx.courseLesson.update({ where: { id: lessonIds[index] }, data: { sortOrder: temporaryBase + index } });
    for (let index = 0; index < lessonIds.length; index += 1) await tx.courseLesson.update({ where: { id: lessonIds[index] }, data: { sortOrder: index + 1, version: { increment: 1 } } });
    return tx.courseLesson.findMany({ where: { ...parent, deletedAt: null }, orderBy: { sortOrder: "asc" } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 });
}

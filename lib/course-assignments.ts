import { Prisma, type Course, type CourseAssignmentBatch } from "@prisma/client";
import type { Session } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatShanghaiDateTime } from "@/lib/course-management";
import { assignmentDateError, type AssignmentFilters, type AssignmentLearningRow, type AssignmentStatus } from "@/lib/course-assignment-rules";
import { assignmentAccess, assignmentBatchScope, assignmentScopeCatalog, assignmentUserSelect, scopeIsAllowed, snapshotUserScopes } from "@/lib/course-assignment-scope";
import { shanghaiDateTime, writeOperationLogWithTransaction } from "@/lib/operation-log";
import { lessonVisitStatus } from "@/lib/lesson-visit-rules";

export class AssignmentError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function assignmentFilterWhere(search: URLSearchParams): Prisma.CourseAssignmentBatchWhereInput {
  const filters: AssignmentFilters = Object.fromEntries(["courseName", "assigneeKeyword", "assignStartDate", "assignEndDate"].map(key => [key, search.get(key)?.trim() || undefined]));
  const dateError = assignmentDateError(filters.assignStartDate, filters.assignEndDate);
  if (dateError) throw new AssignmentError(dateError);
  if ((filters.courseName?.length || 0) > 100 || (filters.assigneeKeyword?.length || 0) > 100) throw new AssignmentError("筛选关键词不能超过100个字符");
  return {
    ...(filters.courseName ? { courses: { some: { courseNameSnapshot: { contains: filters.courseName } } } } : {}),
    ...(filters.assigneeKeyword ? { users: { some: { realNameSnapshot: { contains: filters.assigneeKeyword } } } } : {}),
    ...((filters.assignStartDate || filters.assignEndDate) ? { assignedAt: {
      ...(filters.assignStartDate ? { gte: new Date(`${filters.assignStartDate}T00:00:00+08:00`) } : {}),
      ...(filters.assignEndDate ? { lt: new Date(new Date(`${filters.assignEndDate}T00:00:00+08:00`).getTime() + 86_400_000) } : {}),
    } } : {}),
  };
}

export function assignmentPagination(search: URLSearchParams) {
  const page = Number(search.get("page") || 1);
  const pageSize = Number(search.get("pageSize") || 20);
  if (!Number.isSafeInteger(page) || page < 1 || page > 1_000_000 || ![20, 50, 100].includes(pageSize)) throw new AssignmentError("分页参数不正确");
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function serializeAssignment(batch: CourseAssignmentBatch) {
  return {
    id: batch.id, recordNo: batch.recordNo, courseCount: batch.courseCount, userCount: batch.userCount,
    assignedByName: batch.assignedByName, assignedAt: batch.assignedAt.toISOString(), assignedAtText: formatShanghaiDateTime(batch.assignedAt),
    status: batch.status, version: batch.version, legacyImported: batch.legacyImported,
  };
}

export async function nextAssignmentRecordNo(tx: Prisma.TransactionClient, now = new Date()) {
  const { dateKey } = shanghaiDateTime(now);
  const sequence = await tx.courseAssignmentSequence.upsert({ where: { dateKey }, create: { dateKey, nextValue: 2 }, update: { nextValue: { increment: 1 } } });
  if (sequence.nextValue > 10000) throw new AssignmentError("当日课程分配流水号已达到上限");
  return `${dateKey}${String(sequence.nextValue - 1).padStart(4, "0")}`;
}

export function assignmentCourseSnapshot(course: Course) {
  return {
    courseId: course.id, courseRecordNoSnapshot: course.recordNo, courseNameSnapshot: course.courseName,
    applicablePositionSnapshot: course.applicablePosition, coverR2StorageId: course.coverR2StorageId,
    coverObjectKey: course.coverObjectKey, coverOriginalName: course.coverOriginalName, coverMimeType: course.coverMimeType,
    coverSizeBytes: course.coverSizeBytes, coverDataUrl: course.coverDataUrl,
  };
}

export async function assignmentTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>, isolationLevel: Prisma.TransactionIsolationLevel = Prisma.TransactionIsolationLevel.ReadCommitted): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await db.$transaction(fn, { isolationLevel, maxWait: 10000, timeout: 30000 }); }
    catch (error) {
      if (attempt < 4 && error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(error.code)) {
        await new Promise(resolve => setTimeout(resolve, 25 * 2 ** attempt + Math.floor(Math.random() * 50)));
        continue;
      }
      throw error;
    }
  }
}

export async function createAssignmentBatch(input: { courseIds: string[]; userIds: string[]; clientRequestId: string }, session: Session, request?: Request) {
  const courseIds = [...new Set(input.courseIds)].sort();
  const userIds = [...new Set(input.userIds)].sort();
  const access = await assignmentAccess(session);
  return assignmentTransaction(async tx => {
    const existing = await tx.courseAssignmentBatch.findUnique({ where: { clientRequestId: input.clientRequestId }, include: { courses: { select: { courseId: true } }, users: { select: { userId: true } } } });
    if (existing) {
      if (existing.assignedByUserId !== session.userId || JSON.stringify(existing.courses.map(c => c.courseId).sort()) !== JSON.stringify(courseIds) || JSON.stringify(existing.users.map(u => u.userId).sort()) !== JSON.stringify(userIds)) throw new AssignmentError("分配请求已发生变化，请重新打开分配窗口", 409);
      return { ...serializeAssignment(existing), created: 0, skipped: 0, replayed: true };
    }
    const [courses, users, { stores, brands }] = await Promise.all([
      tx.course.findMany({ where: { id: { in: courseIds }, deletedAt: null } }),
      tx.user.findMany({ where: { id: { in: userIds } }, select: assignmentUserSelect }),
      assignmentScopeCatalog(tx),
    ]);
    if (courses.length !== courseIds.length) throw new AssignmentError("所选课程包含不存在或已删除的记录，请刷新后重试");
    if (courses.some(course => course.status !== "ENABLED")) throw new AssignmentError("仅支持分配启用状态的课程，所选课程包含已禁用记录，请刷新后重试");
    if (users.length !== userIds.length) throw new AssignmentError("所选用户包含不存在的记录，请刷新后重试");
    const recipients = users.map(user => ({ user, scopes: snapshotUserScopes(user, stores, brands) }));
    if (recipients.some(recipient => !scopeIsAllowed(recipient.scopes, access))) throw new AssignmentError("所选用户超出当前品牌或门店数据权限", 403);
    const now = new Date();
    const batch = await tx.courseAssignmentBatch.create({ data: {
      recordNo: await nextAssignmentRecordNo(tx, now), clientRequestId: input.clientRequestId,
      courseCount: courseIds.length, userCount: userIds.length, assignedByUserId: session.userId,
      assignedByUsername: session.username, assignedByName: session.realName, assignedAt: now,
      courses: { create: courses.map(assignmentCourseSnapshot) },
      users: { create: recipients.map(({ user, scopes }) => ({ userId: user.id, usernameSnapshot: user.username, realNameSnapshot: user.realName, roleSnapshot: user.role.name, scopes: { create: scopes } })) },
    } });
    // Deduplicate only within this batch; other batches share progress, not entitlement.
    await tx.courseAssignment.createMany({ data: courseIds.flatMap(courseId => userIds.map(userId => ({ batchId: batch.id, courseId, userId, assignedByUserId: session.userId, assignedByName: session.realName, createdAt: now }))) });
    await writeOperationLogWithTransaction(tx, { userId: session.userId, username: session.username, page: "课程管理", action: "课程分配", result: "成功", detail: `批次：${batch.recordNo}；课程数量：${batch.courseCount}；用户数量：${batch.userCount}`, request });
    return { ...serializeAssignment(batch), created: courseIds.length * userIds.length, skipped: 0, replayed: false };
  });
}

export async function visibleAssignment(id: string, session: Session, client: Prisma.TransactionClient = db) {
  const scope = assignmentBatchScope(await assignmentAccess(session));
  const batch = await client.courseAssignmentBatch.findFirst({ where: { AND: [{ id }, scope] } });
  if (!batch) throw new AssignmentError("课程分配记录不存在或无权访问", 404);
  return batch;
}

export async function changeAssignmentStatus(id: string, version: number, target: AssignmentStatus, session: Session, action: string, request?: Request) {
  const scope = assignmentBatchScope(await assignmentAccess(session));
  return assignmentTransaction(async tx => {
    const batch = await tx.courseAssignmentBatch.findFirst({ where: { AND: [{ id }, scope] } });
    if (!batch) throw new AssignmentError("课程分配记录不存在或无权操作", 404);
    if (batch.version !== version) throw new AssignmentError("当前课程分配记录状态已发生变化，请刷新后重新操作", 409);
    const skipped = batch.status === target;
    if (!skipped) {
      const result = await tx.courseAssignmentBatch.updateMany({ where: { id, version, status: batch.status }, data: { status: target, version: { increment: 1 } } });
      if (result.count !== 1) throw new AssignmentError("当前课程分配记录状态已发生变化，请刷新后重新操作", 409);
    }
    await writeOperationLogWithTransaction(tx, { userId: session.userId, username: session.username, page: "课程分配记录", action, result: "成功", detail: `批次：${batch.recordNo}；课程数量：${batch.courseCount}；用户数量：${batch.userCount}；${batch.status} → ${target}${skipped ? "（无需变更）" : ""}`, request });
    return { id, recordNo: batch.recordNo, outcome: skipped ? "skipped" as const : "changed" as const };
  });
}

export async function changeAssignmentStatuses(items: { id: string; version: number }[], target: AssignmentStatus, session: Session, action: string, request?: Request) {
  const results = [];
  for (const item of items) {
    try { results.push(await changeAssignmentStatus(item.id, item.version, target, session, action, request)); }
    catch (error) {
      results.push({ id: item.id, outcome: "failed" as const, message: error instanceof AssignmentError ? error.message : `课程分配${target === "ENABLED" ? "启用" : "停用"}失败，请稍后重试` });
    }
  }
  return {
    changed: results.filter(row => row.outcome === "changed").length,
    skipped: results.filter(row => row.outcome === "skipped").length,
    failed: results.filter(row => row.outcome === "failed").length,
    results,
  };
}

export async function assignmentLearningRows(batchId: string, courseId: string, unlearned: boolean, search: URLSearchParams, session: Session): Promise<{ rows: AssignmentLearningRow[]; total: number; page: number; pageSize: number }> {
  await visibleAssignment(batchId, session);
  const { page, pageSize, skip, take } = assignmentPagination(search);
  return db.$transaction(async tx => {
    const course = await tx.courseAssignmentCourse.findUnique({ where: { batchId_courseId: { batchId, courseId } } });
    if (!course) throw new AssignmentError("当前批次未分配该课程", 404);
    const recipients = await tx.courseAssignmentUser.findMany({ where: { batchId }, select: { userId: true, realNameSnapshot: true } });
    const ids = recipients.map(user => user.userId);
    if (!unlearned) {
      const where = { courseId, userId: { in: ids } };
      const [visits, total] = await Promise.all([
        tx.courseLessonVisit.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip, take }),
        tx.courseLessonVisit.count({ where }),
      ]);
      const now = new Date();
      return { rows: visits.map(visit => ({
        id: visit.id, userId: visit.userId, realName: visit.learnerRealNameSnapshot,
        recordNo: course.courseRecordNoSnapshot, courseName: course.courseNameSnapshot,
        chapterName: visit.chapterNameSnapshot,
        startedAt: visit.startedAt ? formatShanghaiDateTime(visit.startedAt) : null,
        endedAt: visit.endedAt ? formatShanghaiDateTime(visit.endedAt) : null,
        lastActiveAt: visit.lastActiveAt ? formatShanghaiDateTime(visit.lastActiveAt) : null,
        visitStatus: lessonVisitStatus(visit, now),
      })), total, page, pageSize };
    }
    const progress = await tx.courseLearningProgress.findMany({ where: { courseId, userId: { in: ids } }, select: { userId: true, firstLearnedAt: true, learnerRealNameSnapshot: true, createdAt: true, progress: true, completedAt: true } });
    // Legacy progress may lack firstLearnedAt. A zero-duration open is not learning;
    // positive lesson progress/completion is the fallback evidence (including removed lessons).
    const lessons = await tx.courseLessonProgress.findMany({ where: { userId: { in: ids }, lesson: { courseId }, OR: [{ progressSeconds: { gt: 0 } }, { completedAt: { not: null } }] }, select: { userId: true, createdAt: true }, orderBy: { createdAt: "asc" } });
    const learned = new Map<string, { time: Date; realName?: string | null }>();
    for (const row of progress) if (row.firstLearnedAt || row.progress > 0 || row.completedAt) learned.set(row.userId, { time: row.firstLearnedAt || row.createdAt, realName: row.learnerRealNameSnapshot });
    for (const lesson of lessons) if (!learned.has(lesson.userId)) learned.set(lesson.userId, { time: lesson.createdAt });
    const rows = recipients.filter(user => !learned.has(user.userId)).sort((a, b) =>
      a.realNameSnapshot.localeCompare(b.realNameSnapshot, "zh-CN") || a.userId.localeCompare(b.userId)).map(user => ({
      id: user.userId, userId: user.userId, realName: user.realNameSnapshot,
    }));
    return { rows: rows.slice(skip, skip + take), total: rows.length, page, pageSize };
  });
}

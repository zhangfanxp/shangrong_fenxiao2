import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "../lib/db";
import type { Session } from "../lib/auth";
import { canAccessPath } from "../lib/access-control";
import { assignmentActions, assignmentDateError, canCourseAssignment } from "../lib/course-assignment-rules";
import { assignmentAccess, assignmentBatchScope, assignmentSelectableUserScope } from "../lib/course-assignment-scope";
import { AssignmentError, assignmentFilterWhere, assignmentLearningRows, assignmentPagination, changeAssignmentStatus, changeAssignmentStatuses, createAssignmentBatch, visibleAssignment } from "../lib/course-assignments";
import { mobileAssignedCourses, mobileAssignedCourseDetail, mobileAssignedLessonDetail, mobileCourseAsset, saveMobileLessonProgress as persistProgress } from "../lib/mobile-online-courses";
import { startLessonVisit } from "../lib/lesson-learning-visits";
import { verifyLessonVisits } from "./verify-lesson-visits";

const visitIds = new Map<string, string>();
async function saveMobileLessonProgress(input: Omit<Parameters<typeof persistProgress>[0], "visitId" | "channel">) {
  const key = `${input.userId}:${input.lessonId}`;
  let visitId = visitIds.get(key);
  if (!visitId) {
    visitId = randomUUID();
    await startLessonVisit({ ...input, visitId, channel: "lead-h5" });
    visitIds.set(key, visitId);
  }
  return persistProgress({ ...input, visitId, channel: "lead-h5" });
}

async function main() {
  const url = new URL(process.env.DATABASE_URL || "");
  assert(["127.0.0.1", "localhost"].includes(url.hostname) && /^\/canyin_assignment_test_[a-z0-9_]+$/.test(url.pathname), "Only an isolated local canyin_assignment_test_* database is allowed");
  assert.equal(await db.user.count(), 0, "Test database must be empty; this script never resets existing data");
  const passwordHash = await bcrypt.hash("AssignmentTest-2026!", 10);
  const role = await db.role.create({ data: { code: "SUPER_ADMIN", name: "测试管理员", permissions: ["*"] } });
  const brand = await db.brand.create({ data: { code: "QA_A", name: "测试品牌甲" } });
  const otherBrand = await db.brand.create({ data: { code: "QA_B", name: "测试品牌乙" } });
  const store = await db.store.create({ data: { recordNo: "QA_STORE", name: "测试门店甲", brandId: brand.id, cooperationType: "DIRECT" } });
  const admin = await db.user.create({ data: { username: "assignment_qa", realName: "测试分配人", roleId: role.id, passwordHash } });
  const learner = await db.user.create({ data: { username: "qa_zhang", realName: "张三", roleId: role.id, passwordHash, leadH5BrandIds: [brand.id], leadH5StoreIds: [store.id] } });
  const unlearned = await db.user.create({ data: { username: "qa_li", realName: "李四", roleId: role.id, passwordHash, leadH5BrandIds: [brand.id], leadH5StoreIds: [store.id] } });
  const outsider = await db.user.create({ data: { username: "qa_wang", realName: "王五", roleId: role.id, passwordHash, leadH5BrandIds: [otherBrand.id] } });
  const restrictedRole = await db.role.create({ data: { code: "QA_LIMITED", name: "测试品牌管理员", permissions: assignmentActions.map(action => `course-assignments:${action}`) } });
  const restricted = await db.user.create({ data: { username: "qa_restricted", realName: "品牌甲管理员", roleId: restrictedRole.id, passwordHash, leadH5BrandIds: [brand.id], leadH5StoreIds: [store.id] } });
  const session: Session = { userId: admin.id, username: admin.username, realName: admin.realName, role: role.code, permissions: ["*"] };
  const scoped: Session = { userId: restricted.id, username: restricted.username, realName: restricted.realName, role: restrictedRole.code, permissions: ["course-assignments:query", "course-assignments:view"] };
  const coverDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2lz8AAAAASUVORK5CYII=";
  const course = await db.course.create({ data: { recordNo: "202608310001", courseName: "消防安全培训", applicablePosition: "店长", createdByName: admin.realName, coverDataUrl } });
  const second = await db.course.create({ data: { recordNo: "202608310002", courseName: "门店卫生规范", applicablePosition: "全员", createdByName: admin.realName, coverDataUrl } });
  const lesson = await db.courseLesson.create({ data: { recordNo: "202608310001", courseId: course.id, chapterName: "消防第一课", coursewareType: "VIDEO", fileR2StorageId: "qa", originalFileName: "test.mp4", fileObjectKey: "qa/test.mp4", fileSizeBytes: 1, mimeType: "video/mp4", sortOrder: 1, createdByName: admin.realName } });
  const request = new Request("http://localhost/qa");
  const input = { courseIds: [course.id, second.id, course.id], userIds: [learner.id, unlearned.id, learner.id], clientRequestId: randomUUID() };
  const batch = await createAssignmentBatch(input, session, request);
  assert.equal(batch.courseCount, 2); assert.equal(batch.userCount, 2); assert.equal(batch.created, 4);
  assert.match(batch.recordNo, /^\d{12}$/);
  assert.equal(await db.courseAssignment.count({ where: { batchId: batch.id } }), 4);
  assert.equal((await createAssignmentBatch(input, session, request)).id, batch.id);
  await db.course.update({ where: { id: second.id }, data: { status: "DISABLED" } });
  const batchesBeforeDisabled = await db.courseAssignmentBatch.count();
  const assignmentsBeforeDisabled = await db.courseAssignment.count();
  const sequenceBeforeDisabled = await db.courseAssignmentSequence.findMany();
  for (const courseIds of [[second.id], [course.id, second.id]]) {
    await assert.rejects(() => createAssignmentBatch({ ...input, courseIds, clientRequestId: randomUUID() }, session, request), /仅支持分配启用状态的课程/);
  }
  assert.equal(await db.courseAssignmentBatch.count(), batchesBeforeDisabled);
  assert.equal(await db.courseAssignment.count(), assignmentsBeforeDisabled);
  assert.deepEqual(await db.courseAssignmentSequence.findMany(), sequenceBeforeDisabled);
  await db.course.update({ where: { id: second.id }, data: { status: "ENABLED" } });
  console.log("PASS disabled-only and mixed-status assignments rejected without creating batches or relations");
  const sameInput = { courseIds: [second.id], userIds: [unlearned.id], clientRequestId: randomUUID() };
  const replay = await Promise.all([createAssignmentBatch(sameInput, session, request), createAssignmentBatch(sameInput, session, request)]);
  assert.equal(replay[0].id, replay[1].id);
  const beforeInvalid = await db.courseAssignmentBatch.count();
  await assert.rejects(() => createAssignmentBatch({ ...input, courseIds: ["missing"], clientRequestId: randomUUID() }, session, request), AssignmentError);
  assert.equal(await db.courseAssignmentBatch.count(), beforeInvalid);
  const sequenceBeforeRollback = await db.courseAssignmentSequence.findMany();
  await assert.rejects(() => createAssignmentBatch({ ...input, clientRequestId: randomUUID() }, { ...session, userId: "missing-actor" }, request));
  assert.equal(await db.courseAssignmentBatch.count(), beforeInvalid);
  assert.deepEqual(await db.courseAssignmentSequence.findMany(), sequenceBeforeRollback);
  const concurrent = await Promise.all(Array.from({ length: 4 }, () => createAssignmentBatch({ courseIds: [second.id], userIds: [unlearned.id], clientRequestId: randomUUID() }, session, request)));
  assert.equal(new Set(concurrent.map(row => row.recordNo)).size, 4);
  console.log("PASS batch transaction, deduplication, request replay and concurrent numbering");

  const secondBatch = await createAssignmentBatch({ courseIds: [course.id], userIds: [learner.id], clientRequestId: randomUUID() }, session, request);
  const outsiderBatch = await createAssignmentBatch({ courseIds: [course.id], userIds: [outsider.id], clientRequestId: randomUUID() }, session, request);
  assert.equal((await mobileAssignedCourses(learner.id, "lead-h5")).filter(row => row.id === course.id).length, 1);
  await changeAssignmentStatus(batch.id, 1, "DISABLED", session, "停用", request);
  assert((await mobileAssignedCourses(learner.id, "store-h5")).some(row => row.id === course.id));
  await changeAssignmentStatus(secondBatch.id, 1, "DISABLED", session, "停用", request);
  assert(!(await mobileAssignedCourses(learner.id, "lead-h5")).some(row => row.id === course.id));
  await assert.rejects(() => mobileAssignedCourseDetail(course.id, learner.id, "lead-h5"), /分配已停用/);
  await assert.rejects(() => mobileAssignedLessonDetail(course.id, lesson.id, learner.id, "lead-h5"), /分配已停用/);
  await assert.rejects(() => mobileCourseAsset({ courseId: course.id, userId: learner.id, kind: "cover" }), /分配已停用/);
  await assert.rejects(() => saveMobileLessonProgress({ courseId: course.id, lessonId: lesson.id, userId: learner.id, progressSeconds: 10, completed: false }), /分配已停用/);
  await assert.rejects(() => changeAssignmentStatus(batch.id, 1, "DISABLED", session, "停用", request), /状态已发生变化/);
  assert.equal((await changeAssignmentStatus(batch.id, 2, "DISABLED", session, "停用", request)).outcome, "skipped");
  await changeAssignmentStatus(batch.id, 2, "ENABLED", session, "启用", request);
  const competing = await Promise.allSettled([
    changeAssignmentStatus(secondBatch.id, 2, "ENABLED", session, "启用", request),
    changeAssignmentStatus(secondBatch.id, 2, "ENABLED", session, "启用", request),
  ]);
  assert.equal(competing.filter(result => result.status === "fulfilled").length, 1);
  console.log("PASS shared entitlement, last-batch disable, resource/progress rejection and optimistic locking");

  await saveMobileLessonProgress({ courseId: course.id, lessonId: lesson.id, userId: learner.id, progressSeconds: 0, completed: false });
  assert.equal((await assignmentLearningRows(batch.id, course.id, false, new URLSearchParams(), session)).total, 1);
  assert.equal((await assignmentLearningRows(batch.id, course.id, true, new URLSearchParams(), session)).total, 2, "Entering alone is not effective learning");
  await saveMobileLessonProgress({ courseId: course.id, lessonId: lesson.id, userId: learner.id, progressSeconds: 12, completed: false });
  await saveMobileLessonProgress({ courseId: course.id, lessonId: lesson.id, userId: outsider.id, progressSeconds: 15, completed: false });
  const learned = await assignmentLearningRows(batch.id, course.id, false, new URLSearchParams(), session);
  assert.equal(learned.total, 1); assert.equal(learned.rows[0].realName, "张三");
  assert.equal((await assignmentLearningRows(batch.id, course.id, true, new URLSearchParams(), session)).rows[0].realName, "李四");
  assert.equal(await db.courseLearningProgress.count({ where: { courseId: course.id, userId: learner.id } }), 1);
  await db.course.update({ where: { id: course.id }, data: { courseName: "消防培训改名", coverDataUrl: null, applicablePosition: "改名岗位" } });
  await db.user.update({ where: { id: learner.id }, data: { realName: "张三改名" } });
  const historic = await db.courseAssignmentCourse.findUniqueOrThrow({ where: { batchId_courseId: { batchId: batch.id, courseId: course.id } } });
  assert.equal(historic.courseNameSnapshot, "消防安全培训"); assert.equal(historic.coverDataUrl, coverDataUrl);
  assert.equal((await assignmentLearningRows(batch.id, course.id, false, new URLSearchParams(), session)).rows[0].realName, "张三");
  const oldProgress = await db.courseLearningProgress.findUniqueOrThrow({ where: { courseId_userId: { courseId: course.id, userId: learner.id } } });
  await changeAssignmentStatus(batch.id, 3, "DISABLED", session, "停用", request);
  await changeAssignmentStatus(batch.id, 4, "ENABLED", session, "启用", request);
  assert.deepEqual(await db.courseLearningProgress.findUniqueOrThrow({ where: { id: oldProgress.id } }), oldProgress);
  await db.course.update({ where: { id: course.id }, data: { status: "DISABLED" } });
  assert(!(await mobileAssignedCourses(learner.id, "lead-h5")).some(row => row.id === course.id));
  await db.course.update({ where: { id: course.id }, data: { status: "ENABLED", deletedAt: new Date() } });
  assert(!(await mobileAssignedCourses(learner.id, "lead-h5")).some(row => row.id === course.id));
  assert.equal((await assignmentLearningRows(batch.id, course.id, false, new URLSearchParams(), session)).total, 1);
  await db.course.update({ where: { id: course.id }, data: { deletedAt: null } });
  await db.user.update({ where: { id: learner.id }, data: { status: "DISABLED" } });
  assert.equal((await mobileAssignedCourses(learner.id, "lead-h5")).length, 0);
  await db.user.update({ where: { id: learner.id }, data: { status: "ENABLED" } });
  console.log("PASS valid-learning semantics, recipient-only statistics, immutable snapshots and retained progress");

  await visibleAssignment(batch.id, scoped);
  await assert.rejects(() => visibleAssignment(outsiderBatch.id, scoped), /无权/);
  await assert.rejects(() => changeAssignmentStatus(outsiderBatch.id, 1, "DISABLED", scoped, "停用", request), /无权/);
  const scopedWhere = assignmentBatchScope(await assignmentAccess(scoped));
  assert.equal(await db.courseAssignmentBatch.count({ where: { AND: [scopedWhere, { id: outsiderBatch.id }] } }), 0);
  const selectable = await assignmentSelectableUserScope(await assignmentAccess(scoped));
  assert.equal(await db.user.count({ where: { AND: [selectable, { id: outsider.id }] } }), 0);
  assert.equal(await db.user.count({ where: { AND: [selectable, { id: learner.id }] } }), 1);
  await assert.rejects(() => createAssignmentBatch({ courseIds: [course.id], userIds: [outsider.id], clientRequestId: randomUUID() }, scoped, request), /数据权限/);
  const found = await db.courseAssignmentBatch.findMany({ where: assignmentFilterWhere(new URLSearchParams({ courseName: "安全", assigneeKeyword: "张三" })) });
  assert(found.some(row => row.id === batch.id));
  assert.equal(assignmentDateError("2026-08-31", "2026-08-31"), null);
  assert(assignmentDateError("2026-09-01", "2026-08-31")); assert(assignmentDateError("2026-02-30"));
  const range = assignmentFilterWhere(new URLSearchParams({ assignStartDate: "2026-08-31", assignEndDate: "2026-08-31" })).assignedAt;
  assert.equal((range as { gte: Date }).gte.toISOString(), "2026-08-30T16:00:00.000Z");
  assert.equal((range as { lt: Date }).lt.toISOString(), "2026-08-31T16:00:00.000Z");
  assert.throws(() => assignmentPagination(new URLSearchParams({ page: "1.5" })), AssignmentError);
  assert.equal(canAccessPath("/lead_pc/training/3", ["course-assignments:query"]), true);
  assert.equal(canAccessPath("/lead_pc/training/3", ["courses:edit"]), false);
  for (const action of assignmentActions) {
    assert(canCourseAssignment([`course-assignments:${action}`], action));
    assert(!canCourseAssignment([], action));
  }
  console.log("PASS brand/store scope, snapshot filtering, Shanghai date boundaries and separate permissions");
  const skippedBatch = await db.courseAssignmentBatch.findUniqueOrThrow({ where: { id: secondBatch.id } });
  await changeAssignmentStatus(secondBatch.id, skippedBatch.version, "DISABLED", session, "停用", request);
  const partial = await changeAssignmentStatuses([
    { id: concurrent[0].id, version: 1 },
    { id: secondBatch.id, version: skippedBatch.version + 1 },
    { id: outsiderBatch.id, version: 999 },
  ], "DISABLED", session, "批量停用", request);
  assert.equal(partial.changed, 1); assert.equal(partial.skipped, 1); assert.equal(partial.failed, 1);
  assert.match(partial.results.find(row => row.outcome === "failed")!.message!, /状态已发生变化/);
  console.log("PASS partial batch success, skipped status and conflict isolation");
  await verifyLessonVisits({ session, batchId: batch.id, courseId: course.id, lessonId: lesson.id, userId: learner.id, unlearnedUserId: unlearned.id });
  console.log("All course-assignment integration checks passed.");
  console.log("UI test login: assignment_qa / AssignmentTest-2026! (isolated test database only)");
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());

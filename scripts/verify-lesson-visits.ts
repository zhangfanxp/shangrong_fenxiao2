import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Session } from "../lib/auth";
import { db } from "../lib/db";
import { assignmentLearningRows } from "../lib/course-assignments";
import { startLessonVisit, updateLessonVisit, type LessonVisitIdentity } from "../lib/lesson-learning-visits";
import { LESSON_VISIT_TIMEOUT_MS } from "../lib/lesson-visit-rules";
import { saveMobileLessonProgress } from "../lib/mobile-online-courses";
import { lessonProgressResponse, lessonVisitResponse } from "../lib/mobile-online-course-responses";

// Called by verify-course-assignments.ts after its isolated fixtures are created.
export async function verifyLessonVisits(input: { session: Session; batchId: string; courseId: string; lessonId: string; userId: string; unlearnedUserId: string }) {
  const url = new URL(process.env.DATABASE_URL || "");
  assert(["127.0.0.1", "localhost"].includes(url.hostname) && /^\/canyin_assignment_test_[a-z0-9_]+$/.test(url.pathname));
  const identity = (extra: Partial<LessonVisitIdentity> = {}): LessonVisitIdentity => ({ visitId: randomUUID(), userId: input.userId, courseId: input.courseId, lessonId: input.lessonId, channel: "lead-h5", ...extra });
  const rows = (unlearned = false, page = 1) => assignmentLearningRows(input.batchId, input.courseId, unlearned, new URLSearchParams({ page: String(page), pageSize: "20" }), input.session);
  const progressBefore = await db.courseLearningProgress.findMany({ where: { courseId: input.courseId }, orderBy: { id: "asc" } });
  const first = identity();
  const parallel = await Promise.all([startLessonVisit(first), startLessonVisit(first), startLessonVisit(first)]);
  assert(parallel.every(result => result.id === first.visitId && result.status === "ACTIVE"));
  assert.equal(await db.courseLessonVisit.count({ where: { id: first.visitId } }), 1);
  const original = await db.courseLessonVisit.findUniqueOrThrow({ where: { id: first.visitId } });
  await startLessonVisit(first);
  assert.deepEqual(await db.courseLessonVisit.findUniqueOrThrow({ where: { id: first.visitId } }), original, "Start retry cannot rewrite timestamps");
  for (const mutation of [{ userId: input.unlearnedUserId }, { courseId: "other-course" }, { lessonId: "other-lesson" }, { channel: "store-h5" as const }]) {
    await assert.rejects(() => startLessonVisit({ ...first, ...mutation }), /无权访问/);
    await assert.rejects(() => updateLessonVisit({ ...first, ...mutation }, "end"), /无权访问/);
  }
  await updateLessonVisit(first, "heartbeat");
  assert.equal((await updateLessonVisit(first, "end", "BACK")).status, "ENDED");
  const ended = await db.courseLessonVisit.findUniqueOrThrow({ where: { id: first.visitId } });
  assert(ended.startedAt && ended.endedAt && ended.endedAt >= ended.startedAt);
  await Promise.all([updateLessonVisit(first, "end"), updateLessonVisit(first, "heartbeat"), startLessonVisit(first)]);
  assert.deepEqual(await db.courseLessonVisit.findUniqueOrThrow({ where: { id: first.visitId } }), ended);
  await assert.rejects(() => saveMobileLessonProgress({ ...first, progressSeconds: 20, completed: false }), /结束或中断/);
  const next = identity(); await startLessonVisit(next); assert.notEqual(next.visitId, first.visitId);
  const channelEntry = identity({ channel: "store-h5" }); await startLessonVisit(channelEntry);
  assert.deepEqual(await db.courseLearningProgress.findMany({ where: { courseId: input.courseId }, orderBy: { id: "asc" } }), progressBefore);
  console.log("PASS per-entry IDs, concurrent idempotency, ownership/channel isolation, immutable end, shared progress unchanged");

  const empty = identity({ userId: input.unlearnedUserId });
  await startLessonVisit(empty); await updateLessonVisit(empty, "end");
  assert((await rows(true)).rows.some(row => row.userId === input.unlearnedUserId));
  const timedOut = identity(); await startLessonVisit(timedOut);
  const lastActive = new Date(Date.now() - LESSON_VISIT_TIMEOUT_MS - 1000);
  await db.courseLessonVisit.update({ where: { id: timedOut.visitId }, data: { lastActiveAt: lastActive } });
  assert.equal((await rows()).rows.find(row => row.id === timedOut.visitId)?.visitStatus, "INTERRUPTED", "List resolves timeouts without a mobile event or cron");
  assert.equal((await updateLessonVisit(timedOut, "heartbeat")).status, "INTERRUPTED");
  await updateLessonVisit(timedOut, "end");
  const interrupted = await db.courseLessonVisit.findUniqueOrThrow({ where: { id: timedOut.visitId } });
  assert.equal(interrupted.endedAt, null); assert.equal(interrupted.endReason, "TIMEOUT"); assert.deepEqual(interrupted.lastActiveAt, lastActive);
  await assert.rejects(() => saveMobileLessonProgress({ ...timedOut, progressSeconds: 30, completed: false }), /结束或中断/);
  const revoked = identity(); await startLessonVisit(revoked);
  await db.course.update({ where: { id: input.courseId }, data: { status: "DISABLED" } });
  await assert.rejects(() => startLessonVisit(identity()), /分配已停用/);
  assert.equal((await startLessonVisit(revoked)).status, "INTERRUPTED", "Replayed start also checks entitlement");
  assert.equal((await updateLessonVisit(next, "end")).status, "INTERRUPTED");
  await assert.rejects(() => saveMobileLessonProgress({ ...channelEntry, progressSeconds: 30, completed: false }), /分配已停用/);
  await db.course.update({ where: { id: input.courseId }, data: { status: "ENABLED" } });
  assert.equal((await startLessonVisit(revoked)).status, "INTERRUPTED", "Re-enabling cannot reopen an old visit");
  assert.equal((await db.courseLessonVisit.findUniqueOrThrow({ where: { id: revoked.visitId } })).endedAt, null);
  console.log("PASS visit-only learner remains unlearned, timeout has no fake end, revoked access cannot revive visits");

  const chapter = await db.courseLesson.findUniqueOrThrow({ where: { id: input.lessonId } });
  await db.courseLesson.update({ where: { id: input.lessonId }, data: { chapterName: "修改后的章节" } });
  assert.equal((await rows()).rows.find(row => row.id === first.visitId)?.chapterName, chapter.chapterName);
  for (let i = 0; i < 23; i++) { const visit = identity(); await startLessonVisit(visit); await updateLessonVisit(visit, "end"); }
  const page1 = await rows(); const page2 = await rows(false, 2);
  assert.equal(page1.rows.length, 20); assert(page2.rows.length > 0);
  assert.equal(new Set([...page1.rows, ...page2.rows].map(row => row.id)).size, page1.rows.length + page2.rows.length);
  assert(page1.rows.every(row => row.userId === input.userId || row.userId === input.unlearnedUserId));
  assert.deepEqual((await rows()).rows.map(row => row.id), page1.rows.map(row => row.id));
  await db.courseLesson.update({ where: { id: input.lessonId }, data: { chapterName: chapter.chapterName, deletedAt: new Date() } });
  assert.equal((await rows()).total, page1.total);
  await db.courseLesson.update({ where: { id: input.lessonId }, data: { deletedAt: null } });
  console.log("PASS chapter snapshot after rename/delete, repeated-learner row keys, stable server pagination and batch scope");

  const httpSession = { userId: input.userId, username: "test" };
  const request = (body: unknown) => new Request("http://localhost/qa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const apiId = randomUUID();
  const response = await lessonVisitResponse(request({ event: "start", visitId: apiId, userId: "forged-user", startedAt: "2000-01-01" }), input.courseId, input.lessonId, httpSession, "store-h5");
  assert.equal(response.status, 200);
  const apiVisit = await db.courseLessonVisit.findUniqueOrThrow({ where: { id: apiId } });
  assert.equal(apiVisit.userId, input.userId); assert.equal(apiVisit.channel, "store-h5"); assert(apiVisit.startedAt && apiVisit.startedAt.getFullYear() > 2000);
  assert.equal((await lessonVisitResponse(request({ event: "start", visitId: "invalid" }), input.courseId, input.lessonId, httpSession, "store-h5")).status, 400);
  assert.equal((await lessonProgressResponse(request({ progressSeconds: 10, completed: false }), input.courseId, input.lessonId, httpSession, "门店员工移动端")).status, 400);
  assert.equal((await lessonProgressResponse(request({ visitId: apiId, progressSeconds: 12, completed: false }), input.courseId, input.lessonId, httpSession, "门店员工移动端")).status, 200);
  assert.equal((await lessonVisitResponse(request({ event: "end", visitId: apiId, reason: "BACK" }), input.courseId, input.lessonId, httpSession, "store-h5")).status, 200);
  assert.equal((await lessonProgressResponse(request({ visitId: apiId, progressSeconds: 20, completed: false }), input.courseId, input.lessonId, httpSession, "门店员工移动端")).status, 409);
  console.log("PASS HTTP validation, server-owned identity/times, both mobile channels, progress tied to active visit");
}

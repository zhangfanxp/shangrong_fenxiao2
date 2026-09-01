import assert from "node:assert/strict";
import { db } from "../lib/db";

// Run --seed against the pre-visit schema, apply the incremental SQL, then --verify.
const historicalTime = new Date("2026-01-02T03:04:05.000Z");
async function main() {
  const url = new URL(process.env.DATABASE_URL || "");
  assert(["127.0.0.1", "localhost"].includes(url.hostname) && /^\/canyin_assignment_test_[a-z0-9_]+$/.test(url.pathname), "Isolated local test DB only");
  if (process.argv.includes("--seed")) {
    assert.equal(await db.course.count(), 0, "Never reset existing data");
    await db.course.create({ data: { id: "visit-upgrade-course", recordNo: "202601020001", courseName: "历史课程", applicablePosition: "全员", createdByName: "测试" } });
    await db.courseLesson.create({ data: { id: "visit-upgrade-lesson", courseId: "visit-upgrade-course", recordNo: "202601020001", chapterName: "历史课时", coursewareType: "VIDEO", fileR2StorageId: "qa", originalFileName: "qa.mp4", fileObjectKey: "qa.mp4", fileSizeBytes: 1, mimeType: "video/mp4", sortOrder: 1, createdByName: "测试" } });
    await db.courseLessonProgress.createMany({ data: [
      { id: "old-positive", lessonId: "visit-upgrade-lesson", userId: "old-user-a", progressSeconds: 12, createdAt: historicalTime, updatedAt: historicalTime },
      { id: "old-complete", lessonId: "visit-upgrade-lesson", userId: "old-user-b", progressSeconds: 0, completedAt: historicalTime, createdAt: historicalTime, updatedAt: historicalTime },
      { id: "old-zero", lessonId: "visit-upgrade-lesson", userId: "old-user-c", progressSeconds: 0, createdAt: historicalTime, updatedAt: historicalTime },
    ] });
    await db.courseLearningProgress.createMany({ data: [
      { id: "old-course-a", courseId: "visit-upgrade-course", userId: "old-user-a", progress: 0, learnerRealNameSnapshot: "历史姓名甲", firstLearnedAt: historicalTime, createdAt: historicalTime, updatedAt: historicalTime },
      { id: "old-course-d", courseId: "visit-upgrade-course", userId: "old-user-d", progress: 50, learnerRealNameSnapshot: "历史姓名丁", createdAt: historicalTime, updatedAt: historicalTime },
      { id: "old-course-zero", courseId: "visit-upgrade-course", userId: "old-user-e", progress: 0, createdAt: historicalTime, updatedAt: historicalTime },
    ] });
    console.log("Seeded positive, completed, zero and course-only legacy learning fixtures.");
    return;
  }
  assert(process.argv.includes("--verify"), "Pass --seed or --verify");
  const visits = await db.courseLessonVisit.findMany({ orderBy: { legacySourceKey: "asc" } });
  assert.equal(visits.length, 3);
  assert.deepEqual(visits.map(row => row.legacySourceKey), ["course:old-course-d", "lesson:old-complete", "lesson:old-positive"]);
  for (const visit of visits) {
    assert.equal(visit.status, "LEGACY"); assert.equal(visit.channel, "legacy");
    assert.equal(visit.startedAt, null); assert.equal(visit.endedAt, null); assert.equal(visit.lastActiveAt, null);
    assert.deepEqual(visit.createdAt, historicalTime);
  }
  assert.equal(visits[0].lessonId, null); assert.equal(visits[0].chapterNameSnapshot, "历史数据未采集");
  assert.equal(visits[1].learnerRealNameSnapshot, "历史姓名未采集");
  assert.equal(visits[2].learnerRealNameSnapshot, "历史姓名甲"); assert.equal(visits[2].chapterNameSnapshot, "历史课时");
  const lessonProgress = await db.courseLessonProgress.findMany(); const courseProgress = await db.courseLearningProgress.findMany();
  assert.equal(lessonProgress.length, 3); assert.equal(courseProgress.length, 3);
  for (const row of [...lessonProgress, ...courseProgress]) assert.deepEqual(row.updatedAt, historicalTime, "Migration must not touch progress");
  assert.equal(lessonProgress.find(row => row.id === "old-positive")?.progressSeconds, 12);
  assert.equal(courseProgress.find(row => row.id === "old-course-d")?.progress, 50);
  console.log("PASS legacy migration: no invented entry/exit times, no zero-progress visits, no duplicate course aggregate, names preserved, original progress untouched.");
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());

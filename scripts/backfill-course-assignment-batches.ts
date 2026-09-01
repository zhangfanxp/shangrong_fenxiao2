import { db } from "../lib/db";
import { assignmentCourseSnapshot, assignmentTransaction, nextAssignmentRecordNo } from "../lib/course-assignments";
import { assignmentScopeCatalog, assignmentUserSelect, snapshotUserScopes } from "../lib/course-assignment-scope";
import { writeOperationLogWithTransaction } from "../lib/operation-log";

async function main() {
  const count = await db.courseAssignment.count({ where: { batchId: null } });
  console.log(`旧分配关系：${count} 条。原始批次/历史快照不可恢复，每条关系将独立补录并标记 legacyImported。`);
  if (!process.argv.includes("--apply")) { console.log("当前为只读预览；确认后添加 --apply 执行。不会删除分配关系或学习记录。"); return; }
  let imported = 0;
  while (true) {
    const rows = await db.courseAssignment.findMany({ where: { batchId: null }, orderBy: { id: "asc" }, take: 100, select: { id: true } });
    if (!rows.length) break;
    for (const { id } of rows) {
      const changed = await assignmentTransaction(async tx => {
        const row = await tx.courseAssignment.findUnique({ where: { id }, include: { course: true, user: { select: assignmentUserSelect }, assignedBy: { select: { username: true } } } });
        if (!row || row.batchId) return false;
        const { stores, brands } = await assignmentScopeCatalog(tx);
        const batch = await tx.courseAssignmentBatch.create({ data: {
          recordNo: await nextAssignmentRecordNo(tx, row.createdAt), courseCount: 1, userCount: 1,
          assignedByUserId: row.assignedByUserId, assignedByUsername: row.assignedBy?.username || "历史账号",
          assignedByName: row.assignedByName, assignedAt: row.createdAt, legacyImported: true,
          courses: { create: assignmentCourseSnapshot(row.course) },
          users: { create: { userId: row.userId, usernameSnapshot: row.user.username, realNameSnapshot: row.user.realName, roleSnapshot: row.user.role.name,
            scopes: { create: snapshotUserScopes(row.user, stores, brands) } } },
        } });
        await tx.courseAssignment.update({ where: { id }, data: { batchId: batch.id } });
        await writeOperationLogWithTransaction(tx, { username: "系统", page: "课程分配记录", action: "历史关系补录", result: "成功", detail: `批次：${batch.recordNo}；原分配关系：${row.id}；非原始操作批次`, request: new Request("http://localhost/offline-course-assignment-backfill") });
        return true;
      });
      if (changed) imported++;
    }
  }
  console.log(`已补录 ${imported} 条历史关系；原学习进度未改动。`);
}

main().catch(error => { console.error(error instanceof Error ? error.message : "补录失败"); process.exitCode = 1; }).finally(() => db.$disconnect());

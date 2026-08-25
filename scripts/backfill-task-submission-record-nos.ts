import { db } from "../lib/db";
import { nextTaskSubmissionRecordNo } from "../lib/task-records";

async function main() {
  const rows = await db.$queryRaw<Array<{ id: string; submittedAt: Date }>>`
    SELECT id, submittedAt
    FROM TaskSubmission
    WHERE recordNo IS NULL
    ORDER BY submittedAt ASC, id ASC
  `;
  for (const row of rows) {
    await db.$transaction(async tx => {
      const current = await tx.taskSubmission.findUnique({ where: { id: row.id }, select: { recordNo: true } });
      if (!current || current.recordNo) return;
      await tx.taskSubmission.update({
        where: { id: row.id },
        data: { recordNo: await nextTaskSubmissionRecordNo(tx, row.submittedAt) },
      });
    });
  }
  const roleRows = await db.taskRecord.findMany({
    where: { assignedUserId: { not: null }, OR: [{ assignedRoleIdSnapshot: null }, { assignedRoleNameSnapshot: null }] },
    select: { id: true, assignedUser: { select: { role: { select: { id: true, name: true } } } } },
  });
  for (const row of roleRows) {
    if (!row.assignedUser) continue;
    await db.taskRecord.updateMany({
      where: { id: row.id, OR: [{ assignedRoleIdSnapshot: null }, { assignedRoleNameSnapshot: null }] },
      data: { assignedRoleIdSnapshot: row.assignedUser.role.id, assignedRoleNameSnapshot: row.assignedUser.role.name },
    });
  }
  console.log(`任务历史快照补齐完成：正式编号 ${rows.length} 条，执行角色 ${roleRows.length} 条`);
}

main().finally(() => db.$disconnect());

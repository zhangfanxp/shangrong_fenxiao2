import type { Prisma } from "@prisma/client";

export function taskRecordParticipantWhere(userId: string): Prisma.TaskRecordWhereInput {
  return {
    OR: [
      { sharedExecution: false, assignedUserId: userId },
      { sharedExecution: true, sharedExecutors: { some: { userId } } },
    ],
  };
}

export function taskRecordEditorWhere(userId: string): Prisma.TaskRecordWhereInput {
  return {
    OR: [
      { sharedExecution: false, assignedUserId: userId },
      {
        sharedExecution: true,
        sharedExecutors: { some: { userId } },
        OR: [{ editOwnerUserId: null }, { editOwnerUserId: userId }],
      },
    ],
  };
}

export async function claimSharedTaskRecord(
  tx: Prisma.TransactionClient,
  taskRecordId: string,
  userId: string,
  userName: string,
  now = new Date(),
) {
  await tx.$queryRaw`SELECT id FROM TaskRecord WHERE id = ${taskRecordId} FOR UPDATE`;
  const record = await tx.taskRecord.findFirst({
    where: {
      id: taskRecordId,
      AND: [
        taskRecordParticipantWhere(userId),
        {
          status: "PENDING",
          OR: [
            { dueDate: { gte: now } },
            { rectificationRound: { is: { submittedAt: null, rectification: { status: "IN_PROGRESS" } } } },
          ],
        },
      ],
    },
    select: { id: true, sharedExecution: true, assignedUserId: true, editOwnerUserId: true },
  });
  if (!record) return false;
  if (!record.sharedExecution) return record.assignedUserId === userId;
  if (record.editOwnerUserId) return record.editOwnerUserId === userId;
  const claimed = await tx.taskRecord.updateMany({
    where: { id: record.id, sharedExecution: true, editOwnerUserId: null },
    data: { editOwnerUserId: userId, editOwnerNameSnapshot: userName },
  });
  return claimed.count === 1;
}

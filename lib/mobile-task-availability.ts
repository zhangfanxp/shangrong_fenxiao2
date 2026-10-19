import type { Prisma } from "@prisma/client";

// 整改任务逾期后仍可填写、上传、暂存和提交；普通任务维持原截止规则。
export function availableMobileTaskWhere(now = new Date()): Prisma.TaskRecordWhereInput {
  return {
    status: "PENDING",
    OR: [
      { dueDate: { gte: now } },
      { rectificationRound: { is: { submittedAt: null, rectification: { status: "IN_PROGRESS" } } } },
    ],
  };
}

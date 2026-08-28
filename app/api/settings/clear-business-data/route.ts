import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { businessDataTargetLabels, businessDataTargetValues } from "@/lib/business-data-targets";
import { db } from "@/lib/db";
import { writeOperationLogWithTransaction } from "@/lib/operation-log";

const schema = z.object({
  targets: z.array(z.enum(businessDataTargetValues)).min(1, "请至少选择一类业务数据"),
  confirmation: z.literal("确认清空", { errorMap: () => ({ message: "请输入“确认清空”以继续" }) }),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (session.role !== "SUPER_ADMIN") return NextResponse.json({ message: "当前账号暂无执行清空业务数据的权限" }, { status: 403 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message }, { status: 400 });
  const targets = [...new Set(parsed.data.targets)];
  const tables = await db.$transaction(async tx => {
    const deletedTables: { key: string; label: string; count: number }[] = [];
    const recordDeleted = (key: string, label: string, count: number) => deletedTables.push({ key, label, count });
    const clearStores = targets.includes("contracts") || targets.includes("stores");
    const clearTaskRecords = clearStores || targets.includes("tasks");
    const clearPersonnel = clearStores || targets.includes("personnel");
    const clearReviews = clearStores || targets.includes("storeReviews");
    const clearResearchRecords = clearStores || targets.includes("researchRecords");

    if (clearTaskRecords) {
      const taskRecordWhere = targets.includes("tasks") ? {} : { storeId: { not: null } };
      const taskRecordIds = (await tx.taskRecord.findMany({ where: taskRecordWhere, select: { id: true } })).map(row => row.id);
      if (taskRecordIds.length) {
        const submissionIds = (await tx.taskSubmission.findMany({ where: { taskRecordId: { in: taskRecordIds } }, select: { id: true } })).map(row => row.id);
        const submissionItems = submissionIds.length ? await tx.taskSubmissionItem.deleteMany({ where: { submissionId: { in: submissionIds } } }) : { count: 0 };
        recordDeleted("taskSubmissionItems", "任务提交明细", submissionItems.count);
        recordDeleted("taskSubmissions", "任务正式提交记录", (await tx.taskSubmission.deleteMany({ where: { taskRecordId: { in: taskRecordIds } } })).count);
        recordDeleted("taskAttachments", "任务附件记录", (await tx.taskAttachment.deleteMany({ where: { taskRecordId: { in: taskRecordIds } } })).count);
        recordDeleted("taskRecords", "任务执行记录", (await tx.taskRecord.deleteMany({ where: { id: { in: taskRecordIds } } })).count);
      } else {
        recordDeleted("taskSubmissionItems", "任务提交明细", 0);
        recordDeleted("taskSubmissions", "任务正式提交记录", 0);
        recordDeleted("taskAttachments", "任务附件记录", 0);
        recordDeleted("taskRecords", "任务执行记录", 0);
      }
    }

    if (clearReviews) {
      recordDeleted("leadH5ReviewItems", "门店稽核评分明细", (await tx.leadH5ReviewItem.deleteMany()).count);
      recordDeleted("leadH5Reviews", "门店稽核评分记录", (await tx.leadH5Review.deleteMany()).count);
      recordDeleted("assessmentRecords", "历史考核结果", (await tx.assessmentRecord.deleteMany()).count);
      await tx.leadH5ReviewSequence.deleteMany();
    }
    if (clearResearchRecords) {
      recordDeleted("researchTemplateRecords", "巡店调研记录", (await tx.researchTemplateRecord.deleteMany()).count);
      await tx.leadH5ResearchSequence.deleteMany();
    }
    if (clearPersonnel) {
      recordDeleted("salaryHistory", "薪资调整记录", (await tx.salaryHistory.deleteMany()).count);
      recordDeleted("positionHistory", "岗位调动记录", (await tx.positionHistory.deleteMany()).count);
      recordDeleted("personnel", "人员档案", (await tx.personnel.deleteMany()).count);
      await tx.personnelSequence.deleteMany();
    }
    if (targets.includes("tasks")) {
      await tx.r2StorageReference.deleteMany({ where: { businessType: "TASK" } });
      recordDeleted("taskBrands", "任务适用品牌关联", (await tx.taskBrand.deleteMany()).count);
      recordDeleted("tasks", "任务设置", (await tx.task.deleteMany()).count);
      recordDeleted("taskSchedulerRuns", "任务调度记录", (await tx.taskSchedulerRun.deleteMany()).count);
      await tx.taskSubmissionSequence.deleteMany();
    }
    if (targets.includes("dailyLearning")) {
      recordDeleted("dailyLearningProgress", "每日学习完成记录", (await tx.dailyLearningProgress.deleteMany()).count);
      recordDeleted("dailyLearningAssignees", "每日学习分配记录", (await tx.dailyLearningAssignee.deleteMany()).count);
      recordDeleted("dailyLearningPlans", "每日学习计划", (await tx.dailyLearningPlan.deleteMany()).count);
      await tx.dailyLearningSequence.deleteMany();
    }
    if (targets.includes("notifications")) {
      recordDeleted("meetingParticipants", "会议参会及签到记录", (await tx.meetingParticipant.deleteMany()).count);
      recordDeleted("meetings", "会议记录", (await tx.meeting.deleteMany()).count);
      recordDeleted("notificationRecipients", "通知接收及阅读记录", (await tx.notificationRecipient.deleteMany()).count);
      recordDeleted("notifications", "通知记录", (await tx.notification.deleteMany()).count);
      await tx.notificationSequence.deleteMany();
    } else if (targets.includes("meetings")) {
      recordDeleted("meetingParticipants", "会议参会及签到记录", (await tx.meetingParticipant.deleteMany()).count);
      recordDeleted("meetings", "会议记录", (await tx.meeting.deleteMany()).count);
    }
    if (clearStores) recordDeleted("stores", "门店档案", (await tx.store.deleteMany()).count);
    if (targets.includes("contracts")) {
      recordDeleted("contractRebates", "合同返利记录", (await tx.contractRebate.deleteMany()).count);
      recordDeleted("contracts", "合同记录", (await tx.contract.deleteMany()).count);
    }
    if (targets.includes("operationLogs")) {
      recordDeleted("operationLogs", "操作日志", (await tx.operationLog.deleteMany()).count);
      await tx.operationLogSequence.deleteMany();
    }

    const totalCount = deletedTables.reduce((total, table) => total + table.count, 0);
    await writeOperationLogWithTransaction(tx, {
      userId: session.userId,
      username: session.username,
      page: "清空业务数据",
      action: "清空",
      result: "成功",
      detail: `已清空：${targets.map(target => businessDataTargetLabels[target]).join("、")}；涉及 ${deletedTables.length} 张业务表，共 ${totalCount} 条记录`,
      request,
    });
    return deletedTables;
  });
  return NextResponse.json({
    ok: true,
    targetLabels: targets.map(target => businessDataTargetLabels[target]),
    tables,
    totalCount: tables.reduce((total, table) => total + table.count, 0),
  });
}

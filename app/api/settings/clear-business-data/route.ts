import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { businessDataTargetLabels, businessDataTargetValues } from "@/lib/business-data-targets";
import { db } from "@/lib/db";
import { writeOperationLogWithTransaction } from "@/lib/operation-log";

const schema = z.object({
  targets: z.array(z.enum(businessDataTargetValues)).min(1, "请至少选择一类业务数据"),
  confirmation: z.literal("确认清空", { errorMap: () => ({ message: "请输入“确认清空”以继续" }) }),
});

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (session.role !== "SUPER_ADMIN") return NextResponse.json({ message: "当前账号暂无执行清空业务数据的权限" }, { status: 403 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message }, { status: 400 });
  const targets = [...new Set(parsed.data.targets)];
  if (targets.includes("taskCalendarTemplates") && !targets.includes("taskSettings")) {
    const linkedTemplate = await db.taskCalendarTemplate.findFirst({ where: { task: { isNot: null } }, select: { recordNo: true } });
    if (linkedTemplate) return NextResponse.json({ message: `日历任务模板 ${linkedTemplate.recordNo} 仍被任务设置引用，请同时选择“任务设置”或先解除关联` }, { status: 409 });
  }
  if (targets.some(target => ["contracts", "stores", "taskSettings", "taskRecords", "assessmentSettings", "storeReviews"].includes(target))
    && await db.inspectionRectificationRound.count()) {
    return NextResponse.json({ message: "存在已发起的巡检整改记录，不能清空相关巡检或任务历史" }, { status: 409 });
  }
  const tables = await db.$transaction(async tx => {
    const deletedTables: { key: string; label: string; count: number }[] = [];
    const recordDeleted = (key: string, label: string, count: number) => deletedTables.push({ key, label, count });
    const clearStores = targets.includes("contracts") || targets.includes("stores");
    const clearAllTaskRecords = targets.includes("taskSettings") || targets.includes("taskRecords");
    const clearTaskRecords = clearStores || clearAllTaskRecords;
    const clearProductCategorySales = clearStores || targets.includes("productCategorySales");
    const clearPersonnel = clearStores || targets.includes("personnel");
    const clearDailyAttendance = clearPersonnel || targets.includes("dailyAttendanceRecords");
    const clearItemRequisitions = clearPersonnel || targets.includes("workwearInventory") || targets.includes("itemRequisitions");
    const clearAssessmentSettings = targets.includes("assessmentSettings");
    const clearReviews = clearStores || clearAssessmentSettings || targets.includes("storeReviews");
    const clearResearchTemplates = targets.includes("researchTemplates");
    const clearResearchRecords = clearStores || clearResearchTemplates || targets.includes("researchRecords");
    const clearActualRevenue = clearStores || targets.includes("actualRevenue");
    const clearRevenueTargets = clearActualRevenue || targets.includes("revenueTargets");
    const clearMonthlyPurchaseSales = clearStores || targets.includes("monthlyPurchaseSales");
    const clearDailyLearningSettings = targets.includes("dailyLearningSettings");
    const clearDailyLearningRecords = clearDailyLearningSettings || targets.includes("dailyLearningRecords");
    const clearCourseSettings = targets.includes("courseSettings");
    const clearCourseRecords = clearCourseSettings || targets.includes("courseRecords");

    if (clearReviews) recordDeleted("inspectionRectifications", "待生成及无需整改记录", (await tx.inspectionRectification.deleteMany()).count);

    if (clearStores) recordDeleted("storeLaborRecords", "用工记录", (await tx.storeLaborRecord.deleteMany()).count);

    if (clearTaskRecords) {
      const taskRecordWhere = clearAllTaskRecords ? {} : { storeId: { not: null } };
      const taskRecordIds = (await tx.taskRecord.findMany({ where: taskRecordWhere, select: { id: true } })).map(row => row.id);
      if (taskRecordIds.length) {
        const analyses = await tx.taskAiAnalysis.findMany({ where: { taskRecordId: { in: taskRecordIds } }, select: { id: true } });
        const analysisIds = analyses.map(row => row.id);
        recordDeleted("taskAiAnalysisItems", "任务 AI 分析明细", analysisIds.length ? (await tx.taskAiAnalysisItem.deleteMany({ where: { analysisId: { in: analysisIds } } })).count : 0);
        recordDeleted("taskAiAnalyses", "任务 AI 分析记录", (await tx.taskAiAnalysis.deleteMany({ where: { taskRecordId: { in: taskRecordIds } } })).count);
        const submissionIds = (await tx.taskSubmission.findMany({ where: { taskRecordId: { in: taskRecordIds } }, select: { id: true } })).map(row => row.id);
        const submissionItems = submissionIds.length ? await tx.taskSubmissionItem.deleteMany({ where: { submissionId: { in: submissionIds } } }) : { count: 0 };
        recordDeleted("taskSubmissionItems", "任务提交明细", submissionItems.count);
        recordDeleted("taskSubmissions", "任务正式提交记录", (await tx.taskSubmission.deleteMany({ where: { taskRecordId: { in: taskRecordIds } } })).count);
        recordDeleted("taskAttachments", "任务附件记录", (await tx.taskAttachment.deleteMany({ where: { taskRecordId: { in: taskRecordIds } } })).count);
        recordDeleted("taskRecords", "任务执行记录", (await tx.taskRecord.deleteMany({ where: { id: { in: taskRecordIds } } })).count);
      } else {
        recordDeleted("taskAiAnalysisItems", "任务 AI 分析明细", 0);
        recordDeleted("taskAiAnalyses", "任务 AI 分析记录", 0);
        recordDeleted("taskSubmissionItems", "任务提交明细", 0);
        recordDeleted("taskSubmissions", "任务正式提交记录", 0);
        recordDeleted("taskAttachments", "任务附件记录", 0);
        recordDeleted("taskRecords", "任务执行记录", 0);
      }
      if (clearAllTaskRecords) {
        recordDeleted("taskSchedulerRuns", "任务调度记录", (await tx.taskSchedulerRun.deleteMany()).count);
        await tx.taskSubmissionSequence.deleteMany();
      }
      if (!clearStores) {
        await tx.storeLaborRecord.deleteMany({ where: { attendanceRecordId: null, salesSubmissionId: null } });
        await tx.storeLaborRecord.updateMany({
          where: { salesSubmissionId: null },
          data: {
            actualSalesAmount: null,
            receivedAmount: null,
            assessedAmount: null,
            standardRecordIdSnapshot: null,
            lowerAmountSnapshot: null,
            upperAmountSnapshot: null,
            standardHeadcountSnapshot: null,
            laborStatus: "UNABLE_TO_CALCULATE",
            unavailableReason: "缺少每日销售数据上报",
            calculatedAt: new Date(),
          },
        });
      }
    }

    if (clearRevenueTargets) {
      recordDeleted("storeDailyTargets", "每日目标营业额", (await tx.storeDailyTarget.deleteMany()).count);
      recordDeleted("storeMonthlyTargets", "月度目标营业额", (await tx.storeMonthlyTarget.deleteMany()).count);
      await tx.storeMonthlyTargetSequence.deleteMany();
      if (!clearActualRevenue) await tx.actualRevenueMonthly.updateMany({ data: { dailyTargetStatus: "NOT_GENERATED" } });
    }
    if (clearActualRevenue) {
      recordDeleted("actualRevenueDaily", "每日实际营业额", (await tx.actualRevenueDaily.deleteMany()).count);
      recordDeleted("actualRevenueMonthly", "月度实际营业额", (await tx.actualRevenueMonthly.deleteMany()).count);
      await tx.actualRevenueSequence.deleteMany();
    }
    if (clearProductCategorySales) {
      recordDeleted("productCategorySalesDetails", "产品类别销售明细", (await tx.productCategorySalesDetail.deleteMany()).count);
      recordDeleted("productCategorySalesImportFailures", "产品类别销售导入失败明细", (await tx.productCategorySalesImportFailure.deleteMany()).count);
      recordDeleted("productCategorySalesMonthly", "产品类别月度汇总", (await tx.productCategorySalesMonthly.deleteMany()).count);
      recordDeleted("productCategorySalesImportBatches", "产品类别销售导入批次", (await tx.productCategorySalesImportBatch.deleteMany()).count);
      await tx.productCategorySalesSequence.deleteMany();
    }
    if (clearMonthlyPurchaseSales) {
      recordDeleted("monthlyPurchaseSalesImportFailures", "采销比导入失败明细", (await tx.monthlyPurchaseSalesImportFailure.deleteMany()).count);
      recordDeleted("monthlyPurchaseSalesRatios", "门店月度采销比", (await tx.monthlyPurchaseSalesRatio.deleteMany()).count);
      recordDeleted("monthlyPurchaseSalesImportBatches", "采销比导入批次", (await tx.monthlyPurchaseSalesImportBatch.deleteMany()).count);
      await tx.monthlyPurchaseSalesSequence.deleteMany();
    }
    if (clearReviews) {
      recordDeleted("leadH5ReviewPhotos", "门店评分照片记录", (await tx.leadH5ReviewPhoto.deleteMany()).count);
      recordDeleted("leadH5ReviewItems", "门店稽核及信用评分明细", (await tx.leadH5ReviewItem.deleteMany()).count);
      recordDeleted("leadH5Reviews", "门店稽核及信用评分记录", (await tx.leadH5Review.deleteMany()).count);
      recordDeleted("assessmentRecords", "历史考核结果", (await tx.assessmentRecord.deleteMany()).count);
      await tx.leadH5ReviewSequence.deleteMany();
    }
    if (clearAssessmentSettings) {
      recordDeleted("assessmentBrandScopes", "考核适用品牌", (await tx.assessmentBrandScope.deleteMany()).count);
      recordDeleted("assessmentR2StorageReferences", "考核照片存储关联", (await tx.r2StorageReference.deleteMany({ where: { businessType: "ASSESSMENT_PHOTO_STORAGE" } })).count);
      recordDeleted("assessments", "考核表格", (await tx.assessment.deleteMany()).count);
    }
    if (clearResearchRecords) {
      recordDeleted("researchTemplateRecords", "巡店调研记录", (await tx.researchTemplateRecord.deleteMany()).count);
      await tx.leadH5ResearchSequence.deleteMany();
    }
    if (clearResearchTemplates) {
      recordDeleted("researchTemplateBrands", "调研模版适用品牌", (await tx.researchTemplateBrand.deleteMany()).count);
      recordDeleted("researchTemplates", "调研模版", (await tx.researchTemplate.deleteMany()).count);
    }
    if (clearItemRequisitions) {
      recordDeleted("itemRequisitionReturns", "物品返还记录", (await tx.itemRequisitionReturn.deleteMany()).count);
      recordDeleted("itemRequisitions", "领用记录", (await tx.itemRequisition.deleteMany()).count);
      await tx.itemRequisitionSequence.deleteMany();
    }
    if (clearDailyAttendance) {
      recordDeleted("dailyAttendanceRevisions", "考勤修订历史", (await tx.dailyAttendanceRevision.deleteMany()).count);
      recordDeleted("dailyAttendanceItems", "员工考勤明细", (await tx.dailyAttendanceItem.deleteMany()).count);
      recordDeleted("dailyAttendanceRecords", "每日考勤记录", (await tx.dailyAttendanceRecord.deleteMany()).count);
      await tx.dailyAttendanceSequence.deleteMany();
      if (!clearStores) {
        await tx.storeLaborRecord.deleteMany({ where: { attendanceRecordId: null, salesSubmissionId: null } });
        await tx.storeLaborRecord.updateMany({
          where: { attendanceRecordId: null },
          data: {
            actualHeadcount: null,
            laborStatus: "UNABLE_TO_CALCULATE",
            unavailableReason: "缺少考勤记录",
            calculatedAt: new Date(),
          },
        });
      }
    }
    if (clearPersonnel) {
      recordDeleted("birthdayReminderSchedulerRuns", "生日提醒调度记录", (await tx.scheduledJobRun.deleteMany({ where: { jobType: "PERSONNEL_BIRTHDAY_REMINDER" } })).count);
      recordDeleted("salaryHistory", "薪资调整记录", (await tx.salaryHistory.deleteMany()).count);
      recordDeleted("positionHistory", "岗位调动记录", (await tx.positionHistory.deleteMany()).count);
      recordDeleted("personnel", "人员档案", (await tx.personnel.deleteMany()).count);
      await tx.personnelSequence.deleteMany();
    }
    if (targets.includes("workwearInventory")) {
      recordDeleted("inventoryTransactions", "库存流水", (await tx.inventoryTransaction.deleteMany()).count);
      recordDeleted("inventoryItems", "物品档案", (await tx.inventoryItem.deleteMany()).count);
      await tx.inventoryTransactionSequence.deleteMany();
      await tx.inventoryItemSequence.deleteMany();
    }
    if (targets.includes("taskSettings")) {
      recordDeleted("taskR2StorageReferences", "任务存储空间关联", (await tx.r2StorageReference.deleteMany({ where: { businessType: "TASK" } })).count);
      recordDeleted("taskBrands", "任务适用品牌关联", (await tx.taskBrand.deleteMany()).count);
      recordDeleted("taskExecutorRoles", "任务执行角色关联", (await tx.taskExecutorRole.deleteMany()).count);
      recordDeleted("tasks", "任务设置", (await tx.task.deleteMany()).count);
    }
    if (targets.includes("taskCalendarTemplates")) {
      const templateIds = (await tx.taskCalendarTemplate.findMany({ select: { id: true } })).map(row => row.id);
      recordDeleted("taskCalendarDates", "日历任务日期", templateIds.length ? (await tx.taskCalendarDate.deleteMany({ where: { templateId: { in: templateIds } } })).count : 0);
      recordDeleted("taskCalendarTemplates", "日历任务模板", (await tx.taskCalendarTemplate.deleteMany()).count);
    }
    if (clearDailyLearningRecords) {
      recordDeleted("dailyLearningProgress", "每日学习完成记录", (await tx.dailyLearningProgress.deleteMany()).count);
    }
    if (clearDailyLearningSettings) {
      recordDeleted("dailyLearningAssignees", "每日学习分配记录", (await tx.dailyLearningAssignee.deleteMany()).count);
      recordDeleted("dailyLearningPlans", "每日学习计划", (await tx.dailyLearningPlan.deleteMany()).count);
      await tx.dailyLearningSequence.deleteMany();
    }
    if (clearCourseRecords) {
      recordDeleted("courseLessonProgress", "课时学习进度", (await tx.courseLessonProgress.deleteMany()).count);
      recordDeleted("courseLearningProgress", "课程学习进度", (await tx.courseLearningProgress.deleteMany()).count);
      recordDeleted("courseLessonVisits", "课程访问记录", (await tx.courseLessonVisit.deleteMany()).count);
      recordDeleted("courseAssignments", "课程分配明细", (await tx.courseAssignment.deleteMany()).count);
      recordDeleted("courseAssignmentUserScopes", "课程分配用户范围", (await tx.courseAssignmentUserScope.deleteMany()).count);
      recordDeleted("courseAssignmentUsers", "课程分配用户快照", (await tx.courseAssignmentUser.deleteMany()).count);
      recordDeleted("courseAssignmentCourses", "课程分配课程快照", (await tx.courseAssignmentCourse.deleteMany()).count);
      recordDeleted("courseAssignmentBatches", "课程分配记录", (await tx.courseAssignmentBatch.deleteMany()).count);
      await tx.courseAssignmentSequence.deleteMany();
    }
    if (clearCourseSettings) {
      recordDeleted("courseBrands", "课程适用品牌关联", (await tx.courseBrand.deleteMany()).count);
      recordDeleted("courseLessons", "课程课时", (await tx.courseLesson.deleteMany()).count);
      recordDeleted("courses", "课程记录", (await tx.course.deleteMany()).count);
      recordDeleted("courseDrafts", "课程草稿", (await tx.courseDraft.deleteMany()).count);
      await tx.courseLessonSequence.deleteMany();
      await tx.courseSequence.deleteMany();
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
    if (clearStores) {
      recordDeleted("storeCosts", "门店成本参数", (await tx.storeCost.deleteMany()).count);
      recordDeleted("stores", "门店档案", (await tx.store.deleteMany()).count);
    }
    if (targets.includes("contracts")) {
      recordDeleted("contractExpirySchedulerRuns", "合同到期调度记录", (await tx.scheduledJobRun.deleteMany({ where: { jobType: "CONTRACT_EXPIRY" } })).count);
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
      detail: `已清空：${targets.map(target => businessDataTargetLabels[target]).join("、")}；涉及 ${deletedTables.length} 张数据表，共 ${totalCount} 条记录`,
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

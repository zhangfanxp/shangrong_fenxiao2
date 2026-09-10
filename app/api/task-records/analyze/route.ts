import { Prisma, TaskRecordStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { normalizeAiServiceApiConfig } from "@/lib/ai-model-adapters";
import { db } from "@/lib/db";
import { nextTaskAiAnalysisRecordNo, summarizeAnalysisResults, summarizeNames } from "@/lib/intelligent-analysis";
import { writeOperationLog, writeOperationLogWithTransaction } from "@/lib/operation-log";
import { getPlatformConfig } from "@/lib/platform-config";
import { isStoreTaskSnapshot, type StoreTaskItem, type StoreTaskSnapshot } from "@/lib/store-h5-tasks";
import { analyzeTaskSubmissionItem, TaskAiAnalysisError, type TaskAiAnalysisOutput } from "@/lib/task-ai-analysis";
import { readTaskConfig } from "@/lib/task-config";
import { canTaskRecord, taskRecordDataScope } from "@/lib/task-records";

export const maxDuration = 1800;

const inputSchema = z.object({
  taskInstanceIds: z.array(z.string().trim().min(1)).min(1, "请至少勾选一条已完成任务记录").max(200, "单次最多智能分析200条任务记录"),
});

const analysisRecordSelect = {
  id: true,
  taskId: true,
  taskNameSnapshot: true,
  assignedRoleNameSnapshot: true,
  status: true,
  attachments: {
    where: { consumedAt: { not: null } },
    select: { itemIndex: true, objectKey: true, originalName: true, mimeType: true, r2StorageId: true },
    orderBy: { createdAt: "asc" },
  },
  formalSubmission: {
    select: {
      id: true,
      recordNo: true,
      taskIdSnapshot: true,
      taskNameSnapshot: true,
      storeId: true,
      storeNameSnapshot: true,
      brandIdSnapshot: true,
      brandNameSnapshot: true,
      userId: true,
      userRealNameSnapshot: true,
      executionDate: true,
      submittedAt: true,
      configSnapshot: true,
      user: { select: { username: true } },
      items: {
        select: {
          id: true,
          itemName: true,
          componentType: true,
          dataType: true,
          description: true,
          value: true,
          sortOrder: true,
          attachmentObjectKey: true,
          attachmentName: true,
          attachmentMimeType: true,
          r2StorageId: true,
          aiAnalysisTypeSnapshot: true,
          aiAnalysisPromptSnapshot: true,
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  },
} satisfies Prisma.TaskRecordSelect;

type AnalysisRecord = Prisma.TaskRecordGetPayload<{ select: typeof analysisRecordSelect }>;
type SubmittedAnalysisItem = NonNullable<AnalysisRecord["formalSubmission"]>["items"][number];

type AnalysisJob = {
  itemId: string;
  itemName: string;
  hint: string;
  sortOrder: number;
  service: string;
  prompt: string;
  componentType: string;
  dataType: string | null;
  value: string | null;
  attachmentObjectKey: string | null;
  attachmentName: string | null;
  attachmentMimeType: string | null;
  r2StorageId: string | null;
  attachments: Array<{ attachmentObjectKey: string; attachmentName: string; attachmentMimeType: string; r2StorageId: string }>;
};

type CompletedJob = { job: AnalysisJob; output: TaskAiAnalysisOutput };

function safeFailureReason(error: unknown) {
  const message = error instanceof TaskAiAnalysisError ? error.message : "智能分析失败，请稍后重试";
  return message
    .replace(/https?:\/\/\S+/gi, "[接口地址已隐藏]")
    .replace(/((?:password|token|secret|authorization|api[_-]?key)\s*[:=]\s*)[^；,，\s]+/gi, "$1[已隐藏]")
    .slice(0, 1000);
}

function qualifiedState(result: string) {
  if (/不合格/.test(result)) return false;
  if (/合格/.test(result)) return true;
  return null;
}

function hasAiConfiguration(item: { aiAnalysisType?: string | null; aiAnalysisPrompt?: string | null }) {
  return Boolean(item.aiAnalysisType?.trim() && item.aiAnalysisPrompt?.trim());
}

function matchingTemplateItem(items: StoreTaskItem[], submittedItem: SubmittedAnalysisItem) {
  const sameShape = (item: StoreTaskItem) => item.name === submittedItem.itemName
    && item.component === submittedItem.componentType
    && item.dataType === submittedItem.dataType;
  const atOriginalPosition = items[submittedItem.sortOrder];
  if (atOriginalPosition && sameShape(atOriginalPosition)) return atOriginalPosition;
  const matches = items.filter(sameShape);
  return matches.length === 1 ? matches[0] : null;
}

function jobsForRecord(row: AnalysisRecord, currentTemplate: StoreTaskSnapshot | null) {
  const submission = row.formalSubmission!;
  const submissionSnapshot = isStoreTaskSnapshot(submission.configSnapshot) ? submission.configSnapshot : null;
  const recordedConfigurationExists = submission.items.some(item => Boolean(item.aiAnalysisTypeSnapshot?.trim() && item.aiAnalysisPromptSnapshot?.trim()))
    || Boolean(submissionSnapshot?.submitItems.some(hasAiConfiguration));
  const fallbackToCurrentTemplate = !recordedConfigurationExists && Boolean(currentTemplate?.submitItems.some(hasAiConfiguration));
  const jobs: AnalysisJob[] = [];
  for (const item of submission.items) {
    const recordedItem = submissionSnapshot ? matchingTemplateItem(submissionSnapshot.submitItems, item) : null;
    const currentItem = fallbackToCurrentTemplate && currentTemplate ? matchingTemplateItem(currentTemplate.submitItems, item) : null;
    const configuredItem = recordedItem && hasAiConfiguration(recordedItem) ? recordedItem : currentItem;
    const service = item.aiAnalysisTypeSnapshot || configuredItem?.aiAnalysisType || "";
    const prompt = item.aiAnalysisPromptSnapshot || configuredItem?.aiAnalysisPrompt || "";
    if (!service && !prompt) continue;
    const linkedAttachments = row.attachments.filter(attachment => attachment.itemIndex === item.sortOrder).map(attachment => ({
      attachmentObjectKey: attachment.objectKey,
      attachmentName: attachment.originalName,
      attachmentMimeType: attachment.mimeType,
      r2StorageId: attachment.r2StorageId,
    }));
    jobs.push({
      itemId: item.id,
      itemName: item.itemName,
      hint: item.description || configuredItem?.description || "",
      sortOrder: item.sortOrder,
      service,
      prompt,
      componentType: item.componentType,
      dataType: item.dataType,
      value: item.value,
      attachmentObjectKey: item.attachmentObjectKey,
      attachmentName: item.attachmentName,
      attachmentMimeType: item.attachmentMimeType,
      r2StorageId: item.r2StorageId,
      attachments: linkedAttachments,
    });
  }
  return { jobs, fallbackToCurrentTemplate };
}

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canTaskRecord(session, "analyze")) return NextResponse.json({ message: "暂无任务记录智能分析权限" }, { status: 403 });
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message }, { status: 400 });
  const taskInstanceIds = [...new Set(parsed.data.taskInstanceIds)];

  try {
    const rows = await db.taskRecord.findMany({
      where: { AND: [{ id: { in: taskInstanceIds } }, await taskRecordDataScope(session)] },
      select: analysisRecordSelect,
    });
    if (rows.length !== taskInstanceIds.length) return NextResponse.json({ message: "部分任务记录已不存在或不在当前数据权限范围内，请刷新后重试" }, { status: 404 });
    if (rows.some(row => row.status !== TaskRecordStatus.COMPLETED)) return NextResponse.json({ message: "智能分析只能选择状态为“已完成”的任务记录" }, { status: 400 });
    if (rows.some(row => !row.formalSubmission)) return NextResponse.json({ message: "部分已完成任务缺少正式提交明细，暂时无法智能分析" }, { status: 409 });

    const brandIds = [...new Set(rows.map(row => row.formalSubmission!.brandIdSnapshot).filter(Boolean))];
    const brands = await db.brand.findMany({ where: { id: { in: brandIds } }, select: { id: true, code: true } });
    const brandCodes = new Map(brands.map(brand => [brand.id, brand.code]));
    const selectedTasks = await db.task.findMany({
      where: { id: { in: [...new Set(rows.map(row => row.taskId))] } },
      select: { id: true, configFileName: true },
    });
    const currentTemplates = new Map<string, StoreTaskSnapshot>();
    await Promise.all(selectedTasks.map(async task => {
      if (!task.configFileName) return;
      const config = await readTaskConfig(task.configFileName).catch(() => null);
      if (isStoreTaskSnapshot(config)) currentTemplates.set(task.id, config);
    }));
    const platform = await getPlatformConfig();
    const failures: Array<{ recordNo: string; itemName: string; reason: string }> = [];
    const replacements: Array<{ taskRecordNo: string; oldRecordNo: string | null; newRecordNo: string }> = [];
    let analysisItemCount = 0;
    let currentTemplateFallbackCount = 0;
    let cursor = 0;

    const analyzeRecord = async (row: AnalysisRecord) => {
      const submission = row.formalSubmission!;
      const { jobs, fallbackToCurrentTemplate } = jobsForRecord(row, currentTemplates.get(row.taskId) || null);
      analysisItemCount += jobs.length;
      if (fallbackToCurrentTemplate) currentTemplateFallbackCount += 1;
      if (!jobs.length) {
        failures.push({ recordNo: submission.recordNo, itemName: "-", reason: "任务记录快照及当前任务模板中均未找到可进行智能分析的任务项" });
        return;
      }

      const completed: CompletedJob[] = [];
      for (const job of jobs) {
        try {
          if (!job.service || !job.prompt) throw new TaskAiAnalysisError("任务项的AI分析配置快照不完整");
          const apiConfig = normalizeAiServiceApiConfig(platform.aiApiServices[job.service], job.service);
          const analysisAttachments = job.componentType === "attachment" && job.attachments.length ? job.attachments : [{ attachmentObjectKey: job.attachmentObjectKey, attachmentName: job.attachmentName, attachmentMimeType: job.attachmentMimeType, r2StorageId: job.r2StorageId }];
          const outputs: TaskAiAnalysisOutput[] = [];
          for (const attachment of analysisAttachments) {
            outputs.push(await analyzeTaskSubmissionItem({ ...job, ...attachment, model: apiConfig.selectedModel, endpoint: apiConfig.endpoints[apiConfig.selectedModel] }));
          }
          const output = outputs.length === 1 ? outputs[0] : {
            analysisResult: outputs.map((result, index) => `附件${index + 1}：${result.analysisResult}`).join("\n"),
            unqualifiedReasonDescription: outputs.map((result, index) => `附件${index + 1}：${result.unqualifiedReasonDescription}`).join("\n"),
          };
          if (!output.analysisResult.trim()) throw new TaskAiAnalysisError("智能分析结果处理失败，请稍后重试");
          completed.push({ job, output });
        } catch (error) {
          failures.push({ recordNo: submission.recordNo, itemName: job.itemName, reason: safeFailureReason(error) });
          return;
        }
      }

      const analyzedAt = new Date();
      const typeNames = completed.map(item => item.job.service);
      const analysisResultSummary = summarizeAnalysisResults(completed.map(item => ({ isQualified: qualifiedState(item.output.analysisResult) })));

      try {
        const replacement = await db.$transaction(async tx => {
          await tx.$queryRaw(Prisma.sql`SELECT \`id\` FROM \`TaskRecord\` WHERE \`id\` = ${row.id} FOR UPDATE`);
          const current = await tx.taskRecord.findUnique({
            where: { id: row.id },
            select: {
              status: true,
              formalSubmission: {
                select: {
                  id: true,
                  items: { where: { id: { in: completed.map(item => item.job.itemId) } }, select: { id: true, attachmentObjectKey: true } },
                },
              },
            },
          });
          const currentAttachments = new Map(current?.formalSubmission?.items.map(item => [item.id, item.attachmentObjectKey]) || []);
          if (!current || current.status !== TaskRecordStatus.COMPLETED || current.formalSubmission?.id !== submission.id
            || completed.some(({ job }) => currentAttachments.get(job.itemId) !== job.attachmentObjectKey)) throw new Error("TASK_RECORD_CHANGED");
          const old = await tx.taskAiAnalysis.findUnique({ where: { taskRecordId: row.id }, select: { recordNo: true } });
          const newRecordNo = await nextTaskAiAnalysisRecordNo(tx, analyzedAt);
          if (old) await tx.taskAiAnalysis.delete({ where: { taskRecordId: row.id } });
          await tx.taskAiAnalysis.create({ data: {
            recordNo: newRecordNo,
            taskRecordId: row.id,
            taskRecordNo: submission.recordNo,
            taskSettingId: submission.taskIdSnapshot || row.taskId,
            taskNameSnapshot: row.taskNameSnapshot || submission.taskNameSnapshot,
            brandIdSnapshot: submission.brandIdSnapshot || null,
            brandCodeSnapshot: brandCodes.get(submission.brandIdSnapshot) || null,
            brandNameSnapshot: submission.brandNameSnapshot,
            storeIdSnapshot: submission.storeId,
            storeNameSnapshot: submission.storeNameSnapshot,
            executorUserIdSnapshot: submission.userId,
            executorUsernameSnapshot: submission.user.username,
            executorNameSnapshot: submission.userRealNameSnapshot,
            executorRoleSnapshot: row.assignedRoleNameSnapshot || null,
            taskExecutionDate: submission.executionDate,
            taskSubmittedAt: submission.submittedAt,
            taskItemCount: completed.length,
            analysisTypeSummary: summarizeNames(typeNames, "类"),
            analysisResultSummary,
            analyzedByUserId: session.userId,
            analyzedByName: session.realName,
            analyzedAt,
            items: { create: completed.map(({ job, output }) => ({
              taskItemIdSnapshot: job.itemId,
              taskItemNameSnapshot: job.itemName,
              hintSnapshot: job.hint || null,
              analysisTypeCodeSnapshot: job.service,
              analysisTypeNameSnapshot: job.service,
              analysisPromptSnapshot: job.prompt,
              analysisResult: output.analysisResult,
              isQualified: qualifiedState(output.analysisResult),
              unqualifiedReason: qualifiedState(output.analysisResult) === false ? output.unqualifiedReasonDescription || null : null,
              analyzedAt,
              sortOrder: job.sortOrder,
            })) },
          } });
          for (const { job, output } of completed) {
            await tx.taskSubmissionItem.update({ where: { id: job.itemId }, data: {
              aiAnalysisTypeSnapshot: job.service,
              aiAnalysisPromptSnapshot: job.prompt,
              aiAnalysisStatus: "SUCCESS",
              aiAnalysisResult: output.analysisResult,
              aiUnqualifiedReasonDescription: qualifiedState(output.analysisResult) === false ? output.unqualifiedReasonDescription : null,
              aiAnalysisFailureReason: null,
              aiAnalyzedAt: analyzedAt,
              aiAnalyzedByUserId: session.userId,
              aiAnalyzedByName: session.realName,
            } });
          }
          await writeOperationLogWithTransaction(tx, {
            userId: session.userId,
            username: session.username,
            page: "任务记录",
            action: old ? "重新智能分析" : "智能分析",
            result: "成功",
            detail: `任务记录编号：${submission.recordNo}；旧智能分析记录编号：${old?.recordNo || "-"}；新智能分析记录编号：${newRecordNo}；分析任务项：${completed.length}项；操作人：${session.realName}`,
            request,
            createdAt: analyzedAt,
          });
          return { taskRecordNo: submission.recordNo, oldRecordNo: old?.recordNo || null, newRecordNo };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 });
        replacements.push(replacement);
      } catch {
        failures.push({ recordNo: submission.recordNo, itemName: "-", reason: "智能分析结果保存失败，请稍后重试" });
      }
    };

    const worker = async () => {
      while (cursor < rows.length) {
        const row = rows[cursor];
        cursor += 1;
        await analyzeRecord(row);
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, rows.length) }, () => worker()));

    const successCount = replacements.length;
    const failureCount = rows.length - successCount;
    const selectedDayCount = new Set(rows.map(row => row.formalSubmission!.executionDate.toISOString().slice(0, 10))).size;
    await writeOperationLog({
      userId: session.userId,
      username: session.username,
      page: "任务记录",
      action: "批量智能分析",
      result: failureCount ? "失败" : "成功",
      detail: `选中任务记录：${rows.length}条；涉及任务日期：${selectedDayCount}天；分析任务项：${analysisItemCount}项；使用当前任务模板补充AI配置：${currentTemplateFallbackCount}条；成功：${successCount}条；失败：${failureCount}条`,
      request,
    }).catch(() => undefined);
    return NextResponse.json({
      message: `智能分析完成：成功${successCount}条，失败${failureCount}条${currentTemplateFallbackCount ? `；其中${currentTemplateFallbackCount}条历史记录已按当前任务模板匹配AI配置` : ""}`,
      selectedRecordCount: rows.length,
      selectedDayCount,
      analysisItemCount,
      successCount,
      failureCount,
      currentTemplateFallbackCount,
      replacements,
      failures: failures.slice(0, 20),
    });
  } catch {
    await writeOperationLog({ userId: session.userId, username: session.username, page: "任务记录", action: "批量智能分析", result: "失败", detail: `批量智能分析发生系统异常；选择记录：${taskInstanceIds.length}条`, request }).catch(() => undefined);
    return NextResponse.json({ message: "任务记录智能分析失败，请稍后重试" }, { status: 500 });
  }
}

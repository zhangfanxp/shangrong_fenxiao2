import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { LeadH5Session } from "@/lib/lead-h5-auth";
import { hasRolePermission, hasRolePlatformAccess } from "@/lib/role-permissions";
import { resolveStoreRegionManager } from "@/lib/store-supervisor";
import { dateKeyAsDbDate, shanghaiDateKey, type StoreTaskSnapshot } from "@/lib/store-h5-tasks";
import { createTaskAttachmentReadUrl } from "@/lib/task-r2-upload";
import { writeOperationLogWithTransaction } from "@/lib/operation-log";
import {
  RECTIFICATION_DEFAULT_REQUIREMENT, RECTIFICATION_TASK_ID, rectificationDateTime, rectificationDeadline,
  rectificationIsOverdue, type RectificationPerson, type RectificationStatus,
} from "@/lib/inspection-rectification-shared";

export class RectificationError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

const fullInclude = {
  reviewItem: { include: { review: { include: { store: true, assessment: { select: { r2StorageId: true } } } }, photos: { orderBy: { createdAt: "asc" as const } } } },
  rounds: { orderBy: { roundNumber: "desc" as const } },
} satisfies Prisma.InspectionRectificationInclude;
type FullRectification = Prisma.InspectionRectificationGetPayload<{ include: typeof fullInclude }>;
type Round = FullRectification["rounds"][number];
type Actor = Pick<LeadH5Session, "userId" | "username" | "realName">;

export function readRectificationRecipients(value: unknown): RectificationPerson[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(row => row && typeof row === "object" && typeof row.id === "string" && typeof row.name === "string" ? [{ id: row.id, name: row.name }] : []);
}

export function rectificationIssueNumbers(recordNo: string, items: { id: string; result: string; sortOrder: number }[]) {
  const issues = items.filter(item => item.result === "FAIL" || item.result === "PARTIAL").sort((a, b) => a.sortOrder - b.sortOrder);
  if (issues.length > 999) throw new RectificationError("单次巡检的问题明细不能超过999项");
  return issues.map((item, index) => ({ reviewItemId: item.id, recordNo: `${recordNo}_${String(index + 1).padStart(3, "0")}` }));
}

export async function createInspectionRectifications(tx: Prisma.TransactionClient, recordNo: string, items: { id: string; result: string; sortOrder: number }[]) {
  const rows = rectificationIssueNumbers(recordNo, items);
  if (rows.length) await tx.inspectionRectification.createMany({ data: rows });
}

export async function ensureReviewHasNoStartedRectification(tx: Prisma.TransactionClient, reviewId: string) {
  const started = await tx.inspectionRectificationRound.count({ where: { rectification: { reviewItem: { reviewId } } } });
  if (started) throw new RectificationError("该巡检记录已发起整改，不能删除", 409);
}

export async function ownedRectification(id: string, userId: string, tx: Prisma.TransactionClient = db) {
  const row = await tx.inspectionRectification.findFirst({ where: { id, reviewItem: { review: { reviewerUserId: userId } } }, include: fullInclude });
  if (!row) throw new RectificationError("整改记录不存在或不属于当前用户", 404);
  return row;
}

export function rectificationInspection(row: FullRectification) {
  const item = row.reviewItem;
  const review = item.review;
  return {
    recordNo: row.recordNo, assessmentDate: review.assessmentDate, reviewerName: review.reviewerRealName,
    storeName: review.storeNameSnapshot, brandName: review.brandNameSnapshot, assessmentName: review.assessmentName,
    sectionName: item.sectionName, subsectionName: item.subsectionName, itemDescription: item.itemDescription,
    problemDescription: item.problemDescription, result: item.result,
  };
}

async function photoViews(photos: { id: string; originalName: string; r2StorageId: string; objectKey: string }[]) {
  return Promise.all(photos.map(async photo => ({ id: photo.id, name: photo.originalName,
    url: await createTaskAttachmentReadUrl(photo).catch(() => null),
  })));
}

export async function rectificationDetail(row: FullRectification) {
  const taskRecords = row.rounds.length ? await db.taskRecord.findMany({
    where: { id: { in: row.rounds.map(round => round.taskRecordId) } },
    select: { id: true, attachments: { where: { consumedAt: { not: null } }, orderBy: { createdAt: "asc" }, select: { id: true, originalName: true, r2StorageId: true, objectKey: true } } },
  }) : [];
  return {
    id: row.id, recordNo: row.recordNo, status: row.status as RectificationStatus,
    inspection: { ...rectificationInspection(row), photos: await photoViews(row.reviewItem.photos) },
    noActionReason: row.noActionReason, noActionAt: row.noActionAt, noActionByName: row.noActionByName,
    rounds: await Promise.all(row.rounds.map(async round => ({
      ...round, ccRecipients: readRectificationRecipients(round.ccRecipients),
      overdue: rectificationIsOverdue(round.dueAt, round.submittedAt),
      photos: await photoViews(taskRecords.find(task => task.id === round.taskRecordId)?.attachments || []),
    }))),
  };
}

export async function rectificationTaskContext(taskRecordId: string, userId: string) {
  const row = await db.inspectionRectification.findFirst({
    where: { rounds: { some: { taskRecordId, responsibleUserId: userId } } }, include: fullInclude,
  });
  if (!row) return null;
  const round = row.rounds.find(round => round.taskRecordId === taskRecordId)!;
  return {
    inspection: { ...rectificationInspection(row), photos: await photoViews(row.reviewItem.photos) },
    round: { ...round, ccRecipients: readRectificationRecipients(round.ccRecipients),
      overdue: rectificationIsOverdue(round.dueAt, round.submittedAt), photos: [] },
  };
}

function canCompleteStoreTasks(permissions: unknown) {
  const values = Array.isArray(permissions) ? permissions.filter((v): v is string => typeof v === "string") : [];
  return hasRolePlatformAccess(values, "store-h5") && ["query", "view", "attachment", "submit"].every(action => hasRolePermission(values, `store-h5:tasks:${action}`));
}

async function responsiblePeople(row: FullRectification, tx: Prisma.TransactionClient) {
  const { store, reviewType } = row.reviewItem.review;
  const defaultId = reviewType === "BACK_KITCHEN_AUDIT" ? store.chefUserId : store.managerUserId;
  const previousId = row.rounds[0]?.responsibleUserId;
  const users = await tx.user.findMany({
    where: { status: "ENABLED", role: { status: "ENABLED" }, OR: [
      { id: { in: [store.managerUserId, store.chefUserId, previousId].filter((id): id is string => !!id) } },
      { personnelProfile: { is: { storeId: store.id, status: "ACTIVE", deletedAt: null } } },
    ] },
    select: { id: true, realName: true, leadH5BrandIds: true, role: { select: { permissions: true } } }, orderBy: [{ realName: "asc" }, { id: "asc" }],
  });
  const options = users.filter(user => canCompleteStoreTasks(user.role.permissions)
    && (!Array.isArray(user.leadH5BrandIds) || !user.leadH5BrandIds.length || user.leadH5BrandIds.includes(store.brandId)))
    .map(user => ({ id: user.id, name: user.realName }));
  return { options, defaultId: options.some(user => user.id === defaultId) ? defaultId : null };
}

async function defaultRecipients(row: FullRectification, tx: Prisma.TransactionClient) {
  const manager = await resolveStoreRegionManager(row.reviewItem.review.store.region, tx);
  const users = await tx.user.findMany({
    where: { status: "ENABLED", role: { status: "ENABLED" }, OR: [
      ...(manager ? [{ id: manager.id }] : []),
      { role: { name: { in: ["运营总监", "运营助理", "总经理"] } } },
    ] }, select: { id: true, realName: true }, orderBy: [{ realName: "asc" }, { id: "asc" }],
  });
  return users.map(user => ({ id: user.id, name: user.realName }));
}

export async function rectificationOptions(row: FullRectification, query = "") {
  const [responsible, defaults, users] = await Promise.all([
    responsiblePeople(row, db), defaultRecipients(row, db),
    db.user.findMany({ where: { status: "ENABLED", role: { status: "ENABLED" }, ...(query.trim() ? { OR: [{ realName: { contains: query.trim() } }, { username: { contains: query.trim() } }] } : {}) },
      select: { id: true, realName: true, role: { select: { name: true } } }, orderBy: [{ realName: "asc" }, { id: "asc" }], take: 50 }),
  ]);
  return { responsibleOptions: responsible.options, fixedResponsibleId: row.rounds.length ? null : responsible.defaultId,
    defaultResponsibleId: row.rounds[0]?.responsibleUserId || responsible.defaultId,
    defaultCcRecipients: row.rounds[0] ? readRectificationRecipients(row.rounds[0].ccRecipients) : defaults,
    users: users.map(user => ({ id: user.id, name: user.realName, roleName: user.role.name })),
  };
}

export type RectificationRoundInput = { deadlineHours: number; responsibleUserId: string; requirement: string; ccUserIds: string[] };

async function resolveRoundInput(row: FullRectification, input: RectificationRoundInput, tx: Prisma.TransactionClient) {
  const people = await responsiblePeople(row, tx);
  if (!row.rounds.length && people.defaultId && input.responsibleUserId !== people.defaultId) throw new RectificationError("当前门店已配置责任人，首次发起时不能修改");
  const responsible = people.options.find(person => person.id === input.responsibleUserId);
  if (!responsible) throw new RectificationError("请选择当前门店有效且有门店H5任务权限的人员");
  const ids = [...new Set(input.ccUserIds)];
  if (ids.length > 10) throw new RectificationError("抄送人不能超过10人");
  const users = ids.length ? await tx.user.findMany({ where: { id: { in: ids }, status: "ENABLED", role: { status: "ENABLED" } }, select: { id: true, realName: true } }) : [];
  if (users.length !== ids.length) throw new RectificationError("部分抄送人已停用或不存在，请重新选择");
  return { responsible, ccRecipients: ids.map(id => ({ id, name: users.find(user => user.id === id)!.realName })) };
}

async function createRound(row: FullRectification, input: RectificationRoundInput, tx: Prisma.TransactionClient, now: Date) {
  const { responsible, ccRecipients } = await resolveRoundInput(row, input, tx);
  const review = row.reviewItem.review;
  const r2Storage = review.assessment.r2StorageId ? await tx.r2StorageConfig.findFirst({ where: { id: review.assessment.r2StorageId, status: "ENABLED", deletedAt: null }, select: { id: true, name: true, bucketName: true } }) : null;
  if (!r2Storage) throw new RectificationError("当前巡检表未配置有效的照片存储空间，请先完善配置", 409);
  const roundNumber = (row.rounds[0]?.roundNumber || 0) + 1;
  const dueAt = rectificationDeadline(now, input.deadlineHours);
  const config: StoreTaskSnapshot = {
    taskName: "巡检整改", taskType: "临时任务", taskTarget: "门店", configVersion: 1, storageSpace: r2Storage,
    submitItems: [
      { name: "整改照片", component: "attachment", dataType: "photo", options: [], description: "请上传整改后的照片，至少1张，最多5张", required: true, weight: 5 },
      { name: "整改说明", component: "input", dataType: "text", options: [], description: "请填写整改说明（选填）", required: false, weight: 1 },
    ],
  };
  await tx.task.upsert({ where: { id: RECTIFICATION_TASK_ID }, update: {}, create: {
    id: RECTIFICATION_TASK_ID, title: "巡检整改", type: "TEMPORARY", targetType: "STORE",
  } });
  const user = await tx.user.findUniqueOrThrow({ where: { id: responsible.id }, select: { roleId: true, role: { select: { name: true } } } });
  const task = await tx.taskRecord.create({ data: {
    recordNo: `RX${crypto.randomUUID().replaceAll("-", "").slice(0, 22)}`, taskId: RECTIFICATION_TASK_ID,
    taskNameSnapshot: `巡检整改 · ${row.recordNo} · 第${roundNumber}轮`, taskType: "TEMPORARY", targetType: "STORE",
    storeId: review.storeId, storeNameSnapshot: review.storeNameSnapshot, brandIdSnapshot: review.brandId,
    brandNameSnapshot: review.brandNameSnapshot, assignedUserId: responsible.id, assignedUserNameSnapshot: responsible.name,
    assignedRoleIdSnapshot: user.roleId, assignedRoleNameSnapshot: user.role.name,
    targetPersonnelKey: `RECTIFICATION:${row.id}:${roundNumber}`, executionDate: dateKeyAsDbDate(shanghaiDateKey(now)),
    effectiveStartAt: now, effectiveEndAt: dueAt, dueDate: dueAt, triggeredAt: now,
    configVersion: 1, configSnapshot: config as unknown as Prisma.InputJsonValue,
  } });
  const round = await tx.inspectionRectificationRound.create({ data: {
    rectificationId: row.id, roundNumber, generatedAt: now, deadlineHours: input.deadlineHours, dueAt,
    responsibleUserId: responsible.id, responsibleName: responsible.name, requirement: input.requirement.trim(),
    ccRecipients: ccRecipients as Prisma.InputJsonValue, taskRecordId: task.id,
  } });
  await tx.r2StorageReference.create({ data: { r2ConfigId: r2Storage.id, businessType: "INSPECTION_RECTIFICATION", businessId: round.id } });
  await tx.inspectionRectification.update({ where: { id: row.id }, data: { status: "IN_PROGRESS" } });
  return round;
}

async function notifyRound(tx: Prisma.TransactionClient, row: FullRectification, round: Round, actor: Actor, event: "GENERATED" | "QUALIFIED" | "REJECTED", now: Date, previous?: Round) {
  const cc = readRectificationRecipients(round.ccRecipients);
  const ids = [...new Set([...cc.map(person => person.id), ...(event === "GENERATED" ? [] : [round.responsibleUserId, ...(previous ? [previous.responsibleUserId, ...readRectificationRecipients(previous.ccRecipients).map(person => person.id)] : [])])])];
  const users = ids.length ? await tx.user.findMany({ where: { id: { in: ids }, status: "ENABLED", role: { status: "ENABLED" } }, select: { id: true, username: true, realName: true, role: { select: { name: true } } } }) : [];
  if (!users.length) return;
  const inspection = rectificationInspection(row);
  const eventLabel = event === "GENERATED" ? "已发起整改" : event === "QUALIFIED" ? "验收合格" : "验收不合格，已重新发起整改";
  const checked = previous || (event === "QUALIFIED" ? round : null);
  const content = [
    `巡检整改：${eventLabel}`, `记录编号：${row.recordNo}`, `巡检日期：${rectificationDateTime(inspection.assessmentDate)}`,
    `巡检人：${inspection.reviewerName}`, `门店：${inspection.brandName}|${inspection.storeName}`, `检查表：${inspection.assessmentName}`,
    `总项&子项：${inspection.sectionName} / ${inspection.subsectionName}`, `检查明细项：${inspection.itemDescription}`,
    `原检查结果：${inspection.result === "FAIL" ? "不合格" : "部分合格"}`, `问题描述：${inspection.problemDescription || "-"}`,
    `整改轮次：第${round.roundNumber}轮`, `生成时间：${rectificationDateTime(round.generatedAt)}`,
    `时间节点：${round.deadlineHours === 168 ? "一周内" : `${round.deadlineHours}小时内`}`, `截止时间：${rectificationDateTime(round.dueAt)}`,
    `责任人：${round.responsibleName}`, `整改要求：${round.requirement || "-"}`, `抄送人：${cc.map(person => person.name).join("、") || "无"}`,
    ...(checked ? [`验收轮次：第${checked.roundNumber}轮`, `整改提交时间：${rectificationDateTime(checked.submittedAt)}`, `整改说明：${checked.submissionDescription || "-"}`, `是否超时：${rectificationIsOverdue(checked.dueAt, checked.submittedAt) ? "已超时" : "未超时"}`, `验收时间：${rectificationDateTime(now)}`, `验收人：${actor.realName}`, `验收结果：${event === "QUALIFIED" ? "合格" : "不合格"}`, ...(checked.rejectionReason ? [`不合格原因：${checked.rejectionReason}`] : [])] : []),
  ].join("\n");
  const dateKey = shanghaiDateKey(now).replaceAll("-", "");
  const sequence = await tx.notificationSequence.upsert({ where: { dateKey }, create: { dateKey, nextValue: 2 }, update: { nextValue: { increment: 1 } } });
  if (sequence.nextValue - 1 > 9999) throw new RectificationError("今日通知编号已达到上限", 409);
  await tx.notification.create({ data: {
    recordNo: `${dateKey}${String(sequence.nextValue - 1).padStart(4, "0")}`, clientRequestId: `rectification:${round.id}:${event}`,
    title: event === "GENERATED" ? "巡检整改通知" : event === "QUALIFIED" ? "巡检整改验收合格" : "巡检整改验收不合格",
    content, type: "GENERAL", publishMode: "IMMEDIATE", releaseDate: dateKeyAsDbDate(shanghaiDateKey(now)), releaseAt: now,
    publisherName: actor.realName.slice(0, 10), createdByUserId: actor.userId, createdByName: actor.realName.slice(0, 30),
    status: "PUBLISHED", publishedAt: now, recipients: { create: users.map(user => ({ userId: user.id,
      usernameSnapshot: user.username.slice(0, 30), realNameSnapshot: user.realName.slice(0, 30), roleSnapshot: user.role.name.slice(0, 50),
    })) },
  } });
}

export async function rectificationTransaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>) {
  for (let attempt = 0; ; attempt++) {
    try { return await db.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 20000 }); }
    catch (error) { if (attempt < 2 && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") continue; throw error; }
  }
}

export type RectificationAction =
  | { action: "start"; round: RectificationRoundInput }
  | { action: "no-action"; reason: string }
  | { action: "accept"; roundNumber: number }
  | { action: "reject"; roundNumber: number; reason: string; round: RectificationRoundInput };

export async function actOnRectification(id: string, actor: Actor, action: RectificationAction, request?: Request) {
  return rectificationTransaction(async tx => {
    await tx.$queryRaw`SELECT id FROM InspectionRectification WHERE id = ${id} FOR UPDATE`;
    const row = await ownedRectification(id, actor.userId, tx);
    const now = new Date();
    if (action.action === "start" || action.action === "no-action") {
      if (row.status !== "PENDING") throw new RectificationError("该问题已处理，请刷新后重试", 409);
      if (action.action === "no-action") {
        await tx.inspectionRectification.update({ where: { id }, data: { status: "NO_ACTION", noActionReason: action.reason.trim() || null, noActionAt: now, noActionByName: actor.realName } });
      } else {
        const round = await createRound(row, action.round, tx, now);
        await notifyRound(tx, row, round, actor, "GENERATED", now);
      }
    } else {
      const current = row.rounds[0];
      if (row.status !== "PENDING_ACCEPTANCE" || !current?.submittedAt || current.acceptedAt || current.roundNumber !== action.roundNumber) throw new RectificationError("当前验收状态已变化，请刷新后重试", 409);
      const accepted = await tx.inspectionRectificationRound.update({ where: { id: current.id }, data: {
        acceptedAt: now, acceptanceResult: action.action === "accept" ? "QUALIFIED" : "REJECTED",
        acceptedByUserId: actor.userId, acceptedByName: actor.realName, rejectionReason: action.action === "reject" ? action.reason.trim() || null : null,
      } });
      if (action.action === "accept") {
        await tx.inspectionRectification.update({ where: { id }, data: { status: "QUALIFIED" } });
        await notifyRound(tx, row, accepted, actor, "QUALIFIED", now);
      } else {
        const next = await createRound(row, action.round, tx, now);
        await notifyRound(tx, row, next, actor, "REJECTED", now, accepted);
      }
    }
    const label = { start: "立即整改", "no-action": "无需整改", accept: "验收合格", reject: "验收不合格" }[action.action];
    await writeOperationLogWithTransaction(tx, { userId: actor.userId, username: actor.username, client: "运营移动端", page: "巡检整改", action: label, result: "成功", detail: `记录编号：${row.recordNo}`, request });
    return { message: `${label}成功` };
  });
}

// 和任务的正式提交处于同一事务，避免任务已完成而整改仍停在“整改中”。
export async function submitRectificationTask(tx: Prisma.TransactionClient, taskRecordId: string, userId: string, description: string, now: Date) {
  const round = await tx.inspectionRectificationRound.findUnique({ where: { taskRecordId }, include: { rectification: true } });
  if (!round) return;
  if (round.responsibleUserId !== userId || round.submittedAt || round.rectification.status !== "IN_PROGRESS") throw new RectificationError("整改任务状态已变化，请刷新后重试", 409);
  await tx.inspectionRectificationRound.update({ where: { id: round.id }, data: { submittedAt: now, submissionDescription: description.trim() || null } });
  const changed = await tx.inspectionRectification.updateMany({ where: { id: round.rectificationId, status: "IN_PROGRESS" }, data: { status: "PENDING_ACCEPTANCE" } });
  if (changed.count !== 1) throw new RectificationError("整改任务状态已变化，请刷新后重试", 409);
}

export { RECTIFICATION_DEFAULT_REQUIREMENT };

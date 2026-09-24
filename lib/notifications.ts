import { MeetingType, NotificationPublishMode, NotificationStatus, NotificationType, Prisma, RecordStatus } from "@prisma/client";
import { z } from "zod";
import type { Session } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeOperationLog, writeOperationLogWithTransaction } from "@/lib/operation-log";

export type NotificationPermission = "access" | "save" | "select-users";

export function canPublishNotification(session: Pick<Session, "permissions">, action: NotificationPermission) {
  return session.permissions.includes("*")
    || session.permissions.includes("notifications:publish")
    || session.permissions.includes(`notifications:publish:${action}`);
}

const shanghaiDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const shanghaiDateTimeFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export function shanghaiDateKey(value = new Date()) {
  return shanghaiDateFormatter.format(value);
}

export function nextShanghaiDate(value = new Date()) {
  const today = shanghaiDateKey(value);
  const next = new Date(`${today}T12:00:00+08:00`);
  next.setUTCDate(next.getUTCDate() + 1);
  return shanghaiDateKey(next);
}

export function formatShanghaiDateTime(value: Date) {
  const parts = shanghaiDateTimeFormatter.formatToParts(value);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value || "";
  return `${read("year")}-${read("month")}-${read("day")} ${read("hour")}:${read("minute")}:${read("second")}`;
}

function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return shanghaiDateKey(new Date(`${value}T12:00:00+08:00`)) === value;
}

export const createNotificationSchema = z.object({
  clientRequestId: z.string().trim().min(8).max(64),
  title: z.string().trim().min(1, "请输入通知标题").max(30, "通知标题不能超过30个字符")
    .regex(/^[\p{Script=Han}A-Za-z0-9-]+$/u, "通知标题仅支持汉字、数字、英文字母和“-”"),
  recipientUserIds: z.array(z.string().trim().min(1)).min(1, "请至少选择1位接收人").max(10000, "单次通知接收人数不能超过10000人"),
  content: z.string().min(1, "请输入通知正文").max(500, "通知正文不能超过500个字符")
    .refine(value => Boolean(value.trim()), "请输入通知正文"),
  releaseDate: z.string().optional().refine(value => value === undefined || isCalendarDate(value), "请选择正确的发布日期"),
  publisherName: z.string().trim().min(1, "请输入发布人").max(10, "发布人不能超过10个字符"),
  notificationType: z.any()
    .refine(value => Object.values(NotificationType).includes(value as NotificationType), "请选择通知类型")
    .transform(value => value as NotificationType),
  showAfterLogin: z.boolean().default(false),
  publishImmediately: z.boolean().default(false),
});

function meetingTypeForNotification(type: NotificationType) {
  if (type === NotificationType.MID_MONTH_OFFLINE_MEETING) return MeetingType.MID_MONTH_OFFLINE;
  if (type === NotificationType.MONTHLY_ONLINE_MEETING) return MeetingType.MONTHLY_ONLINE;
  if (type === NotificationType.QUARTERLY_OFFLINE_MEETING) return MeetingType.QUARTERLY_OFFLINE;
  return null;
}

export function resolveNotificationRelease(publishImmediately: boolean, requestedReleaseDate: string | undefined, now = new Date()) {
  const releaseDateKey = publishImmediately ? shanghaiDateKey(now) : requestedReleaseDate;
  if (!releaseDateKey) throw new Error("请选择发布日期");
  return {
    releaseDateKey,
    releaseDate: new Date(`${releaseDateKey}T00:00:00.000Z`),
    releaseAt: publishImmediately ? now : new Date(`${releaseDateKey}T06:00:00+08:00`),
    publishMode: publishImmediately ? NotificationPublishMode.IMMEDIATE : NotificationPublishMode.SCHEDULED,
    status: publishImmediately ? NotificationStatus.PUBLISHED : NotificationStatus.PENDING,
    publishedAt: publishImmediately ? now : null,
  };
}

type Scope = { brandIds: string[] | null; storeIds: string[] | null };

function jsonIds(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item)) : null;
}

async function publisherScope(session: Session): Promise<Scope> {
  if (session.permissions.includes("*")) return { brandIds: null, storeIds: null };
  const user = await db.user.findUnique({ where: { id: session.userId }, select: { leadH5BrandIds: true, leadH5StoreIds: true } });
  if (!user) return { brandIds: [], storeIds: [] };
  const permissionBrandIds = session.permissions.filter(value => value.startsWith("data:brand:")).map(value => value.slice(11)).filter(Boolean);
  const permissionStoreIds = session.permissions.filter(value => value.startsWith("data:store:")).map(value => value.slice(11)).filter(Boolean);
  return {
    brandIds: jsonIds(user.leadH5BrandIds) ?? (permissionBrandIds.length ? permissionBrandIds : null),
    storeIds: jsonIds(user.leadH5StoreIds) ?? (permissionStoreIds.length ? permissionStoreIds : null),
  };
}

export async function availableRecipientUserIds(session: Session) {
  const scope = await publisherScope(session);
  if (scope.brandIds === null && scope.storeIds === null) return null;
  const candidates = await db.user.findMany({
    where: { status: RecordStatus.ENABLED },
    select: {
      id: true,
      leadH5BrandIds: true,
      leadH5StoreIds: true,
      personnelProfile: { select: { status: true, deletedAt: true, storeId: true, store: { select: { brandId: true } } } },
    },
  });
  const referencedStoreIds = [...new Set(candidates.flatMap(user => jsonIds(user.leadH5StoreIds) || []))];
  const stores = referencedStoreIds.length
    ? await db.store.findMany({ where: { id: { in: referencedStoreIds } }, select: { id: true, brandId: true } })
    : [];
  const storeBrand = new Map(stores.map(store => [store.id, store.brandId]));
  const brandAllowed = (brandId: string) => scope.brandIds === null || scope.brandIds.includes(brandId);
  const storeAllowed = (storeId: string, brandId: string) => (scope.storeIds === null || scope.storeIds.includes(storeId)) && brandAllowed(brandId);
  return new Set(candidates.filter(user => {
    if (user.id === session.userId) return true;
    const profile = user.personnelProfile;
    if (profile?.storeId && profile.store && profile.status === "ACTIVE" && !profile.deletedAt && storeAllowed(profile.storeId, profile.store.brandId)) return true;
    const userStores = jsonIds(user.leadH5StoreIds) || [];
    if (userStores.some(storeId => {
      const brandId = storeBrand.get(storeId);
      return brandId ? storeAllowed(storeId, brandId) : false;
    })) return true;
    const userBrands = jsonIds(user.leadH5BrandIds) || [];
    return scope.storeIds === null && userBrands.some(brandAllowed);
  }).map(user => user.id));
}

export async function notificationUserWhere(session: Session): Promise<Prisma.UserWhereInput> {
  const availableIds = await availableRecipientUserIds(session);
  return {
    status: RecordStatus.ENABLED,
    ...(availableIds ? { id: { in: [...availableIds] } } : {}),
  };
}

export async function createNotification(session: Session, raw: unknown, request: Request) {
  const parsed = createNotificationSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, status: 400, message: parsed.error.issues[0]?.message || "通知参数不正确" };
  const data = parsed.data;
  const now = new Date();
  const effectiveReleaseDateKey = data.publishImmediately ? shanghaiDateKey(now) : data.releaseDate;
  if (!effectiveReleaseDateKey) return { ok: false as const, status: 400, message: "请选择发布日期" };
  if (!data.publishImmediately && effectiveReleaseDateKey <= shanghaiDateKey(now)) return { ok: false as const, status: 400, message: "发布日期必须选择未来日期" };
  const recipientUserIds = [...new Set(data.recipientUserIds)];
  if (!recipientUserIds.length) return { ok: false as const, status: 400, message: "请至少选择1位接收人" };

  const existing = await db.notification.findUnique({ where: { clientRequestId: data.clientRequestId } });
  if (existing) {
    if (existing.createdByUserId !== session.userId) return { ok: false as const, status: 409, message: "请求标识已被使用，请刷新页面后重试" };
    return { ok: true as const, notification: existing, duplicate: true };
  }

  const scopedWhere = await notificationUserWhere(session);
  const recipients = await db.user.findMany({
    where: { AND: [scopedWhere, { id: { in: recipientUserIds } }] },
    select: { id: true, username: true, realName: true, role: { select: { name: true } } },
  });
  if (recipients.length !== recipientUserIds.length) return { ok: false as const, status: 400, message: "部分接收用户已被禁用、删除或超出您的数据权限，请重新选择" };
  const release = resolveNotificationRelease(data.publishImmediately, effectiveReleaseDateKey, now);
  const dateKey = shanghaiDateKey(now);

  try {
    const notification = await db.$transaction(async tx => {
      const sequence = await tx.notificationSequence.upsert({
        where: { dateKey: dateKey.replaceAll("-", "") },
        create: { dateKey: dateKey.replaceAll("-", ""), nextValue: 2 },
        update: { nextValue: { increment: 1 } },
      });
      const currentValue = sequence.nextValue - 1;
      if (currentValue > 9999) throw new Error("当日通知记录编号已达到上限");
      const created = await tx.notification.create({ data: {
        recordNo: `${dateKey.replaceAll("-", "")}${String(currentValue).padStart(4, "0")}`,
        clientRequestId: data.clientRequestId,
        title: data.title.trim(),
        content: data.content.trim(),
        type: data.notificationType,
        publishMode: release.publishMode,
        releaseDate: release.releaseDate,
        releaseAt: release.releaseAt,
        publisherName: data.publisherName.trim(),
        showAfterLogin: data.showAfterLogin,
        status: release.status,
        publishedAt: release.publishedAt,
        createdByUserId: session.userId,
        createdByName: session.realName,
        recipients: { create: recipients.map(recipient => ({
          userId: recipient.id,
          usernameSnapshot: recipient.username,
          realNameSnapshot: recipient.realName,
          roleSnapshot: recipient.role.name,
        })) },
      } });
      const meetingType = meetingTypeForNotification(data.notificationType);
      if (meetingType) {
        await tx.meeting.create({ data: {
          recordNo: created.recordNo,
          type: meetingType,
          meetingMonth: new Date(`${effectiveReleaseDateKey.slice(0, 7)}-01T00:00:00.000Z`),
          notificationId: created.id,
          notificationContentSnapshot: created.content,
          notificationReleaseDate: created.releaseDate,
          publisherNameSnapshot: created.publisherName,
          createdByUserId: session.userId,
          createdByName: session.realName,
          participants: { create: recipients.map(recipient => ({
            userId: recipient.id,
            usernameSnapshot: recipient.username,
            realNameSnapshot: recipient.realName,
            roleSnapshot: recipient.role.name,
          })) },
        } });
      }
      await writeOperationLogWithTransaction(tx, {
        userId: session.userId,
        username: session.username,
        page: "发布通知",
        action: "保存",
        result: "成功",
        detail: `通知记录编号：${created.recordNo}；接收人数：${recipients.length}；发布方式：${data.publishImmediately ? "立即发布" : "定时发布"}；发布日期：${effectiveReleaseDateKey}${meetingType ? "；已同步生成会议记录" : ""}`,
        request,
      });
      return created;
    });
    return { ok: true as const, notification, duplicate: false };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const duplicate = await db.notification.findUnique({ where: { clientRequestId: data.clientRequestId } });
      if (duplicate?.createdByUserId === session.userId) return { ok: true as const, notification: duplicate, duplicate: true };
    }
    throw error;
  }
}

export async function publishDueNotifications(now = new Date()) {
  const due = await db.notification.findMany({
    where: { status: NotificationStatus.PENDING, releaseAt: { lte: now } },
    select: { id: true },
    take: 1000,
    orderBy: { releaseAt: "asc" },
  });
  if (!due.length) return { scanned: 0, published: 0 };
  const result = await db.notification.updateMany({
    where: { id: { in: due.map(item => item.id) }, status: NotificationStatus.PENDING, releaseAt: { lte: now } },
    data: { status: NotificationStatus.PUBLISHED, publishedAt: now },
  });
  if (result.count) await writeOperationLog({ username: "系统", page: "通知定时任务", action: "正式发布", result: "成功", detail: `扫描待发布通知：${due.length}；正式发布：${result.count}` }).catch(() => undefined);
  return { scanned: due.length, published: result.count };
}

export async function currentUserNotifications(userId: string, page = 1, pageSize = 20) {
  const where: Prisma.NotificationWhereInput = {
    releaseAt: { lte: new Date() },
    OR: [
      { status: NotificationStatus.PUBLISHED, recipients: { some: { userId } } },
      { status: NotificationStatus.STOPPED, recipients: { some: { userId, readAt: { not: null } } } },
    ],
  };
  const [total, rows] = await db.$transaction([
    db.notification.count({ where }),
    db.notification.findMany({
      where,
      orderBy: [{ publishedAt: "desc" }, { releaseAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { id: true, recordNo: true, title: true, content: true, publisherName: true, releaseAt: true, publishedAt: true },
    }),
  ]);
  return { rows: rows.map(row => ({ ...row, releaseAtText: formatShanghaiDateTime(row.releaseAt).slice(0, 16) })), total, page, pageSize };
}

export async function pendingLoginNotifications(userId: string) {
  const rows = await db.notification.findMany({
    where: {
      status: NotificationStatus.PUBLISHED,
      showAfterLogin: true,
      releaseAt: { lte: new Date() },
      recipients: { some: { userId, acknowledgedAt: null } },
    },
    orderBy: [{ releaseAt: "asc" }, { recordNo: "asc" }],
    select: { id: true, recordNo: true, title: true, content: true, publisherName: true, releaseAt: true },
  });
  return rows.map(row => ({ ...row, releaseAtText: formatShanghaiDateTime(row.releaseAt).slice(0, 16) }));
}

export async function acknowledgeLoginNotification(userId: string, notificationId: string) {
  const now = new Date();
  const recipient = await db.notificationRecipient.findFirst({
    where: {
      userId,
      notificationId,
      notification: { status: NotificationStatus.PUBLISHED, showAfterLogin: true, releaseAt: { lte: now } },
    },
    select: { id: true },
  });
  if (!recipient) return false;
  await db.$transaction([
    db.notificationRecipient.updateMany({ where: { id: recipient.id, acknowledgedAt: null }, data: { acknowledgedAt: now } }),
    db.notificationRecipient.updateMany({ where: { id: recipient.id, readAt: null }, data: { readAt: now } }),
  ]);
  return true;
}

export async function markNotificationRead(userId: string, notificationId: string) {
  const now = new Date();
  const recipient = await db.notificationRecipient.findFirst({
    where: {
      userId,
      notificationId,
      notification: { status: NotificationStatus.PUBLISHED, releaseAt: { lte: now } },
    },
    select: { id: true, notification: { select: { showAfterLogin: true } } },
  });
  if (recipient) {
    await db.$transaction([
      db.notificationRecipient.updateMany({ where: { id: recipient.id, readAt: null }, data: { readAt: now } }),
      ...(recipient.notification.showAfterLogin
        ? [db.notificationRecipient.updateMany({ where: { id: recipient.id, acknowledgedAt: null }, data: { acknowledgedAt: now } })]
        : []),
    ]);
    return true;
  }
  const existing = await db.notificationRecipient.findFirst({
    where: { userId, notificationId, readAt: { not: null } },
    select: { id: true },
  });
  return Boolean(existing);
}

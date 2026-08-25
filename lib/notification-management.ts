import { NotificationStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import type { Session } from "@/lib/auth";
import { db } from "@/lib/db";
import { availableRecipientUserIds, formatShanghaiDateTime, shanghaiDateKey } from "@/lib/notifications";

export type NotificationManageAction = "query" | "view" | "export" | "stop";

export function canManageNotification(session: Pick<Session, "permissions">, action: NotificationManageAction) {
  return session.permissions.includes("*")
    || session.permissions.includes("notifications:manage")
    || session.permissions.includes(`notifications:manage:${action}`);
}

export const notificationFiltersSchema = z.object({
  title: z.string().trim().max(30).optional().default(""),
  releaseStartDate: z.string().optional().default(""),
  releaseEndDate: z.string().optional().default(""),
  publisherName: z.string().trim().max(30).optional().default(""),
});

export type NotificationFilters = z.infer<typeof notificationFiltersSchema>;

export function validNotificationDate(value?: string) {
  if (!value) return true;
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    && shanghaiDateKey(new Date(`${value}T12:00:00+08:00`)) === value;
}

export function notificationFilterWhere(filters: NotificationFilters): Prisma.NotificationWhereInput {
  return {
    ...(filters.title ? { title: { contains: filters.title } } : {}),
    ...(filters.publisherName ? { publisherName: { contains: filters.publisherName } } : {}),
    ...((filters.releaseStartDate || filters.releaseEndDate) ? { releaseDate: {
      ...(filters.releaseStartDate ? { gte: new Date(`${filters.releaseStartDate}T00:00:00.000Z`) } : {}),
      ...(filters.releaseEndDate ? { lte: new Date(`${filters.releaseEndDate}T00:00:00.000Z`) } : {}),
    } } : {}),
  };
}

export async function notificationManageDataScope(session: Session): Promise<Prisma.NotificationWhereInput> {
  const availableIds = await availableRecipientUserIds(session);
  return availableIds === null ? {} : { recipients: { some: { userId: { in: [...availableIds] } } } };
}

export const notificationListSelect = {
  id: true,
  recordNo: true,
  title: true,
  releaseDate: true,
  publisherName: true,
  createdAt: true,
  status: true,
  _count: { select: { recipients: true } },
} satisfies Prisma.NotificationSelect;

export type NotificationListSource = Prisma.NotificationGetPayload<{ select: typeof notificationListSelect }>;

export function formatNotificationDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function serializeNotificationList(source: NotificationListSource, readCount = 0) {
  return {
    id: source.id,
    recordNo: source.recordNo,
    title: source.title,
    readCount,
    unreadCount: source._count.recipients - readCount,
    releaseDate: formatNotificationDate(source.releaseDate),
    publisherName: source.publisherName,
    createdAt: formatShanghaiDateTime(source.createdAt),
    status: source.status,
  };
}

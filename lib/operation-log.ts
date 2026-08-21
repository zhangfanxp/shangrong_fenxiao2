import { isIP } from "node:net";
import type { Prisma } from "@prisma/client";
import { headers } from "next/headers";
import { db } from "@/lib/db";

export const OPERATION_LOG_CLIENTS = ["运营PC端", "运营移动端", "门店员工移动端"] as const;
export const OPERATION_LOG_RESULTS = ["成功", "取消", "失败"] as const;

export type OperationLogClient = (typeof OPERATION_LOG_CLIENTS)[number];
export type OperationLogResult = (typeof OPERATION_LOG_RESULTS)[number];

type WriteOperationLogInput = {
  userId?: string | null;
  username?: string | null;
  client?: OperationLogClient;
  page: string;
  action: string;
  result: OperationLogResult;
  detail?: string | null;
  request?: Request;
  ip?: string | null;
  createdAt?: Date;
};

const shanghaiFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export function shanghaiDateTime(value = new Date()) {
  const parts = shanghaiFormatter.formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value || "";
  const year = part("year");
  const month = part("month");
  const day = part("day");
  const hour = part("hour");
  const minute = part("minute");
  const second = part("second");
  return {
    dateKey: `${year}${month}${day}`,
    operationDate: `${year}-${month}-${day}`,
    operationTime: `${hour}:${minute}:${second}`,
  };
}

function normalizeIp(value: string | null | undefined) {
  if (!value) return null;
  let candidate = value.split(",")[0]?.trim() || "";
  if (candidate.startsWith("[") && candidate.includes("]")) candidate = candidate.slice(1, candidate.indexOf("]"));
  if (candidate.startsWith("::ffff:")) candidate = candidate.slice(7);
  if (isIP(candidate)) return candidate;
  const ipv4WithPort = candidate.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/)?.[1];
  return ipv4WithPort && isIP(ipv4WithPort) ? ipv4WithPort : null;
}

async function requestIp(request?: Request) {
  const source = request?.headers ?? await headers().catch(() => null);
  if (!source) return null;
  return normalizeIp(source.get("cf-connecting-ip") || source.get("x-real-ip") || source.get("x-forwarded-for"));
}

function safeDetail(value?: string | null) {
  if (!value) return null;
  return value
    .replace(/((?:password|token|secret|session|authorization|access[_-]?key)\s*[:=]\s*)[^；,，\s]+/gi, "$1[已脱敏]")
    .slice(0, 10000);
}

export async function writeOperationLogWithTransaction(tx: Prisma.TransactionClient, input: WriteOperationLogInput) {
  const createdAt = input.createdAt ?? new Date();
  const { dateKey, operationDate, operationTime } = shanghaiDateTime(createdAt);
  const ip = normalizeIp(input.ip) ?? await requestIp(input.request);
  const user = input.userId && !input.username
    ? await tx.user.findUnique({ where: { id: input.userId }, select: { username: true } })
    : null;
  const sequence = await tx.operationLogSequence.upsert({
    where: { dateKey },
    create: { dateKey, nextValue: 2 },
    update: { nextValue: { increment: 1 } },
  });
  const currentValue = sequence.nextValue - 1;
  if (currentValue > 999999) throw new Error("当日操作日志流水号已达到上限");
  return tx.operationLog.create({ data: {
    recordNo: `${dateKey}${String(currentValue).padStart(6, "0")}`,
    userId: input.userId ?? null,
    username: input.username || user?.username || "系统",
    client: input.client ?? "运营PC端",
    page: input.page,
    action: input.action,
    result: input.result,
    detail: safeDetail(input.detail),
    ip,
    operationDate,
    operationTime,
    createdAt,
  } });
}

export async function writeOperationLog(input: WriteOperationLogInput) {
  return db.$transaction(tx => writeOperationLogWithTransaction(tx, input));
}

export async function backfillLegacyOperationLogs() {
  const legacyRows = await db.operationLog.findMany({
    where: { OR: [
      { recordNo: null }, { username: null }, { client: null }, { operationDate: null }, { operationTime: null },
    ] },
    include: { user: { select: { username: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  if (!legacyRows.length) return 0;

  const existing = await db.operationLog.findMany({
    where: { recordNo: { not: null } },
    select: { recordNo: true },
  });
  const maximumByDate = new Map<string, number>();
  for (const row of existing) {
    if (!row.recordNo || !/^\d{14}$/.test(row.recordNo)) continue;
    const key = row.recordNo.slice(0, 8);
    maximumByDate.set(key, Math.max(maximumByDate.get(key) || 0, Number(row.recordNo.slice(8))));
  }

  for (const row of legacyRows) {
    const dateTime = shanghaiDateTime(row.createdAt);
    let recordNo = row.recordNo;
    if (!recordNo) {
      const next = (maximumByDate.get(dateTime.dateKey) || 0) + 1;
      maximumByDate.set(dateTime.dateKey, next);
      recordNo = `${dateTime.dateKey}${String(next).padStart(6, "0")}`;
    }
    await db.operationLog.update({ where: { id: row.id }, data: {
      recordNo,
      username: row.username || row.user?.username || "系统",
      client: row.client || "运营PC端",
      operationDate: row.operationDate || dateTime.operationDate,
      operationTime: row.operationTime || dateTime.operationTime,
    } });
  }

  for (const [dateKey, maximum] of maximumByDate) {
    const current = await db.operationLogSequence.findUnique({ where: { dateKey } });
    if (!current) await db.operationLogSequence.create({ data: { dateKey, nextValue: maximum + 1 } });
    else if (current.nextValue <= maximum) await db.operationLogSequence.update({ where: { dateKey }, data: { nextValue: maximum + 1 } });
  }
  return legacyRows.length;
}

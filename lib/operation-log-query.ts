import { isIP } from "node:net";
import type { Prisma } from "@prisma/client";
import { shanghaiDateTime } from "@/lib/operation-log";

export type OperationLogFilters = {
  startDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  ipAddress?: string;
};

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/;

function validDate(value: string) {
  if (!datePattern.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

export function validateOperationLogFilters(filters: OperationLogFilters) {
  const normalized: OperationLogFilters = {
    startDate: filters.startDate?.trim() || undefined,
    endDate: filters.endDate?.trim() || undefined,
    startTime: filters.startTime?.trim() || undefined,
    endTime: filters.endTime?.trim() || undefined,
    ipAddress: filters.ipAddress?.trim() || undefined,
  };
  if (normalized.startDate && !validDate(normalized.startDate)) return { ok: false as const, message: "操作开始日期格式不正确" };
  if (normalized.endDate && !validDate(normalized.endDate)) return { ok: false as const, message: "操作截止日期格式不正确" };
  if (normalized.startDate && normalized.endDate && normalized.startDate > normalized.endDate) return { ok: false as const, message: "开始日期不能晚于截止日期" };
  if (normalized.startTime && !timePattern.test(normalized.startTime)) return { ok: false as const, message: "操作开始时间格式不正确" };
  if (normalized.endTime && !timePattern.test(normalized.endTime)) return { ok: false as const, message: "操作截止时间格式不正确" };
  if (normalized.startTime && normalized.endTime && normalized.startTime > normalized.endTime) return { ok: false as const, message: "开始时间不能晚于截止时间" };
  if (normalized.ipAddress && !isIP(normalized.ipAddress)) return { ok: false as const, message: "请输入正确的IP地址" };
  return { ok: true as const, filters: normalized };
}

export function operationLogWhere(filters: OperationLogFilters): Prisma.OperationLogWhereInput {
  return {
    ...(filters.startDate || filters.endDate ? { operationDate: {
      ...(filters.startDate ? { gte: filters.startDate } : {}),
      ...(filters.endDate ? { lte: filters.endDate } : {}),
    } } : {}),
    ...(filters.startTime || filters.endTime ? { operationTime: {
      ...(filters.startTime ? { gte: filters.startTime } : {}),
      ...(filters.endTime ? { lte: filters.endTime } : {}),
    } } : {}),
    ...(filters.ipAddress ? { ip: filters.ipAddress } : {}),
  };
}

export function operationLogJson<T extends {
  id: string;
  recordNo: string | null;
  username: string | null;
  client: string | null;
  page: string;
  action: string;
  result: string;
  detail: string | null;
  ip: string | null;
  operationDate: string | null;
  operationTime: string | null;
  createdAt: Date;
  user?: { username: string } | null;
}>(row: T) {
  const dateTime = shanghaiDateTime(row.createdAt);
  return {
    id: row.id,
    recordNo: row.recordNo || row.id,
    username: row.username || row.user?.username || "系统",
    client: row.client || "运营PC端",
    page: row.page,
    action: row.action,
    result: row.result,
    detail: row.detail,
    operationDate: row.operationDate || dateTime.operationDate,
    operationTime: row.operationTime || dateTime.operationTime,
    ip: row.ip || "-",
  };
}

export function operationLogFilterDescription(filters: OperationLogFilters) {
  const parts = [
    filters.startDate || filters.endDate ? `操作日期：${filters.startDate || "不限"}至${filters.endDate || "不限"}` : "",
    filters.startTime || filters.endTime ? `操作时间：${filters.startTime || "不限"}至${filters.endTime || "不限"}` : "",
    filters.ipAddress ? `IP地址：${filters.ipAddress}` : "",
  ].filter(Boolean);
  return parts.length ? parts.join("；") : "加载全部操作日志";
}

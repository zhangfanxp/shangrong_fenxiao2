import { ContractStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";
import { getPlatformConfig } from "@/lib/platform-config";
import { dateKeyAsDbDate, shanghaiDateKey, shanghaiTimeKey } from "@/lib/store-h5-tasks";

export const CONTRACT_EXPIRY_JOB_TYPE = "CONTRACT_EXPIRY";
export const CONTRACT_EXPIRY_SCHEDULED_TIME = "02:00";

export function contractExpiryWindow(dateKey: string, warningDays: number) {
  const start = dateKeyAsDbDate(dateKey);
  const endExclusive = new Date(start);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + warningDays);
  return { start, endExclusive };
}

export async function runScheduledContractExpiryCalculation(now = new Date()) {
  const date = shanghaiDateKey(now);
  const currentTime = shanghaiTimeKey(now);
  if (currentTime < CONTRACT_EXPIRY_SCHEDULED_TIME) {
    return { status: "not-due" as const, date, scheduledTime: CONTRACT_EXPIRY_SCHEDULED_TIME };
  }

  const executionDate = dateKeyAsDbDate(date);
  const uniqueKey = { jobType: CONTRACT_EXPIRY_JOB_TYPE, executionDate };
  let run = await db.scheduledJobRun.findUnique({ where: { jobType_executionDate: uniqueKey } });
  if (run?.status === "SUCCESS") {
    return { status: "already-completed" as const, date, scheduledTime: CONTRACT_EXPIRY_SCHEDULED_TIME, result: run.result };
  }

  const staleBefore = new Date(now.getTime() - 30 * 60 * 1000);
  if (run?.status === "RUNNING" && run.startedAt >= staleBefore) {
    return { status: "already-running" as const, date, scheduledTime: CONTRACT_EXPIRY_SCHEDULED_TIME };
  }

  if (!run) {
    try {
      run = await db.scheduledJobRun.create({ data: { ...uniqueKey, scheduledTime: CONTRACT_EXPIRY_SCHEDULED_TIME, status: "RUNNING", startedAt: now } });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
      return { status: "already-running" as const, date, scheduledTime: CONTRACT_EXPIRY_SCHEDULED_TIME };
    }
  } else {
    const claimed = await db.scheduledJobRun.updateMany({
      where: { id: run.id, status: run.status, startedAt: run.startedAt },
      data: { status: "RUNNING", scheduledTime: CONTRACT_EXPIRY_SCHEDULED_TIME, startedAt: now, completedAt: null, error: null },
    });
    if (!claimed.count) return { status: "already-running" as const, date, scheduledTime: CONTRACT_EXPIRY_SCHEDULED_TIME };
  }

  try {
    const platform = await getPlatformConfig();
    const warningDays = platform.contractExpiringWarningDays;
    const { start, endExclusive } = contractExpiryWindow(date, warningDays);
    const expired = await db.contract.updateMany({
      where: {
        status: { notIn: [ContractStatus.TERMINATED, ContractStatus.EXPIRED] },
        endDate: { lt: start },
      },
      data: { status: ContractStatus.EXPIRED },
    });
    const activated = await db.contract.updateMany({
      where: {
        status: ContractStatus.PENDING,
        trialOpenDate: { lt: start },
        endDate: { gte: start },
      },
      data: { status: ContractStatus.ACTIVE },
    });
    const expiring = await db.contract.updateMany({
      where: {
        status: ContractStatus.ACTIVE,
        endDate: { gte: start, lt: endExclusive },
      },
      data: { status: ContractStatus.EXPIRING },
    });
    const result = { expired: expired.count, activated: activated.count, updated: expiring.count, warningDays, startDate: date, endDateExclusive: endExclusive.toISOString().slice(0, 10) };
    await db.scheduledJobRun.update({
      where: { jobType_executionDate: uniqueKey },
      data: { status: "SUCCESS", completedAt: new Date(), result: result as unknown as Prisma.InputJsonValue, error: null },
    });
    await writeOperationLog({ username: "系统", page: "合同管理", action: "自动更新合同状态", result: "成功", detail: `执行日期：${date}；筹备期转正常：${activated.count}；已过期：${expired.count}；即将到期：${expiring.count}；提前天数：${warningDays}` }).catch(() => undefined);
    return { status: "completed" as const, date, scheduledTime: CONTRACT_EXPIRY_SCHEDULED_TIME, ...result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "合同即将到期状态计算失败";
    await db.scheduledJobRun.update({
      where: { jobType_executionDate: uniqueKey },
      data: { status: "FAILED", completedAt: new Date(), error: message.slice(0, 10000) },
    }).catch(() => undefined);
    await writeOperationLog({ username: "系统", page: "合同管理", action: "自动标记即将到期", result: "失败", detail: `执行日期：${date}；${message}` }).catch(() => undefined);
    throw error;
  }
}

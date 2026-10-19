import { DailyAttendanceType, PersonnelStatus, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getLaborCostPolicyVersions } from "@/lib/labor-cost-policy";
import { synchronizeLaborRecord } from "@/lib/labor-records";
import { writeOperationLog } from "@/lib/operation-log";
import { buildPersonnelLaborCostReport } from "@/lib/personnel-labor-costs";
import { getStoreH5Session } from "@/lib/store-h5-auth";
import {
  addDateDays, attendanceAvailability, attendanceDateLabel, attendanceWindowRuleForBrand,
  dateKeyAsDbDate, formatShanghaiDateTime, isValidDateKey, nextDailyAttendanceRecordNo, shanghaiDateKey,
} from "@/lib/store-h5-daily-attendance";
import { storeEmployeeSelect } from "@/lib/store-employees";
import { synchronizeStoreLeadership } from "@/lib/store-leadership";

const decimalHours = z.number().finite().positive().max(24).refine(value => Math.abs(value * 10 - Math.round(value * 10)) < 1e-8, "小时数最多保留一位小数");
const bodySchema = z.object({
  attendanceDate: z.string().refine(isValidDateKey, "考勤日期格式不正确"),
  items: z.array(z.object({
    personnelId: z.string().min(1),
    attendanceType: z.nativeEnum(DailyAttendanceType),
    leaveHours: decimalHours.nullable().optional(),
    overtime: z.boolean(),
    overtimeHours: decimalHours.nullable().optional(),
  })).max(500),
  partTimeHeadcount: z.number().int().min(0).max(9999).nullable().optional(),
  partTimeHours: z.number().finite().positive().max(9999.9).refine(value => Math.abs(value * 10 - Math.round(value * 10)) < 1e-8, "今日兼职工时最多保留一位小数").nullable().optional(),
  partTimeLaborCost: z.number().finite().min(0, "兼职用工成本不能小于0").max(9999999999.99, "兼职用工成本数值过大").refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 1e-8, "兼职用工成本最多保留两位小数").nullable().optional(),
  revision: z.number().int().positive().optional(),
  modificationReason: z.string().trim().max(300, "修改说明不能超过300个字符").optional(),
});

class AttendanceError extends Error {
  constructor(message: string, readonly status = 400, readonly code?: string) { super(message); }
}

const storeSelect = {
  id: true,
  name: true,
  managerUserId: true,
  managerName: true,
  chefUserId: true,
  chefName: true,
  cooperationType: true,
  workdayHours: true,
  partTimeLaborCost: true,
  brand: { select: { id: true, name: true } },
  personnel: {
    where: { status: PersonnelStatus.ACTIVE, deletedAt: null },
    orderBy: [{ positionLevel: "asc" as const }, { name: "asc" as const }],
    select: { ...storeEmployeeSelect, baseSalary: true, hireDate: true, resignationDate: true, createdAt: true, salaryHistory: { select: { oldSalary: true, newSalary: true, effectiveDate: true, createdAt: true }, orderBy: [{ effectiveDate: "asc" as const }, { createdAt: "asc" as const }] }, positionHistory: { select: { oldOrganization: true, newOrganization: true, effectiveDate: true, createdAt: true }, orderBy: [{ effectiveDate: "asc" as const }, { createdAt: "asc" as const }] } },
  },
} satisfies Prisma.StoreSelect;

type AttendanceStore = Prisma.StoreGetPayload<{ select: typeof storeSelect }>;

function iso(value: Date) {
  return value.toISOString();
}

function attendanceTimeLabel(dayOffset: 0 | 1, time: string) {
  return `${dayOffset === 1 ? "次日" : "当日"} ${time}`;
}

function storedDeadlineLabel(attendanceDate: string, deadlineAt: Date) {
  const dayLabel = shanghaiDateKey(deadlineAt) === attendanceDate ? "当日" : "次日";
  return `${dayLabel} ${formatShanghaiDateTime(deadlineAt).slice(11, 16)}`;
}

type SnapshotDecimal = Prisma.Decimal | number | null;
type SnapshotItem = {
  personnelId: string;
  personnelRecordNo: string;
  personnelNameSnapshot: string;
  positionLevelSnapshot: string;
  attendanceType: DailyAttendanceType;
  leaveHours: SnapshotDecimal;
  overtime: boolean;
  overtimeHours: SnapshotDecimal;
  laborCostSnapshot: SnapshotDecimal;
  hourlyLaborCostSnapshot: SnapshotDecimal;
  laborCostUnitSnapshot: string | null;
  sortOrder: number;
};

function numberOrNull(value: SnapshotDecimal) {
  return value === null ? null : Number(value);
}

function attendanceRevisionSnapshot(input: {
  partTimeHeadcount: number | null;
  partTimeHours: SnapshotDecimal;
  partTimeLaborCost: SnapshotDecimal;
  partTimeActualLaborCost: SnapshotDecimal;
  items: SnapshotItem[];
}): Prisma.InputJsonValue {
  return {
    partTimeHeadcount: input.partTimeHeadcount,
    partTimeHours: numberOrNull(input.partTimeHours),
    partTimeLaborCost: numberOrNull(input.partTimeLaborCost),
    partTimeActualLaborCost: numberOrNull(input.partTimeActualLaborCost),
    items: input.items.map(item => ({
      personnelId: item.personnelId,
      personnelRecordNo: item.personnelRecordNo,
      personnelName: item.personnelNameSnapshot,
      positionLevel: item.positionLevelSnapshot,
      attendanceType: item.attendanceType,
      leaveHours: numberOrNull(item.leaveHours),
      overtime: item.overtime,
      overtimeHours: numberOrNull(item.overtimeHours),
      laborCost: numberOrNull(item.laborCostSnapshot),
      hourlyLaborCost: numberOrNull(item.hourlyLaborCostSnapshot),
      laborCostUnit: item.laborCostUnitSnapshot,
      sortOrder: item.sortOrder,
    })),
  };
}

async function requireAttendanceContext(permission: "store-h5:daily-attendance:view" | "store-h5:daily-attendance:submit") {
  const session = await getStoreH5Session(permission);
  if (!session) throw new AttendanceError("当前账号已无门店H5使用权限，请重新登录或联系管理员", 401);
  if (!session.storeId) throw new AttendanceError("当前账号尚未关联门店，无法填报每日考勤", 400);
  await synchronizeStoreLeadership([session.storeId]);
  const store = await db.store.findUnique({ where: { id: session.storeId }, select: storeSelect });
  if (!store) throw new AttendanceError("当前关联门店不存在，请联系管理员", 404);
  return { session, store };
}

function responseError(error: unknown) {
  if (error instanceof AttendanceError) return NextResponse.json({ message: error.message }, { status: error.status });
  return NextResponse.json({ message: "每日考勤加载失败，请稍后重试" }, { status: 500 });
}

export async function GET() {
  try {
    const { store } = await requireAttendanceContext("store-h5:daily-attendance:view");
    const rule = await attendanceWindowRuleForBrand(store.brand.name);
    const now = new Date();
    const previousDate = addDateDays(shanghaiDateKey(now), -1);
    const previousAvailability = attendanceAvailability(now, previousDate, rule);
    const previousRecord = await db.dailyAttendanceRecord.findUnique({
      where: { storeId_attendanceDate: { storeId: store.id, attendanceDate: dateKeyAsDbDate(previousDate) } },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });
    const previousPersonnelAtSubmission = previousRecord ? store.personnel.filter(personnel => personnel.createdAt <= previousRecord.createdAt) : [];
    const previousItemIds = new Set(previousRecord?.items.map(item => item.personnelId) ?? []);
    const previousCorrectionRequired = previousPersonnelAtSubmission.some(personnel => !previousItemIds.has(personnel.id));
    const previousCanContinue = previousRecord
      ? now <= previousRecord.deadlineAt && (rule.allowPostSubmitEdit || previousCorrectionRequired)
      : previousAvailability.status === "OPEN";
    const dateKey = previousCanContinue ? previousDate : shanghaiDateKey(now);
    const availability = attendanceAvailability(now, dateKey, rule);
    const existing = dateKey === previousDate ? previousRecord : await db.dailyAttendanceRecord.findUnique({
        where: { storeId_attendanceDate: { storeId: store.id, attendanceDate: dateKeyAsDbDate(dateKey) } },
        include: { items: { orderBy: { sortOrder: "asc" } } },
      });
    const existingByPersonnel = new Map(existing?.items.map(item => [item.personnelId, item]) ?? []);
    const personnelAtSubmission = existing ? store.personnel.filter(personnel => personnel.createdAt <= existing.createdAt) : store.personnel;
    const missingPersonnel = existing ? personnelAtSubmission.filter(personnel => !existingByPersonnel.has(personnel.id)) : [];
    const correctionRequired = missingPersonnel.length > 0;
    const currentPersonnelById = new Map(personnelAtSubmission.map(personnel => [personnel.id, personnel]));
    const employeeIds = existing && correctionRequired
      ? [...personnelAtSubmission.map(personnel => personnel.id), ...existing.items.filter(item => !currentPersonnelById.has(item.personnelId)).map(item => item.personnelId)]
      : existing?.items.map(item => item.personnelId) ?? store.personnel.map(personnel => personnel.id);
    const employees = employeeIds.map(personnelId => {
      const personnel = currentPersonnelById.get(personnelId) ?? store.personnel.find(item => item.id === personnelId);
      const item = existingByPersonnel.get(personnelId);
      return {
        id: personnelId,
        recordNo: personnel?.recordNo ?? item!.personnelRecordNo,
        name: personnel?.name ?? item!.personnelNameSnapshot,
        positionLevel: personnel?.positionLevel ?? item!.positionLevelSnapshot,
        attendanceType: item?.attendanceType ?? null,
        leaveHours: item?.leaveHours === null || item?.leaveHours === undefined ? null : Number(item.leaveHours),
        overtime: item?.overtime ?? false,
        overtimeHours: item?.overtimeHours === null || item?.overtimeHours === undefined ? null : Number(item.overtimeHours),
      };
    });
    const effectivePartTimeLaborCost = existing
      ? existing.partTimeLaborCostSnapshot === null && existing.partTimeHours !== null && correctionRequired
        ? store.partTimeLaborCost
        : existing.partTimeLaborCostSnapshot
      : store.partTimeLaborCost;
    const effectiveDeadlineAt = existing?.deadlineAt ?? availability.deadlineAt;
    const canEdit = Boolean(existing && now <= effectiveDeadlineAt && (rule.allowPostSubmitEdit || correctionRequired));
    return NextResponse.json({
      attendanceDate: dateKey,
      attendanceDateLabel: attendanceDateLabel(dateKey),
      storeName: store.name,
      partTimeLaborCost: effectivePartTimeLaborCost === null ? null : Number(effectivePartTimeLaborCost),
      employees,
      availability: {
        status: existing && !correctionRequired ? "SUBMITTED" : availability.status,
        opensAt: iso(availability.opensAt),
        deadlineAt: iso(effectiveDeadlineAt),
        opensLabel: attendanceTimeLabel(rule.startDayOffset, rule.startTime),
        deadlineLabel: existing ? storedDeadlineLabel(dateKey, effectiveDeadlineAt) : attendanceTimeLabel(rule.deadlineDayOffset, rule.deadlineTime),
        configured: rule.configured,
      },
      allowPostSubmitEdit: rule.allowPostSubmitEdit,
      canEdit,
      correctionRequired,
      missingEmployeeCount: missingPersonnel.length,
      submission: existing ? {
        recordNo: existing.recordNo,
        createdByName: existing.createdByNameSnapshot,
        createdAt: formatShanghaiDateTime(existing.createdAt),
        updatedByName: existing.updatedByNameSnapshot,
        updatedAt: existing.revision > 1 ? formatShanghaiDateTime(existing.updatedAt) : null,
        revision: existing.revision,
        partTimeHeadcount: existing.partTimeHeadcount,
        partTimeHours: existing.partTimeHours === null ? null : Number(existing.partTimeHours),
        partTimeLaborCost: existing.partTimeLaborCostSnapshot === null ? null : Number(existing.partTimeLaborCostSnapshot),
        partTimeActualLaborCost: existing.partTimeActualLaborCost === null ? null : Number(existing.partTimeActualLaborCost),
      } : null,
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return responseError(error);
  }
}

export async function POST(request: Request) {
  let context: Awaited<ReturnType<typeof requireAttendanceContext>> | null = null;
  try {
    context = await requireAttendanceContext("store-h5:daily-attendance:submit");
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AttendanceError(parsed.error.issues[0]?.message || "考勤提交内容格式不正确");
    const { session, store } = context;
    const rule = await attendanceWindowRuleForBrand(store.brand.name);
    const now = new Date();
    const availability = attendanceAvailability(now, parsed.data.attendanceDate, rule);
    const existing = await db.dailyAttendanceRecord.findUnique({
      where: { storeId_attendanceDate: { storeId: store.id, attendanceDate: dateKeyAsDbDate(parsed.data.attendanceDate) } },
      include: { items: true, revisions: { select: { id: true }, take: 1 } },
    });
    if (!existing && availability.status === "NOT_OPEN") throw new AttendanceError(`尚未到考勤打卡时间，请在${attendanceTimeLabel(rule.startDayOffset, rule.startTime)}后填写`, 403);
    if ((!existing && availability.status === "CLOSED") || (existing && now > existing.deadlineAt)) throw new AttendanceError("当前考勤已超过系统设置的截止提交时间", 403);
    const existingByPersonnel = new Map(existing?.items.map(item => [item.personnelId, item]) ?? []);
    const employees = existing ? store.personnel.filter(personnel => personnel.createdAt <= existing.createdAt) : store.personnel;
    const correctionRequired = Boolean(existing && employees.some(employee => !existingByPersonnel.has(employee.id)));
    if (existing && !correctionRequired && !rule.allowPostSubmitEdit) throw new AttendanceError("当前门店该日期的考勤已经提交，系统未开启提交后修改", 409);
    const modificationReason = parsed.data.modificationReason?.trim() || "";
    if (existing && !modificationReason) throw new AttendanceError("重新提交考勤前，请填写修改说明");
    if (existing && parsed.data.revision !== existing.revision) {
      throw new AttendanceError("考勤记录已被其他用户修改，系统已为您刷新最新内容，请重新确认后提交", 409, "VERSION_CONFLICT");
    }
    const expectedIds = new Set([
      ...employees.map(employee => employee.id),
      ...(existing?.items.map(item => item.personnelId) ?? []),
    ]);
    const submittedIds = parsed.data.items.map(item => item.personnelId);
    if (new Set(submittedIds).size !== submittedIds.length) throw new AttendanceError("员工考勤记录不能重复");
    if (submittedIds.length !== expectedIds.size || submittedIds.some(personnelId => !expectedIds.has(personnelId))) {
      throw new AttendanceError("门店员工列表已发生变化，请刷新页面后重新填写", 409);
    }
    for (const item of parsed.data.items) {
      const leaveHours = item.leaveHours ?? null;
      if (item.attendanceType === DailyAttendanceType.LEAVE_HOURS && leaveHours === null) throw new AttendanceError("选择请假小时后必须填写请假时长");
      if (item.attendanceType !== DailyAttendanceType.LEAVE_HOURS && leaveHours !== null) throw new AttendanceError("只有选择请假小时时才能填写请假时长");
      const overtimeHours = item.overtimeHours ?? null;
      if (item.overtime && overtimeHours === null) throw new AttendanceError("勾选加班后必须填写加班小时数");
      if (!item.overtime && overtimeHours !== null) throw new AttendanceError("未勾选加班时不能填写加班小时数");
    }
    const partTimeHeadcount = parsed.data.partTimeHeadcount ?? null;
    const partTimeHours = parsed.data.partTimeHours ?? null;
    const partTimeLaborCost = parsed.data.partTimeLaborCost ?? null;
    if ((partTimeHeadcount ?? 0) > 0 && partTimeHours === null) throw new AttendanceError("今日兼职人数非零时，今日兼职工时为必填项");
    if ((partTimeHeadcount === null || partTimeHeadcount === 0) && partTimeHours !== null) throw new AttendanceError("填写今日兼职工时前，请先填写非零的今日兼职人数");
    if (partTimeHours !== null && partTimeLaborCost === null) throw new AttendanceError("填写今日兼职工时后，兼职用工成本为必填项");
    const partTimeActualLaborCost = partTimeHours === null || partTimeLaborCost === null
      ? null
      : new Prisma.Decimal(partTimeHours).times(partTimeLaborCost).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

    const submittedByPersonnel = new Map(parsed.data.items.map(item => [item.personnelId, item]));
    const currentPersonnelById = new Map(store.personnel.map(personnel => [personnel.id, personnel]));
    const attendanceYear = Number(parsed.data.attendanceDate.slice(0, 4));
    const attendanceMonth = Number(parsed.data.attendanceDate.slice(5, 7));
    const [restDays, policyVersions] = await Promise.all([
      db.restDay.findMany({ where: { year: attendanceYear }, select: { startDate: true, endDate: true, holidayType: true } }),
      getLaborCostPolicyVersions(),
    ]);
    const storeWorkdayHours = store.workdayHours === null ? null : Number(store.workdayHours);
    const laborCosts = new Map(store.personnel.map(employee => {
      const monthlyCost = buildPersonnelLaborCostReport({ year: attendanceYear, baseSalary: Number(employee.baseSalary), workdayHours: storeWorkdayHours, organization: employee.organization, hireDate: employee.hireDate, resignationDate: employee.resignationDate, salaryHistory: employee.salaryHistory, positionHistory: employee.positionHistory, restDays, policyVersions })[attendanceMonth - 1];
      return [employee.id, monthlyCost] as const;
    }));
    const attendanceItems = submittedIds.map((personnelId, index) => {
      const employee = currentPersonnelById.get(personnelId);
      const previous = existingByPersonnel.get(personnelId);
      const item = submittedByPersonnel.get(personnelId)!;
      return {
        personnelId,
        personnelRecordNo: employee?.recordNo ?? previous!.personnelRecordNo,
        personnelNameSnapshot: employee?.name ?? previous!.personnelNameSnapshot,
        positionLevelSnapshot: employee?.positionLevel ?? previous!.positionLevelSnapshot,
        attendanceType: item.attendanceType,
        leaveHours: item.leaveHours === null || item.leaveHours === undefined ? null : new Prisma.Decimal(item.leaveHours),
        overtime: item.overtime,
        overtimeHours: item.overtimeHours === null || item.overtimeHours === undefined ? null : new Prisma.Decimal(item.overtimeHours),
        laborCostSnapshot: previous?.laborCostSnapshot ?? (employee ? new Prisma.Decimal(laborCosts.get(personnelId)?.dailyLaborCost ?? Number(employee.laborCost)) : null),
        hourlyLaborCostSnapshot: previous?.hourlyLaborCostSnapshot ?? (employee && laborCosts.get(personnelId)?.hourlyLaborCost !== null && laborCosts.get(personnelId)?.hourlyLaborCost !== undefined ? new Prisma.Decimal(laborCosts.get(personnelId)!.hourlyLaborCost!) : null),
        laborCostUnitSnapshot: previous?.laborCostUnitSnapshot ?? "DAY",
        sortOrder: index,
      };
    });
    const nextSnapshot = attendanceRevisionSnapshot({
      partTimeHeadcount,
      partTimeHours,
      partTimeLaborCost,
      partTimeActualLaborCost,
      items: attendanceItems,
    });
    const previousSnapshot = existing ? attendanceRevisionSnapshot({
      partTimeHeadcount: existing.partTimeHeadcount,
      partTimeHours: existing.partTimeHours,
      partTimeLaborCost: existing.partTimeLaborCostSnapshot,
      partTimeActualLaborCost: existing.partTimeActualLaborCost,
      items: [...existing.items].sort((a, b) => a.sortOrder - b.sortOrder),
    }) : null;
    const saved = await db.$transaction(async tx => {
      if (existing) {
        const updated = await tx.dailyAttendanceRecord.updateMany({
          where: { id: existing.id, revision: existing.revision },
          data: {
            partTimeHeadcount,
            partTimeHours: partTimeHours === null ? null : new Prisma.Decimal(partTimeHours),
            partTimeLaborCostSnapshot: partTimeLaborCost === null ? null : new Prisma.Decimal(partTimeLaborCost),
            partTimeActualLaborCost,
            updatedByUserId: session.userId,
            updatedByUsername: session.username,
            updatedByNameSnapshot: session.realName,
            updatedAt: now,
            revision: { increment: 1 },
          },
        });
        if (updated.count !== 1) throw new AttendanceError("考勤记录已被其他用户修改，系统已为您刷新最新内容，请重新确认后提交", 409, "VERSION_CONFLICT");
        if (!existing.revisions.length && previousSnapshot) {
          await tx.dailyAttendanceRevision.create({ data: {
            attendanceId: existing.id,
            revision: existing.revision,
            action: "SUBMIT",
            snapshot: previousSnapshot,
            changedByUserId: existing.createdByUserId,
            changedByUsername: existing.createdByUsername,
            changedByNameSnapshot: existing.createdByNameSnapshot,
            changedAt: existing.createdAt,
          } });
        }
        await tx.dailyAttendanceItem.deleteMany({ where: { attendanceId: existing.id } });
        await tx.dailyAttendanceItem.createMany({ data: attendanceItems.map(item => ({ ...item, attendanceId: existing.id })) });
        await tx.dailyAttendanceRevision.create({ data: {
          attendanceId: existing.id,
          revision: existing.revision + 1,
          action: correctionRequired ? "CORRECTION" : "EDIT",
          modificationReason,
          snapshot: nextSnapshot,
          changedByUserId: session.userId,
          changedByUsername: session.username,
          changedByNameSnapshot: session.realName,
          changedAt: now,
        } });
        return tx.dailyAttendanceRecord.findUniqueOrThrow({ where: { id: existing.id } });
      }
      const recordNo = await nextDailyAttendanceRecordNo(tx, shanghaiDateKey(now));
      const created = await tx.dailyAttendanceRecord.create({ data: {
        recordNo,
        attendanceDate: dateKeyAsDbDate(parsed.data.attendanceDate),
        storeId: store.id,
        storeNameSnapshot: store.name,
        brandIdSnapshot: store.brand.id,
        brandNameSnapshot: store.brand.name,
        cooperationTypeSnapshot: store.cooperationType,
        deadlineAt: availability.deadlineAt,
        partTimeHeadcount,
        partTimeHours: partTimeHours === null ? null : new Prisma.Decimal(partTimeHours),
        partTimeLaborCostSnapshot: partTimeLaborCost === null ? null : new Prisma.Decimal(partTimeLaborCost),
        partTimeActualLaborCost,
        createdByUserId: session.userId,
        createdByUsername: session.username,
        createdByNameSnapshot: session.realName,
        createdAt: now,
        items: { create: attendanceItems },
      } });
      await tx.dailyAttendanceRevision.create({ data: {
        attendanceId: created.id,
        revision: 1,
        action: "SUBMIT",
        snapshot: nextSnapshot,
        changedByUserId: session.userId,
        changedByUsername: session.username,
        changedByNameSnapshot: session.realName,
        changedAt: now,
      } });
      return created;
    });
    await synchronizeLaborRecord(store.id, parsed.data.attendanceDate).catch(async error => {
      await writeOperationLog({
        userId: session.userId,
        username: session.username,
        client: "门店员工移动端",
        page: "用工记录",
        action: "同步",
        result: "失败",
        detail: `考勤日期：${parsed.data.attendanceDate}；门店：${store.name}；${error instanceof Error ? error.message : "同步失败"}`,
        request,
      }).catch(() => undefined);
    });
    const action = !existing ? "提交" : correctionRequired ? "补正" : "修改";
    await writeOperationLog({
      userId: session.userId, username: session.username, client: "门店员工移动端", page: "每日考勤", action, result: "成功",
      detail: `考勤日期：${parsed.data.attendanceDate}；门店：${store.name}；记录编号：${saved.recordNo}；版本：${saved.revision}；员工：${attendanceItems.length}人${existing ? `；修改说明：${modificationReason}` : ""}`, request,
    }).catch(() => undefined);
    return NextResponse.json({
      message: !existing ? "今日考勤提交成功" : correctionRequired ? "今日考勤补正成功" : "今日考勤修改成功",
      recordNo: saved.recordNo,
      createdByName: saved.createdByNameSnapshot,
      createdAt: formatShanghaiDateTime(saved.createdAt),
      updatedByName: saved.updatedByNameSnapshot,
      updatedAt: saved.revision > 1 ? formatShanghaiDateTime(saved.updatedAt) : null,
      revision: saved.revision,
      partTimeHeadcount: saved.partTimeHeadcount,
      partTimeHours: saved.partTimeHours === null ? null : Number(saved.partTimeHours),
      partTimeLaborCost: saved.partTimeLaborCostSnapshot === null ? null : Number(saved.partTimeLaborCostSnapshot),
      partTimeActualLaborCost: saved.partTimeActualLaborCost === null ? null : Number(saved.partTimeActualLaborCost),
      canEdit: rule.allowPostSubmitEdit && now <= saved.deadlineAt,
      allowPostSubmitEdit: rule.allowPostSubmitEdit,
    });
  } catch (error) {
    const duplicate = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
    const message = duplicate ? "当前门店该日期的考勤已经提交，请勿重复提交" : error instanceof AttendanceError ? error.message : "每日考勤提交失败，请稍后重试";
    const status = duplicate ? 409 : error instanceof AttendanceError ? error.status : 500;
    if (context) await writeOperationLog({
      userId: context.session.userId, username: context.session.username, client: "门店员工移动端", page: "每日考勤", action: "提交", result: "失败", detail: message, request,
    }).catch(() => undefined);
    return NextResponse.json({ message, ...(error instanceof AttendanceError && error.code ? { code: error.code } : {}) }, { status });
  }
}

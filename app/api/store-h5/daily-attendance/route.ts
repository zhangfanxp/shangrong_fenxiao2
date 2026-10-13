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
  activeAttendanceDate, addDateDays, attendanceAvailability, attendanceDateLabel, attendanceWindowRuleForBrand,
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
});

class AttendanceError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
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
    const previousSubmitted = previousAvailability.status !== "OPEN" || Boolean(await db.dailyAttendanceRecord.findUnique({
      where: { storeId_attendanceDate: { storeId: store.id, attendanceDate: dateKeyAsDbDate(previousDate) } },
      select: { id: true },
    }));
    const dateKey = activeAttendanceDate(now, rule, previousSubmitted);
    const availability = attendanceAvailability(now, dateKey, rule);
    const existing = await db.dailyAttendanceRecord.findUnique({
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
    return NextResponse.json({
      attendanceDate: dateKey,
      attendanceDateLabel: attendanceDateLabel(dateKey),
      storeName: store.name,
      partTimeLaborCost: effectivePartTimeLaborCost === null ? null : Number(effectivePartTimeLaborCost),
      employees,
      availability: {
        status: existing && !correctionRequired ? "SUBMITTED" : availability.status,
        opensAt: iso(availability.opensAt),
        deadlineAt: iso(availability.deadlineAt),
        opensLabel: attendanceTimeLabel(rule.startDayOffset, rule.startTime),
        deadlineLabel: attendanceTimeLabel(rule.deadlineDayOffset, rule.deadlineTime),
        configured: rule.configured,
      },
      correctionRequired,
      missingEmployeeCount: missingPersonnel.length,
      submission: existing ? {
        recordNo: existing.recordNo,
        createdByName: existing.createdByNameSnapshot,
        createdAt: formatShanghaiDateTime(existing.createdAt),
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
    if (availability.status === "NOT_OPEN") throw new AttendanceError(`尚未到考勤打卡时间，请在${attendanceTimeLabel(rule.startDayOffset, rule.startTime)}后填写`, 403);
    if (availability.status === "CLOSED") throw new AttendanceError("当前考勤已超过系统设置的截止提交时间", 403);

    const existing = await db.dailyAttendanceRecord.findUnique({
      where: { storeId_attendanceDate: { storeId: store.id, attendanceDate: dateKeyAsDbDate(parsed.data.attendanceDate) } },
      include: { items: true },
    });
    const existingByPersonnel = new Map(existing?.items.map(item => [item.personnelId, item]) ?? []);
    const employees = existing ? store.personnel.filter(personnel => personnel.createdAt <= existing.createdAt) : store.personnel;
    const correctionRequired = Boolean(existing && employees.some(employee => !existingByPersonnel.has(employee.id)));
    if (existing && !correctionRequired) throw new AttendanceError("当前门店该日期的考勤已经提交，请勿重复提交", 409);
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
    const saved = await db.$transaction(async tx => {
      if (existing) {
        await tx.dailyAttendanceItem.deleteMany({ where: { attendanceId: existing.id } });
        return tx.dailyAttendanceRecord.update({
          where: { id: existing.id },
          data: {
            partTimeHeadcount,
            partTimeHours: partTimeHours === null ? null : new Prisma.Decimal(partTimeHours),
            partTimeLaborCostSnapshot: partTimeLaborCost === null ? null : new Prisma.Decimal(partTimeLaborCost),
            partTimeActualLaborCost,
            items: { create: attendanceItems },
          },
        });
      }
      const recordNo = await nextDailyAttendanceRecordNo(tx, shanghaiDateKey(now));
      return tx.dailyAttendanceRecord.create({ data: {
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
    await writeOperationLog({
      userId: session.userId, username: session.username, client: "门店员工移动端", page: "每日考勤", action: existing ? "补正" : "提交", result: "成功",
      detail: `考勤日期：${parsed.data.attendanceDate}；门店：${store.name}；记录编号：${saved.recordNo}；员工：${attendanceItems.length}人`, request,
    }).catch(() => undefined);
    return NextResponse.json({
      message: existing ? "今日考勤补正成功" : "今日考勤提交成功",
      recordNo: saved.recordNo,
      createdByName: saved.createdByNameSnapshot,
      createdAt: formatShanghaiDateTime(saved.createdAt),
      partTimeHeadcount: saved.partTimeHeadcount,
      partTimeHours: saved.partTimeHours === null ? null : Number(saved.partTimeHours),
      partTimeLaborCost: saved.partTimeLaborCostSnapshot === null ? null : Number(saved.partTimeLaborCostSnapshot),
      partTimeActualLaborCost: saved.partTimeActualLaborCost === null ? null : Number(saved.partTimeActualLaborCost),
    });
  } catch (error) {
    const duplicate = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
    const message = duplicate ? "当前门店该日期的考勤已经提交，请勿重复提交" : error instanceof AttendanceError ? error.message : "每日考勤提交失败，请稍后重试";
    const status = duplicate ? 409 : error instanceof AttendanceError ? error.status : 500;
    if (context) await writeOperationLog({
      userId: context.session.userId, username: context.session.username, client: "门店员工移动端", page: "每日考勤", action: "提交", result: "失败", detail: message, request,
    }).catch(() => undefined);
    return NextResponse.json({ message }, { status });
  }
}

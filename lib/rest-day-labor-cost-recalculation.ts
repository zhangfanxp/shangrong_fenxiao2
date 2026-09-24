import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getLaborCostPolicyVersions, getNextMonthLaborCostPolicy } from "@/lib/labor-cost-policy";
import { buildPersonnelLaborCostReport, shanghaiYearMonth } from "@/lib/personnel-labor-costs";
import { dateTextAsDbDate } from "@/lib/rest-days";

type RecalculationActor = {
  userId: string;
  username: string;
};

export type LaborCostRecalculationResult = {
  month: string;
  monthLabel: string;
  totalCount: number;
  completedCount: number;
  failedCount: number;
};

type LaborCostRecalculationInternalResult = LaborCostRecalculationResult & {
  failedRecords: { recordNo: string; reason: string }[];
};

function monthText(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function monthDateRange(year: number, month: number) {
  const startText = `${monthText(year, month)}-01`;
  const endText = `${monthText(year, month)}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, "0")}`;
  return {
    personnelStart: new Date(`${startText}T00:00:00.000`),
    personnelEnd: new Date(`${endText}T23:59:59.999`),
    attendanceStart: dateTextAsDbDate(startText),
    attendanceEnd: dateTextAsDbDate(endText),
  };
}

function errorMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : "计算失败";
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
) {
  let cursor = 0;
  const failures: { index: number; reason: unknown }[] = [];
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      try {
        await worker(items[index]);
      } catch (reason) {
        failures.push({ index, reason });
      }
    }
  });
  await Promise.all(runners);
  return failures;
}

/**
 * Recalculates only the current natural month. Existing attendance snapshots from
 * earlier months are deliberately excluded so historical labor costs stay fixed.
 */
export async function recalculateCurrentMonthLaborCosts(
  actor: RecalculationActor,
  now = new Date(),
): Promise<LaborCostRecalculationInternalResult> {
  const current = shanghaiYearMonth(now);
  const currentMonth = monthText(current.year, current.month);
  const range = monthDateRange(current.year, current.month);
  const configured = await getNextMonthLaborCostPolicy(now);

  // System Parameters stores the currently edited policy as the next effective
  // version. An explicit immediate calculation promotes those current settings to
  // this month so later personnel/attendance reads use the exact same policy.
  await db.laborCostPolicyVersion.upsert({
    where: { effectiveMonth: currentMonth },
    create: {
      effectiveMonth: currentMonth,
      ...configured.policy,
      createdByUserId: actor.userId,
      createdByUsername: actor.username,
      updatedByUserId: actor.userId,
      updatedByUsername: actor.username,
    },
    update: {
      ...configured.policy,
      updatedByUserId: actor.userId,
      updatedByUsername: actor.username,
    },
  });

  const [personnel, restDays, policyVersions] = await Promise.all([
    db.personnel.findMany({
      where: {
        deletedAt: null,
        hireDate: { lte: range.personnelEnd },
        OR: [{ resignationDate: null }, { resignationDate: { gte: range.personnelStart } }],
      },
      select: {
        id: true,
        recordNo: true,
        version: true,
        baseSalary: true,
        organization: true,
        hireDate: true,
        resignationDate: true,
        store: { select: { workdayHours: true } },
        salaryHistory: {
          select: { oldSalary: true, newSalary: true, effectiveDate: true, createdAt: true },
          orderBy: [{ effectiveDate: "asc" }, { createdAt: "asc" }],
        },
        positionHistory: {
          select: { oldOrganization: true, newOrganization: true, effectiveDate: true, createdAt: true },
          orderBy: [{ effectiveDate: "asc" }, { createdAt: "asc" }],
        },
      },
      orderBy: { recordNo: "asc" },
    }),
    db.restDay.findMany({
      where: { year: current.year },
      select: { startDate: true, endDate: true, holidayType: true },
    }),
    getLaborCostPolicyVersions(),
  ]);

  const failures = await runWithConcurrency(personnel, 8, async person => {
    const workdayHours = person.store?.workdayHours === null || person.store?.workdayHours === undefined
      ? null
      : Number(person.store.workdayHours);
    const cost = buildPersonnelLaborCostReport({
      year: current.year,
      baseSalary: Number(person.baseSalary),
      workdayHours,
      organization: person.organization,
      hireDate: person.hireDate,
      resignationDate: person.resignationDate,
      salaryHistory: person.salaryHistory,
      positionHistory: person.positionHistory,
      restDays,
      policyVersions,
    })[current.month - 1];

    if (!cost || cost.dailyLaborCost === null || !Number.isFinite(cost.dailyLaborCost)) {
      throw new Error("本月有效计薪天数不足，无法计算人力成本");
    }
    const dailyLaborCost = cost.dailyLaborCost;
    const hourlyLaborCost = cost.hourlyLaborCost;

    await db.$transaction(async tx => {
      const updated = await tx.personnel.updateMany({
        where: { id: person.id, version: person.version, deletedAt: null },
        data: {
          laborCost: new Prisma.Decimal(dailyLaborCost),
          workdayHours: workdayHours === null ? null : new Prisma.Decimal(workdayHours),
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new Error("人员档案已被其他用户修改");

      await tx.dailyAttendanceItem.updateMany({
        where: {
          personnelId: person.id,
          attendance: { attendanceDate: { gte: range.attendanceStart, lte: range.attendanceEnd } },
        },
        data: {
          laborCostSnapshot: new Prisma.Decimal(dailyLaborCost),
          hourlyLaborCostSnapshot: hourlyLaborCost === null ? null : new Prisma.Decimal(hourlyLaborCost),
          laborCostUnitSnapshot: "DAY",
        },
      });
    });
  });

  const failedRecords = failures.map(failure => ({
    recordNo: personnel[failure.index]?.recordNo || "未知人员",
    reason: errorMessage(failure.reason),
  }));
  return {
    month: currentMonth,
    monthLabel: `${current.year}年${current.month}月`,
    totalCount: personnel.length,
    completedCount: personnel.length - failedRecords.length,
    failedCount: failedRecords.length,
    failedRecords,
  };
}

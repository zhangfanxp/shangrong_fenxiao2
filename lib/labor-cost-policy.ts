import { db } from "@/lib/db";
import {
  DEFAULT_LABOR_COST_POLICY,
  LEGAL_HOLIDAY_RULES,
  MONTHLY_REST_RULES,
  nextMonthText,
  type LaborCostPolicy,
  type LaborCostPolicyVersion,
  type LegalHolidayRule,
  type MonthlyRestRule,
} from "@/lib/personnel-labor-costs";

export const laborCostPolicyVersionSelect = {
  effectiveMonth: true,
  headquartersMonthlyRestRule: true,
  headquartersFixedRestDays: true,
  headquartersLegalHolidayRule: true,
  storeMonthlyRestRule: true,
  storeFixedRestDays: true,
  storeLegalHolidayRule: true,
} as const;

function monthlyRestRule(value: string, fallback: MonthlyRestRule) {
  return (MONTHLY_REST_RULES as readonly string[]).includes(value) ? value as MonthlyRestRule : fallback;
}

function legalHolidayRule(value: string, fallback: LegalHolidayRule) {
  return (LEGAL_HOLIDAY_RULES as readonly string[]).includes(value) ? value as LegalHolidayRule : fallback;
}

function normalizePolicy(row: {
  headquartersMonthlyRestRule: string;
  headquartersFixedRestDays: number;
  headquartersLegalHolidayRule: string;
  storeMonthlyRestRule: string;
  storeFixedRestDays: number;
  storeLegalHolidayRule: string;
}): LaborCostPolicy {
  return {
    headquartersMonthlyRestRule: monthlyRestRule(row.headquartersMonthlyRestRule, DEFAULT_LABOR_COST_POLICY.headquartersMonthlyRestRule),
    headquartersFixedRestDays: row.headquartersFixedRestDays,
    headquartersLegalHolidayRule: legalHolidayRule(row.headquartersLegalHolidayRule, DEFAULT_LABOR_COST_POLICY.headquartersLegalHolidayRule),
    storeMonthlyRestRule: monthlyRestRule(row.storeMonthlyRestRule, DEFAULT_LABOR_COST_POLICY.storeMonthlyRestRule),
    storeFixedRestDays: row.storeFixedRestDays,
    storeLegalHolidayRule: legalHolidayRule(row.storeLegalHolidayRule, DEFAULT_LABOR_COST_POLICY.storeLegalHolidayRule),
  };
}

type LaborCostPolicyDatabase = Pick<typeof db, "laborCostPolicyVersion">;

export async function getLaborCostPolicyVersions(database: LaborCostPolicyDatabase = db): Promise<LaborCostPolicyVersion[]> {
  const rows = await database.laborCostPolicyVersion.findMany({
    select: laborCostPolicyVersionSelect,
    orderBy: { effectiveMonth: "asc" },
  });
  return rows.map(row => ({ effectiveMonth: row.effectiveMonth, ...normalizePolicy(row) }));
}

export async function getNextMonthLaborCostPolicy(now = new Date()) {
  const effectiveMonth = nextMonthText(now);
  const row = await db.laborCostPolicyVersion.findFirst({
    where: { effectiveMonth: { lte: effectiveMonth } },
    select: laborCostPolicyVersionSelect,
    orderBy: { effectiveMonth: "desc" },
  });
  return {
    effectiveMonth,
    sourceEffectiveMonth: row?.effectiveMonth ?? null,
    policy: row ? normalizePolicy(row) : DEFAULT_LABOR_COST_POLICY,
  };
}

export async function saveNextMonthLaborCostPolicy(policy: LaborCostPolicy, actor: { userId: string; username: string }, now = new Date()) {
  const effectiveMonth = nextMonthText(now);
  const row = await db.laborCostPolicyVersion.upsert({
    where: { effectiveMonth },
    create: {
      effectiveMonth,
      ...policy,
      createdByUserId: actor.userId,
      createdByUsername: actor.username,
      updatedByUserId: actor.userId,
      updatedByUsername: actor.username,
    },
    update: {
      ...policy,
      updatedByUserId: actor.userId,
      updatedByUsername: actor.username,
    },
    select: laborCostPolicyVersionSelect,
  });
  return { effectiveMonth: row.effectiveMonth, ...normalizePolicy(row) };
}

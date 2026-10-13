import { Prisma, StoreLaborAssessmentMetric } from "@prisma/client";
import { z } from "zod";
import type { Session } from "@/lib/auth";
import { shanghaiDateTime } from "@/lib/operation-log";

export const STORE_LABOR_STANDARD_PAGE_SIZES = [20, 50, 100] as const;
export const STORE_LABOR_METRIC_LABELS: Record<StoreLaborAssessmentMetric, string> = {
  RECEIVED_AMOUNT: "实收金额",
  ACTUAL_SALES_AMOUNT: "实际销售额",
};

const metricValues = Object.values(StoreLaborAssessmentMetric) as [StoreLaborAssessmentMetric, ...StoreLaborAssessmentMetric[]];
const MAX_MONEY = new Prisma.Decimal("9999999999999999.99");

export type StoreLaborStandardPermission = "query" | "create" | "view" | "edit" | "export" | "delete";

export function canUseStoreLaborStandards(session: Pick<Session, "permissions">, action: StoreLaborStandardPermission) {
  return session.permissions.includes("*")
    || session.permissions.includes("settings:store-labor-standards")
    || session.permissions.includes(`store-labor-standards:${action}`);
}

function moneySchema(fieldName: string) {
  return z.union([z.string(), z.number()]).nullable().optional().transform((value, context) => {
    if (value === null || value === undefined || value === "") return null;
    const text = typeof value === "number" ? String(value) : value.trim();
    if (!/^\d{1,16}(?:\.\d{1,2})?$/.test(text)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: `${fieldName}请输入最多两位小数的非负金额` });
      return z.NEVER;
    }
    const amount = new Prisma.Decimal(text);
    if (amount.gt(MAX_MONEY)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: `${fieldName}金额过大` });
      return z.NEVER;
    }
    return amount.toFixed(2);
  });
}

const baseInputSchema = z.object({
  brandValue: z.string({ required_error: "请选择品牌" }).trim().min(1, "请选择品牌").max(100, "品牌名称不能超过100个字符"),
  assessmentMetric: z.enum(metricValues, { required_error: "请选择考核指标", invalid_type_error: "请选择有效的考核指标" }),
  lowerAmount: moneySchema("下限"),
  upperAmount: moneySchema("上限"),
  standardHeadcount: z.number({ required_error: "请输入标准用工人数", invalid_type_error: "标准用工人数必须为正整数" })
    .int("标准用工人数必须为正整数").positive("标准用工人数必须为不包含零的正整数").max(65535, "标准用工人数不能超过65535人"),
  remark: z.string().max(100, "备注不能超过100个字符").default(""),
});

function validateBounds(data: z.infer<typeof baseInputSchema>, context: z.RefinementCtx) {
  if (data.lowerAmount === null && data.upperAmount === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["lowerAmount"], message: "下限与上限不允许同时为空" });
    return;
  }
  if (typeof data.lowerAmount === "string" && typeof data.upperAmount === "string" && new Prisma.Decimal(data.lowerAmount).gte(data.upperAmount)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["upperAmount"], message: "上限必须大于下限" });
  }
}

export const storeLaborStandardInputSchema = baseInputSchema.superRefine(validateBounds);
export const storeLaborStandardUpdateSchema = baseInputSchema.extend({
  version: z.number({ required_error: "缺少数据版本，请刷新后重试" }).int().positive(),
}).superRefine(validateBounds);
export type StoreLaborStandardInput = z.infer<typeof storeLaborStandardInputSchema>;

export const storeLaborStandardFiltersSchema = z.object({
  brandValue: z.string().trim().max(100, "品牌名称不能超过100个字符").default(""),
});
export type StoreLaborStandardFilters = z.infer<typeof storeLaborStandardFiltersSchema>;

export function storeLaborStandardFilterWhere(filters: StoreLaborStandardFilters): Prisma.StoreLaborStandardWhereInput {
  return filters.brandValue ? { brandValue: filters.brandValue } : {};
}

export const storeLaborStandardSelect = {
  id: true,
  recordNo: true,
  brandValue: true,
  assessmentMetric: true,
  lowerAmount: true,
  upperAmount: true,
  standardHeadcount: true,
  remark: true,
  version: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.StoreLaborStandardSelect;

export type StoreLaborStandardSource = Prisma.StoreLaborStandardGetPayload<{ select: typeof storeLaborStandardSelect }>;

export const storeLaborPolicyRulesSchema = z.array(z.object({
  standardId: z.string().min(1),
  recordNo: z.string().min(1),
  lowerAmount: z.string().nullable(),
  upperAmount: z.string().nullable(),
  standardHeadcount: z.number().int().nonnegative(),
  standardVersion: z.number().int().positive(),
}));

export type StoreLaborPolicyRule = z.infer<typeof storeLaborPolicyRulesSchema>[number];
export type StoreLaborPolicyActor = { userId?: string | null; username: string; realName: string };

export function serializeStoreLaborStandard(row: StoreLaborStandardSource) {
  return {
    id: row.id,
    recordNo: row.recordNo,
    brandValue: row.brandValue,
    assessmentMetric: row.assessmentMetric,
    assessmentMetricLabel: STORE_LABOR_METRIC_LABELS[row.assessmentMetric],
    lowerAmount: row.lowerAmount?.toFixed(2) ?? null,
    upperAmount: row.upperAmount?.toFixed(2) ?? null,
    standardHeadcount: row.standardHeadcount,
    remark: row.remark || "",
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function storeLaborStandardFilterLogDetail(filters: StoreLaborStandardFilters) {
  return filters.brandValue ? `品牌：${filters.brandValue}` : "全部品牌";
}

export async function lockStoreLaborStandardBrands(tx: Prisma.TransactionClient, brands: string[]) {
  const targets = [...new Set(brands)].sort((left, right) => left.localeCompare(right, "zh-CN"));
  for (const brandValue of targets) {
    await tx.storeLaborStandardBrandLock.upsert({ where: { brandValue }, create: { brandValue }, update: {} });
  }
  if (targets.length) {
    await tx.$queryRaw(Prisma.sql`SELECT \`brandValue\` FROM \`StoreLaborStandardBrandLock\` WHERE \`brandValue\` IN (${Prisma.join(targets)}) ORDER BY \`brandValue\` FOR UPDATE`);
  }
}

export async function createStoreLaborStandardPolicyVersion(
  tx: Prisma.TransactionClient,
  brandValue: string,
  actor: StoreLaborPolicyActor,
) {
  const standards = await tx.storeLaborStandard.findMany({
    where: { brandValue },
    select: {
      id: true,
      recordNo: true,
      assessmentMetric: true,
      lowerAmount: true,
      upperAmount: true,
      standardHeadcount: true,
      version: true,
    },
    orderBy: [{ lowerAmount: "asc" }, { upperAmount: "asc" }, { recordNo: "asc" }],
  });
  const metrics = [...new Set(standards.map(item => item.assessmentMetric))];
  if (metrics.length > 1) throw new StoreLaborStandardBusinessError(`品牌“${brandValue}”存在多个考核指标，无法生成用工标准版本`, 409);
  const latest = await tx.storeLaborStandardPolicyVersion.aggregate({
    where: { brandValue },
    _max: { version: true },
  });
  const rules: StoreLaborPolicyRule[] = standards.map(item => ({
    standardId: item.id,
    recordNo: item.recordNo,
    lowerAmount: item.lowerAmount?.toFixed(2) ?? null,
    upperAmount: item.upperAmount?.toFixed(2) ?? null,
    standardHeadcount: item.standardHeadcount,
    standardVersion: item.version,
  }));
  return tx.storeLaborStandardPolicyVersion.create({
    data: {
      brandValue,
      version: (latest._max.version ?? 0) + 1,
      assessmentMetric: metrics[0] ?? null,
      rules,
      createdByUserId: actor.userId || null,
      createdByUsername: actor.username,
      createdByNameSnapshot: actor.realName,
    },
  });
}

export async function ensureStoreLaborStandardPolicyVersion(
  tx: Prisma.TransactionClient,
  brandValue: string,
  actor: StoreLaborPolicyActor = { username: "SYSTEM", realName: "系统" },
) {
  await lockStoreLaborStandardBrands(tx, [brandValue]);
  const existing = await tx.storeLaborStandardPolicyVersion.findFirst({
    where: { brandValue },
    orderBy: [{ version: "desc" }, { createdAt: "desc" }],
  });
  return existing ?? createStoreLaborStandardPolicyVersion(tx, brandValue, actor);
}

export async function nextStoreLaborStandardRecordNo(tx: Prisma.TransactionClient, now = new Date()) {
  const { dateKey } = shanghaiDateTime(now);
  const sequence = await tx.storeLaborStandardSequence.upsert({
    where: { dateKey },
    create: { dateKey, nextValue: 2 },
    update: { nextValue: { increment: 1 } },
  });
  const currentValue = sequence.nextValue - 1;
  if (currentValue > 9999) throw new StoreLaborStandardBusinessError("当日门店用工标准记录流水号已达到上限", 409);
  return `${dateKey}${String(currentValue).padStart(4, "0")}`;
}

export async function validateStoreLaborStandardRules(tx: Prisma.TransactionClient, input: StoreLaborStandardInput, excludeId?: string) {
  const commonWhere: Prisma.StoreLaborStandardWhereInput = {
    brandValue: input.brandValue,
    ...(excludeId ? { id: { not: excludeId } } : {}),
  };
  const existingMetric = await tx.storeLaborStandard.findFirst({
    where: commonWhere,
    select: { assessmentMetric: true },
  });
  if (existingMetric && existingMetric.assessmentMetric !== input.assessmentMetric) {
    throw new StoreLaborStandardBusinessError(
      `品牌“${input.brandValue}”已有记录采用“${STORE_LABOR_METRIC_LABELS[existingMetric.assessmentMetric]}”考核，同一品牌不能采用不同考核指标`,
      409,
    );
  }

  const overlapConditions: Prisma.StoreLaborStandardWhereInput[] = [];
  if (input.upperAmount !== null) {
    overlapConditions.push({ OR: [{ lowerAmount: null }, { lowerAmount: { lt: new Prisma.Decimal(input.upperAmount) } }] });
  }
  if (input.lowerAmount !== null) {
    overlapConditions.push({ OR: [{ upperAmount: null }, { upperAmount: { gt: new Prisma.Decimal(input.lowerAmount) } }] });
  }
  const overlap = await tx.storeLaborStandard.findFirst({
    where: { ...commonWhere, ...(overlapConditions.length ? { AND: overlapConditions } : {}) },
    select: { recordNo: true, lowerAmount: true, upperAmount: true },
  });
  if (overlap) {
    const range = `${overlap.lowerAmount?.toFixed(2) ?? "空"} 至 ${overlap.upperAmount?.toFixed(2) ?? "空"}`;
    throw new StoreLaborStandardBusinessError(`当前金额区间与记录${overlap.recordNo}（${range}）存在交叉或重叠，请调整后再保存`, 409);
  }
}

export class StoreLaborStandardBusinessError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "StoreLaborStandardBusinessError";
  }
}

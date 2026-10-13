import {
  BusinessDataFieldRole, BusinessDataFieldType, BusinessDataSourceType, Prisma, RecordStatus,
} from "@prisma/client";
import { z } from "zod";
import type { Session } from "@/lib/auth";
import { readAssessmentConfig } from "@/lib/assessment-config";
import {
  BusinessFormulaError, businessJudgmentOperatorLabels, evaluateBusinessFormula, evaluateBusinessJudgment,
  parseBusinessFormula, validateBusinessJudgmentConditions, type BusinessFormulaRpnToken, type BusinessJudgmentCondition, type BusinessJudgmentOperator,
} from "@/lib/business-data-formulas";
import { db } from "@/lib/db";
import { readResearchConfig } from "@/lib/research-template-config";

export type BusinessDataSourceAction = "query" | "create" | "view" | "edit" | "delete" | "export";

export function canBusinessDataSource(session: Session, action: BusinessDataSourceAction) {
  return session.permissions.includes("*") || session.permissions.includes(`business-data-sources:${action}`);
}

export const sourceTypeLabels: Record<BusinessDataSourceType, string> = {
  TASK_TEMPLATE: "任务模版",
  ASSESSMENT_TEMPLATE: "考核表格",
  RESEARCH_TEMPLATE: "调研模版",
};

export const businessDataSystemSources = ["STORE_COST", "DAILY_LABOR_COST"] as const;
export type BusinessDataSystemSource = typeof businessDataSystemSources[number];

export const businessDataSystemSourceLabels: Record<BusinessDataSystemSource, string> = {
  STORE_COST: "门店成本",
  DAILY_LABOR_COST: "每日人力成本",
};

export function readBusinessDataSystemSources(value: unknown): BusinessDataSystemSource[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<string>(businessDataSystemSources);
  return [...new Set(value.filter((item): item is BusinessDataSystemSource => typeof item === "string" && allowed.has(item)))];
}

export function businessDataSystemSourceSummary(value: unknown) {
  const sources = readBusinessDataSystemSources(value);
  return sources.length ? sources.map(source => businessDataSystemSourceLabels[source]).join("、") : "无";
}

export const fieldTypeLabels: Record<BusinessDataFieldType, string> = {
  INTEGER: "整数",
  DECIMAL: "数值",
  MONEY: "金额",
  PERCENTAGE: "百分比",
  TEXT: "文本",
  DATE: "日期",
  DATETIME: "日期时间",
};

const text = (max: number) => z.string().trim().max(max);
export const businessDataSourceFieldInputSchema = z.object({
  id: z.string().min(1).optional(),
  fieldSource: z.enum(["SOURCE", "FORMULA", "JUDGMENT"]).optional().default("SOURCE"),
  sourceFieldKey: z.string().trim().min(1, "请选择业务字段").max(191),
  fieldNameSnapshot: text(200).optional(),
  formulaName: text(50).optional(),
  formulaExpression: text(500).optional(),
  judgmentName: text(50).optional(),
  judgmentConditions: z.array(z.object({
    leftExpression: text(500).optional(),
    operator: z.enum(["GT", "GTE", "EQ", "LT", "LTE"]),
    rightExpression: text(500).optional(),
    leftFieldKey: z.string().trim().min(1).max(191).optional(),
    rightFieldKey: z.string().trim().min(1).max(191).optional(),
    result: text(50),
  })).max(20).optional(),
  fieldType: z.nativeEnum(BusinessDataFieldType, { message: "请选择字段类型" }),
  unit: text(10).optional().default(""),
  remark: text(200).optional().default(""),
}).superRefine((value, context) => {
  if (value.fieldSource === "FORMULA") {
    if (!value.formulaName) context.addIssue({ code: "custom", path: ["formulaName"], message: "请输入自定义业务字段名称" });
    if (!value.formulaExpression) context.addIssue({ code: "custom", path: ["formulaExpression"], message: "请输入计算公式" });
  }
  if (value.fieldSource === "JUDGMENT") {
    if (!value.judgmentName) context.addIssue({ code: "custom", path: ["judgmentName"], message: "请输入自定义判断字段名称" });
    if (!value.judgmentConditions?.length) context.addIssue({ code: "custom", path: ["judgmentConditions"], message: "请至少新增一个判断条件" });
    value.judgmentConditions?.forEach((condition, index) => {
      if (!condition.leftExpression && !condition.leftFieldKey) context.addIssue({ code: "custom", path: ["judgmentConditions", index, "leftExpression"], message: "请输入左侧表达式" });
      if (!condition.rightExpression && !condition.rightFieldKey) context.addIssue({ code: "custom", path: ["judgmentConditions", index, "rightExpression"], message: "请输入右侧表达式" });
    });
  }
});

export const businessDataSourceInputSchema = z.object({
  businessName: z.string().trim().min(1, "请输入业务名称").refine(value => Array.from(value).length <= 20, "业务名称不能超过20个字符"),
  sourceType: z.nativeEnum(BusinessDataSourceType, { message: "请选择来源类型" }),
  templateId: z.string().trim().min(1, "请选择模版记录"),
  systemSources: z.array(z.enum(businessDataSystemSources)).max(2, "组合系统来源数量超出限制").refine(values => new Set(values).size === values.length, "组合系统来源不能重复").optional().default([]),
  remark: text(200).optional().default(""),
  fields: z.array(businessDataSourceFieldInputSchema).min(1, "请至少新增一个数据字典字段").max(500, "单个业务数据源最多配置500个字段"),
});

export type BusinessDataSourceInput = z.infer<typeof businessDataSourceInputSchema>;

export type StoredBusinessFormulaConfig = {
  expression: string;
  displayExpression: string;
  referenceKeys: string[];
  rpn: BusinessFormulaRpnToken[];
  divisionByZero: "NULL";
};

export type StoredBusinessJudgmentConfig = {
  conditions: BusinessJudgmentCondition[];
  referenceKeys: string[];
};

export function readStoredBusinessFormulaConfig(value: unknown): StoredBusinessFormulaConfig | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const formula = (value as Record<string, unknown>).formula;
  if (!formula || typeof formula !== "object" || Array.isArray(formula)) return null;
  const data = formula as Record<string, unknown>;
  if (typeof data.expression !== "string" || typeof data.displayExpression !== "string" || !Array.isArray(data.referenceKeys) || !Array.isArray(data.rpn)) return null;
  if (!data.referenceKeys.every(key => typeof key === "string")) return null;
  return {
    expression: data.expression,
    displayExpression: data.displayExpression,
    referenceKeys: data.referenceKeys as string[],
    rpn: data.rpn as BusinessFormulaRpnToken[],
    divisionByZero: "NULL",
  };
}

export function calculateStoredBusinessFormula(sourceFieldConfig: unknown, values: Record<string, number | null | undefined>) {
  const formula = readStoredBusinessFormulaConfig(sourceFieldConfig);
  return formula ? evaluateBusinessFormula(formula.rpn, values) : null;
}

export function readStoredBusinessJudgmentConfig(value: unknown): StoredBusinessJudgmentConfig | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const judgment = (value as Record<string, unknown>).judgment;
  if (!judgment || typeof judgment !== "object" || Array.isArray(judgment)) return null;
  const data = judgment as Record<string, unknown>;
  if (!Array.isArray(data.conditions)) return null;
  const conditions = data.conditions.flatMap(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const condition = item as Record<string, unknown>;
    if (typeof condition.result !== "string" || !Object.hasOwn(businessJudgmentOperatorLabels, condition.operator as string)) return [];
    const leftExpression = typeof condition.leftExpression === "string" ? condition.leftExpression : typeof condition.leftFieldKey === "string" ? `{{${condition.leftFieldKey}}}` : "";
    const rightExpression = typeof condition.rightExpression === "string" ? condition.rightExpression : typeof condition.rightFieldKey === "string" ? `{{${condition.rightFieldKey}}}` : "";
    if (!leftExpression || !rightExpression) return [];
    return [{
      leftExpression,
      rightExpression,
      leftDisplayExpression: typeof condition.leftDisplayExpression === "string" ? condition.leftDisplayExpression : typeof condition.leftFieldName === "string" ? `[${condition.leftFieldName}]` : leftExpression,
      rightDisplayExpression: typeof condition.rightDisplayExpression === "string" ? condition.rightDisplayExpression : typeof condition.rightFieldName === "string" ? `[${condition.rightFieldName}]` : rightExpression,
      leftReferenceKeys: Array.isArray(condition.leftReferenceKeys) ? condition.leftReferenceKeys.filter((key): key is string => typeof key === "string") : typeof condition.leftFieldKey === "string" ? [condition.leftFieldKey] : [],
      rightReferenceKeys: Array.isArray(condition.rightReferenceKeys) ? condition.rightReferenceKeys.filter((key): key is string => typeof key === "string") : typeof condition.rightFieldKey === "string" ? [condition.rightFieldKey] : [],
      leftRpn: Array.isArray(condition.leftRpn) ? condition.leftRpn as BusinessFormulaRpnToken[] : typeof condition.leftFieldKey === "string" ? [{ type: "FIELD" as const, fieldKey: condition.leftFieldKey }] : undefined,
      rightRpn: Array.isArray(condition.rightRpn) ? condition.rightRpn as BusinessFormulaRpnToken[] : typeof condition.rightFieldKey === "string" ? [{ type: "FIELD" as const, fieldKey: condition.rightFieldKey }] : undefined,
      leftFieldKey: typeof condition.leftFieldKey === "string" ? condition.leftFieldKey : undefined,
      leftFieldName: typeof condition.leftFieldName === "string" ? condition.leftFieldName : undefined,
      operator: condition.operator as BusinessJudgmentOperator,
      rightFieldKey: typeof condition.rightFieldKey === "string" ? condition.rightFieldKey : undefined,
      rightFieldName: typeof condition.rightFieldName === "string" ? condition.rightFieldName : undefined,
      result: condition.result,
    }];
  });
  if (conditions.length !== data.conditions.length || !conditions.length) return null;
  return { conditions, referenceKeys: [...new Set(conditions.flatMap(condition => [...(condition.leftReferenceKeys || []), ...(condition.rightReferenceKeys || [])]))] };
}

export function calculateStoredBusinessJudgment(sourceFieldConfig: unknown, values: Record<string, number | null | undefined>) {
  const judgment = readStoredBusinessJudgmentConfig(sourceFieldConfig);
  return judgment ? evaluateBusinessJudgment(judgment.conditions, values) : null;
}

export type TemplateOption = {
  templateId: string;
  templateRecordNo: string;
  templateName: string;
  status: RecordStatus;
};

export type SourceTemplateField = {
  sourceFieldKey: string;
  sourceFieldId: string | null;
  sourceFieldCode: string | null;
  fieldName: string;
  sourceFieldType: string;
  fieldRole: BusinessDataFieldRole;
  recommendedFieldType: BusinessDataFieldType | null;
  recommendedUnit: string | null;
  isSelectable: boolean;
  isNumericCompatible: boolean;
  sourceFieldConfig: Prisma.InputJsonValue;
  originalTableField: string;
};

export type BusinessDataSourceFilters = {
  businessNameKeyword?: string;
  sourceType?: BusinessDataSourceType;
  templateRecordNo?: string;
};

export function readBusinessDataSourceFilters(search: URLSearchParams): BusinessDataSourceFilters {
  const businessNameKeyword = search.get("businessNameKeyword")?.trim().slice(0, 20) || undefined;
  const rawType = search.get("sourceType")?.trim();
  const sourceType = Object.values(BusinessDataSourceType).includes(rawType as BusinessDataSourceType) ? rawType as BusinessDataSourceType : undefined;
  const templateRecordNo = search.get("templateRecordNo")?.trim().slice(0, 24) || undefined;
  return { businessNameKeyword, sourceType, templateRecordNo };
}

export function businessDataSourceFilterWhere(filters: BusinessDataSourceFilters): Prisma.BusinessDataSourceWhereInput {
  return {
    ...(filters.businessNameKeyword ? { businessName: { contains: filters.businessNameKeyword } } : {}),
    ...(filters.sourceType ? { sourceType: filters.sourceType } : {}),
    ...(filters.templateRecordNo ? { templateRecordNoSnapshot: filters.templateRecordNo } : {}),
  };
}

export const businessDataSourceListSelect = {
  id: true,
  recordNo: true,
  businessName: true,
  sourceType: true,
  templateId: true,
  templateRecordNoSnapshot: true,
  templateNameSnapshot: true,
  systemSources: true,
  createdByNameSnapshot: true,
  createdAt: true,
  updatedAt: true,
  version: true,
  _count: { select: { fields: true } },
} satisfies Prisma.BusinessDataSourceSelect;

type BusinessDataSourceListRow = Prisma.BusinessDataSourceGetPayload<{ select: typeof businessDataSourceListSelect }>;

export function serializeBusinessDataSourceListRow(row: BusinessDataSourceListRow) {
  const systemSources = readBusinessDataSystemSources(row.systemSources);
  return {
    ...row,
    systemSources,
    systemSourceSummary: businessDataSystemSourceSummary(systemSources),
    sourceTypeLabel: sourceTypeLabels[row.sourceType],
  };
}

export async function listTemplateOptions(sourceType: BusinessDataSourceType) {
  if (sourceType === BusinessDataSourceType.TASK_TEMPLATE) {
    return (await db.task.findMany({
      where: { status: RecordStatus.ENABLED, deletedAt: null, configFileName: { not: null } },
      select: { id: true, recordNo: true, title: true, status: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    })).flatMap(row => row.recordNo ? [{ templateId: row.id, templateRecordNo: row.recordNo, templateName: row.title, status: row.status }] : []);
  }
  if (sourceType === BusinessDataSourceType.ASSESSMENT_TEMPLATE) {
    return (await db.assessment.findMany({
      where: { status: RecordStatus.ENABLED, deletedAt: null },
      select: { id: true, recordNo: true, name: true, status: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    })).map(row => ({ templateId: row.id, templateRecordNo: row.recordNo, templateName: row.name, status: row.status }));
  }
  return (await db.researchTemplate.findMany({
    where: { status: RecordStatus.ENABLED, deletedAt: null },
    select: { id: true, recordNo: true, templateType: true, status: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  })).map(row => ({ templateId: row.id, templateRecordNo: row.recordNo, templateName: row.templateType, status: row.status }));
}

export async function findTemplateOption(sourceType: BusinessDataSourceType, templateId: string): Promise<TemplateOption | null> {
  if (sourceType === BusinessDataSourceType.TASK_TEMPLATE) {
    const row = await db.task.findFirst({ where: { id: templateId, deletedAt: null, configFileName: { not: null } }, select: { id: true, recordNo: true, title: true, status: true } });
    return row?.recordNo ? { templateId: row.id, templateRecordNo: row.recordNo, templateName: row.title, status: row.status } : null;
  }
  if (sourceType === BusinessDataSourceType.ASSESSMENT_TEMPLATE) {
    const row = await db.assessment.findFirst({ where: { id: templateId, deletedAt: null }, select: { id: true, recordNo: true, name: true, status: true } });
    return row ? { templateId: row.id, templateRecordNo: row.recordNo, templateName: row.name, status: row.status } : null;
  }
  const row = await db.researchTemplate.findFirst({ where: { id: templateId, deletedAt: null }, select: { id: true, recordNo: true, templateType: true, status: true } });
  return row ? { templateId: row.id, templateRecordNo: row.recordNo, templateName: row.templateType, status: row.status } : null;
}

type TaskSubmitItem = { name?: unknown; component?: unknown; dataType?: unknown; description?: unknown };
type AssessmentConfigItem = { id?: unknown; description?: unknown; maxScore?: unknown };
type AssessmentConfigSubsection = { name?: unknown; items?: unknown };
type AssessmentConfigSection = { name?: unknown; children?: unknown };

function systemDimension(input: {
  key: string;
  code: string;
  name: string;
  type: Extract<BusinessDataFieldType, "TEXT" | "DATE" | "DATETIME">;
  source: string;
  column: string;
  idColumn?: string;
}): SourceTemplateField {
  return {
    sourceFieldKey: `system:${input.key}`,
    sourceFieldId: null,
    sourceFieldCode: input.code,
    fieldName: input.name,
    sourceFieldType: input.type === BusinessDataFieldType.TEXT ? "text" : input.type === BusinessDataFieldType.DATE ? "date" : "datetime",
    fieldRole: BusinessDataFieldRole.DIMENSION,
    recommendedFieldType: input.type,
    recommendedUnit: null,
    isSelectable: true,
    isNumericCompatible: false,
    sourceFieldConfig: {
      role: "dimension",
      source: input.source,
      column: input.column,
      ...(input.idColumn ? { idColumn: input.idColumn } : {}),
    },
    originalTableField: `${input.source}.${input.column}`,
  };
}

export function originalTableFieldLabel(field: { sourceFieldKey: string; sourceFieldConfig: unknown }) {
  const config = field.sourceFieldConfig && typeof field.sourceFieldConfig === "object" && !Array.isArray(field.sourceFieldConfig)
    ? field.sourceFieldConfig as Record<string, unknown>
    : null;
  if (field.sourceFieldKey.startsWith("formula:") || config?.source === "FORMULA") return "公式计算";
  if (field.sourceFieldKey.startsWith("judgment:") || config?.source === "JUDGMENT") return "判断计算";
  if (typeof config?.originalTableField === "string") return config.originalTableField;
  if (typeof config?.source === "string" && typeof config.column === "string") return `${config.source}.${config.column}`;
  if (field.sourceFieldKey.startsWith("task-item:")) return "TaskSubmissionItem.value";
  if (field.sourceFieldKey === "assessment:total-score") return "LeadH5Review.actualScore";
  if (field.sourceFieldKey.startsWith("assessment-item:")) return "LeadH5ReviewItem.actualScore";
  if (field.sourceFieldKey.startsWith("research-item:")) return "ResearchTemplateRecord.resultSnapshot";
  return "-";
}

function getSystemDimensions(sourceType: BusinessDataSourceType): SourceTemplateField[] {
  if (sourceType === BusinessDataSourceType.TASK_TEMPLATE) {
    return [
      systemDimension({ key: "source-record-no", code: "SOURCE_RECORD_NO", name: "任务记录编号", type: BusinessDataFieldType.TEXT, source: "TaskSubmission", column: "recordNo" }),
      systemDimension({ key: "business-date", code: "BUSINESS_DATE", name: "业务日期", type: BusinessDataFieldType.DATE, source: "TaskSubmission", column: "executionDate" }),
      systemDimension({ key: "submitted-at", code: "SUBMITTED_AT", name: "上报时间", type: BusinessDataFieldType.DATETIME, source: "TaskSubmission", column: "submittedAt" }),
      systemDimension({ key: "brand-name", code: "BRAND_NAME", name: "品牌", type: BusinessDataFieldType.TEXT, source: "TaskSubmission", column: "brandNameSnapshot", idColumn: "brandIdSnapshot" }),
      systemDimension({ key: "store-name", code: "STORE_NAME", name: "门店", type: BusinessDataFieldType.TEXT, source: "TaskSubmission", column: "storeNameSnapshot", idColumn: "storeId" }),
      systemDimension({ key: "submitter-name", code: "SUBMITTER_NAME", name: "上报人", type: BusinessDataFieldType.TEXT, source: "TaskSubmission", column: "userRealNameSnapshot", idColumn: "userId" }),
    ];
  }
  if (sourceType === BusinessDataSourceType.ASSESSMENT_TEMPLATE) {
    return [
      systemDimension({ key: "source-record-no", code: "SOURCE_RECORD_NO", name: "考核记录编号", type: BusinessDataFieldType.TEXT, source: "LeadH5Review", column: "recordNo" }),
      systemDimension({ key: "business-date", code: "BUSINESS_DATE", name: "考核日期", type: BusinessDataFieldType.DATE, source: "LeadH5Review", column: "assessmentDate" }),
      systemDimension({ key: "submitted-at", code: "SUBMITTED_AT", name: "上报时间", type: BusinessDataFieldType.DATETIME, source: "LeadH5Review", column: "submittedAt" }),
      systemDimension({ key: "brand-name", code: "BRAND_NAME", name: "品牌", type: BusinessDataFieldType.TEXT, source: "LeadH5Review", column: "brandNameSnapshot", idColumn: "brandId" }),
      systemDimension({ key: "store-name", code: "STORE_NAME", name: "门店", type: BusinessDataFieldType.TEXT, source: "LeadH5Review", column: "storeNameSnapshot", idColumn: "storeId" }),
      systemDimension({ key: "submitter-name", code: "SUBMITTER_NAME", name: "考核人", type: BusinessDataFieldType.TEXT, source: "LeadH5Review", column: "reviewerRealName", idColumn: "reviewerUserId" }),
    ];
  }
  return [
    systemDimension({ key: "source-record-no", code: "SOURCE_RECORD_NO", name: "调研记录编号", type: BusinessDataFieldType.TEXT, source: "ResearchTemplateRecord", column: "recordNo" }),
    systemDimension({ key: "business-period", code: "BUSINESS_PERIOD", name: "调研月份", type: BusinessDataFieldType.TEXT, source: "ResearchTemplateRecord", column: "researchMonth" }),
    systemDimension({ key: "submitted-at", code: "SUBMITTED_AT", name: "上报时间", type: BusinessDataFieldType.DATETIME, source: "ResearchTemplateRecord", column: "submittedAt" }),
    systemDimension({ key: "brand-name", code: "BRAND_NAME", name: "品牌", type: BusinessDataFieldType.TEXT, source: "ResearchTemplateRecord", column: "brandNameSnapshot", idColumn: "brandId" }),
    systemDimension({ key: "store-name", code: "STORE_NAME", name: "门店", type: BusinessDataFieldType.TEXT, source: "ResearchTemplateRecord", column: "storeNameSnapshot", idColumn: "storeId" }),
    systemDimension({ key: "submitter-name", code: "SUBMITTER_NAME", name: "上报人", type: BusinessDataFieldType.TEXT, source: "ResearchTemplateRecord", column: "supervisorRealName", idColumn: "submittedByUserId" }),
  ];
}

function compositeSystemMetric(input: {
  key: string;
  name: string;
  sourceFieldType: "money" | "decimal";
  fieldType: Extract<BusinessDataFieldType, "MONEY" | "DECIMAL">;
  unit: string | null;
  systemSource: BusinessDataSystemSource;
  source: string;
  column: string;
  originalTableField: string;
  grain: "STORE" | "STORE_DAY";
  joinKeys: Array<{ base: string; target: string }>;
  calculation?: string;
  inputColumns?: string[];
  divisorColumn?: string;
  divisionByZero?: "NULL";
}): SourceTemplateField {
  return {
    sourceFieldKey: `system-source:${input.systemSource.toLowerCase().replaceAll("_", "-")}:${input.key}`,
    sourceFieldId: null,
    sourceFieldCode: `${input.systemSource}_${input.key.replaceAll("-", "_").toUpperCase()}`,
    fieldName: input.name,
    sourceFieldType: input.sourceFieldType,
    fieldRole: BusinessDataFieldRole.METRIC,
    recommendedFieldType: input.fieldType,
    recommendedUnit: input.unit,
    isSelectable: true,
    isNumericCompatible: true,
    sourceFieldConfig: {
      role: "metric",
      source: input.source,
      column: input.column,
      systemSource: input.systemSource,
      grain: input.grain,
      join: { baseSource: "TaskSubmission", keys: input.joinKeys },
      missingValue: "NULL",
      originalTableField: input.originalTableField,
      ...(input.calculation ? { calculation: input.calculation } : {}),
      ...(input.inputColumns ? { inputColumns: input.inputColumns } : {}),
      ...(input.divisorColumn ? { divisorColumn: input.divisorColumn } : {}),
      ...(input.divisionByZero ? { divisionByZero: input.divisionByZero } : {}),
    },
    originalTableField: input.originalTableField,
  };
}

function getCompositeSystemSourceFields(systemSources: BusinessDataSystemSource[]): SourceTemplateField[] {
  const result: SourceTemplateField[] = [];
  if (systemSources.includes("STORE_COST")) {
    const common = {
      systemSource: "STORE_COST" as const,
      source: "StoreCost",
      sourceFieldType: "money" as const,
      fieldType: BusinessDataFieldType.MONEY,
      unit: "元/月",
      grain: "STORE" as const,
      joinKeys: [{ base: "storeId", target: "storeId" }],
    };
    result.push(
      compositeSystemMetric({ ...common, key: "store-rent", name: "门店房租（月配置）", column: "storeRent", originalTableField: "StoreCost.storeRent" }),
      compositeSystemMetric({ ...common, key: "employee-wages", name: "员工工资（月预算）", column: "employeeWages", originalTableField: "StoreCost.employeeWages" }),
      compositeSystemMetric({ ...common, key: "dormitory-rent", name: "宿舍房租（月配置）", column: "dormitoryRent", originalTableField: "StoreCost.dormitoryRent" }),
      compositeSystemMetric({ ...common, key: "property-fee", name: "物业费（月配置）", column: "propertyFee", originalTableField: "StoreCost.propertyFee" }),
      compositeSystemMetric({ ...common, key: "utilities-fee", name: "水电费（月配置）", column: "utilitiesFee", originalTableField: "StoreCost.utilitiesFee" }),
      compositeSystemMetric({ ...common, key: "other-cost", name: "其他成本（月配置）", column: "otherCost", originalTableField: "StoreCost.otherCost" }),
      compositeSystemMetric({
        key: "ratio-coefficient",
        name: "成本比例系数",
        sourceFieldType: "decimal",
        fieldType: BusinessDataFieldType.DECIMAL,
        unit: null,
        systemSource: "STORE_COST",
        source: "StoreCost",
        column: "ratioCoefficient",
        originalTableField: "StoreCost.ratioCoefficient",
        grain: "STORE",
        joinKeys: common.joinKeys,
      }),
      compositeSystemMetric({
        key: "monthly-break-even-revenue",
        name: "月保本营业额",
        sourceFieldType: "money",
        fieldType: BusinessDataFieldType.MONEY,
        unit: "元/月",
        systemSource: "STORE_COST",
        source: "StoreCostSummary",
        column: "monthlyBreakEvenRevenue",
        originalTableField: "(StoreCost.storeRent + employeeWages + dormitoryRent + propertyFee + utilitiesFee + otherCost) / ratioCoefficient",
        grain: "STORE",
        joinKeys: common.joinKeys,
        calculation: "FIXED_COST_DIVIDED_BY_RATIO_COEFFICIENT",
        inputColumns: ["storeRent", "employeeWages", "dormitoryRent", "propertyFee", "utilitiesFee", "otherCost"],
        divisorColumn: "ratioCoefficient",
        divisionByZero: "NULL",
      }),
    );
  }
  if (systemSources.includes("DAILY_LABOR_COST")) {
    const common = {
      systemSource: "DAILY_LABOR_COST" as const,
      sourceFieldType: "money" as const,
      fieldType: BusinessDataFieldType.MONEY,
      unit: "元/日",
      grain: "STORE_DAY" as const,
      joinKeys: [{ base: "storeId", target: "storeId" }, { base: "executionDate", target: "attendanceDate" }],
    };
    result.push(
      compositeSystemMetric({
        ...common,
        key: "full-time-labor-cost",
        name: "全职人员用工成本（当日）",
        source: "DailyAttendanceSummary",
        column: "fullTimeLaborCost",
        originalTableField: "DailyAttendanceItem.laborCostSnapshot / hourlyLaborCostSnapshot",
        calculation: "ATTENDANCE_ACTUAL_SUM",
      }),
      compositeSystemMetric({
        ...common,
        key: "part-time-labor-cost",
        name: "兼职人员成本（当日）",
        source: "DailyAttendanceSummary",
        column: "partTimeLaborCost",
        originalTableField: "DailyAttendanceRecord.partTimeActualLaborCost",
        calculation: "NULL_RECORD_RETURNS_NULL",
      }),
      compositeSystemMetric({
        ...common,
        key: "total-labor-cost",
        name: "当日用工成本（合计）",
        source: "DailyAttendanceSummary",
        column: "totalLaborCost",
        originalTableField: "DailyAttendanceItem.laborCostSnapshot + DailyAttendanceRecord.partTimeActualLaborCost",
        calculation: "FULL_TIME_PLUS_PART_TIME",
      }),
    );
  }
  return result;
}

export async function getTemplateFields(sourceType: BusinessDataSourceType, templateId: string, systemSources: BusinessDataSystemSource[] = []): Promise<SourceTemplateField[]> {
  if (sourceType === BusinessDataSourceType.TASK_TEMPLATE) {
    const task = await db.task.findFirst({ where: { id: templateId, deletedAt: null, configFileName: { not: null } }, select: { submitItems: true } });
    if (!task) return [];
    const items = Array.isArray(task.submitItems) ? task.submitItems as TaskSubmitItem[] : [];
    return [...getSystemDimensions(sourceType), ...items.flatMap((item, index) => {
      const name = typeof item.name === "string" ? item.name.trim() : "";
      const dataType = typeof item.dataType === "string" ? item.dataType : "";
      if (!name || item.component !== "input" || (dataType !== "quantity" && dataType !== "amount" && dataType !== "score" && dataType !== "text")) return [];
      return [{
        sourceFieldKey: `task-item:${index}`,
        sourceFieldId: null,
        sourceFieldCode: null,
        fieldName: name,
        sourceFieldType: dataType,
        fieldRole: BusinessDataFieldRole.METRIC,
        recommendedFieldType: dataType === "amount" ? BusinessDataFieldType.MONEY : dataType === "score" ? BusinessDataFieldType.DECIMAL : dataType === "text" ? BusinessDataFieldType.TEXT : BusinessDataFieldType.INTEGER,
        recommendedUnit: dataType === "amount" ? "元" : dataType === "score" ? "分" : null,
        isSelectable: true,
        isNumericCompatible: dataType !== "text",
        sourceFieldConfig: { role: "metric", source: "TaskSubmissionItem", column: "value", sortOrder: index, itemName: name, componentType: "input", dataType },
        originalTableField: "TaskSubmissionItem.value",
      }];
    }), ...getCompositeSystemSourceFields(systemSources)];
  }
  if (sourceType === BusinessDataSourceType.ASSESSMENT_TEMPLATE) {
    const assessment = await db.assessment.findFirst({ where: { id: templateId, deletedAt: null }, select: { configFileName: true } });
    if (!assessment) return [];
    const config = await readAssessmentConfig(assessment.configFileName);
    const result: SourceTemplateField[] = [...getSystemDimensions(sourceType), {
      sourceFieldKey: "assessment:total-score",
      sourceFieldId: "actualTotalScore",
      sourceFieldCode: "ACTUAL_TOTAL_SCORE",
      fieldName: "考核总分",
      sourceFieldType: "score",
      fieldRole: BusinessDataFieldRole.METRIC,
      recommendedFieldType: BusinessDataFieldType.DECIMAL,
      recommendedUnit: "分",
      isSelectable: true,
      isNumericCompatible: true,
      sourceFieldConfig: { role: "metric", source: "LeadH5Review", column: "actualScore", path: "actualTotalScore" },
      originalTableField: "LeadH5Review.actualScore",
    }];
    const sections = Array.isArray(config.sections) ? config.sections as AssessmentConfigSection[] : [];
    for (const section of sections) {
      const sectionName = typeof section.name === "string" ? section.name : "";
      const children = Array.isArray(section.children) ? section.children as AssessmentConfigSubsection[] : [];
      for (const child of children) {
        const subsectionName = typeof child.name === "string" ? child.name : "";
        const items = Array.isArray(child.items) ? child.items as AssessmentConfigItem[] : [];
        for (const item of items) {
          if (typeof item.id !== "string" || typeof item.description !== "string") continue;
          const fieldName = [sectionName, subsectionName, item.description].filter(Boolean).join(" / ");
          result.push({
            sourceFieldKey: `assessment-item:${item.id}`,
            sourceFieldId: item.id,
            sourceFieldCode: item.id,
            fieldName,
            sourceFieldType: "score",
            fieldRole: BusinessDataFieldRole.METRIC,
            recommendedFieldType: BusinessDataFieldType.DECIMAL,
            recommendedUnit: "分",
            isSelectable: true,
            isNumericCompatible: true,
            sourceFieldConfig: { role: "metric", source: "LeadH5ReviewItem", column: "actualScore", itemId: item.id, maxScore: typeof item.maxScore === "number" ? item.maxScore : null },
            originalTableField: "LeadH5ReviewItem.actualScore",
          });
        }
      }
    }
    return result;
  }
  const template = await db.researchTemplate.findFirst({ where: { id: templateId, deletedAt: null }, select: { configFileName: true } });
  if (!template) return [];
  const config = await readResearchConfig(template.configFileName);
  return [...getSystemDimensions(sourceType), ...config.items.map(item => ({
    sourceFieldKey: `research-item:${item.id}`,
    sourceFieldId: item.id,
    sourceFieldCode: item.id,
    fieldName: [item.section, item.subSection, item.label].filter(Boolean).join(" / "),
    sourceFieldType: item.component,
    fieldRole: BusinessDataFieldRole.METRIC,
    recommendedFieldType: null,
    recommendedUnit: null,
    isSelectable: true,
    isNumericCompatible: true,
    sourceFieldConfig: { role: "metric", source: "ResearchTemplateRecord", column: "resultSnapshot", jsonPath: item.id, itemId: item.id, section: item.section, subSection: item.subSection, label: item.label },
    originalTableField: "ResearchTemplateRecord.resultSnapshot",
  }))];
}

export async function validateSourceAndBuildFields(input: BusinessDataSourceInput, createdByUserId: string) {
  if (input.sourceType !== BusinessDataSourceType.TASK_TEMPLATE && input.systemSources.length) {
    throw new Error("组合系统来源第一阶段仅支持任务模版");
  }
  const template = await findTemplateOption(input.sourceType, input.templateId);
  if (!template) throw new Error("所选模版记录不存在或已删除，请重新选择");
  const availableFields = await getTemplateFields(input.sourceType, input.templateId, input.systemSources);
  const availableByKey = new Map(availableFields.map(field => [field.sourceFieldKey, field]));
  const duplicateKeys = new Set<string>();
  const duplicateNames = new Set<string>();
  const metricTypes = new Set<BusinessDataFieldType>([
    BusinessDataFieldType.INTEGER, BusinessDataFieldType.DECIMAL,
    BusinessDataFieldType.MONEY, BusinessDataFieldType.PERCENTAGE,
  ]);
  type BuiltField = {
    sourceFieldKey: string;
    sourceFieldId: string | null;
    sourceFieldCode: string | null;
    fieldNameSnapshot: string;
    sourceFieldType: string;
    sourceFieldConfig: Prisma.InputJsonValue;
    fieldRole: BusinessDataFieldRole;
    fieldType: BusinessDataFieldType;
    unit: string | null;
    remark: string | null;
    sortOrder: number;
    createdByUserId: string;
  };
  const builtFields: Array<BuiltField | null> = Array.from({ length: input.fields.length }, () => null);
  const numericSourceFieldsByName = new Map<string, { sourceFieldKey: string; fieldType: BusinessDataFieldType }>();
  const numericFieldNamesByKey = new Map<string, string>();

  input.fields.forEach((inputField, sortOrder) => {
    if (inputField.fieldSource === "FORMULA") {
      const formulaName = inputField.formulaName?.trim() || "";
      if (!/^formula:[0-9a-f-]{36}$/i.test(inputField.sourceFieldKey)) throw new Error("公式字段标识无效，请重新新增公式字段");
      if (!formulaName) throw new Error("请输入自定义业务字段名称");
      if (!metricTypes.has(inputField.fieldType)) throw new Error("公式字段仅支持整数、数值、金额或百分比类型");
      if (duplicateKeys.has(inputField.sourceFieldKey) || duplicateNames.has(formulaName)) throw new Error("当前数据源已存在相同业务字段");
      duplicateKeys.add(inputField.sourceFieldKey);
      duplicateNames.add(formulaName);
      numericFieldNamesByKey.set(inputField.sourceFieldKey, formulaName);
      return;
    }
    if (inputField.fieldSource === "JUDGMENT") {
      const judgmentName = inputField.judgmentName?.trim() || "";
      if (!/^judgment:[0-9a-f-]{36}$/i.test(inputField.sourceFieldKey)) throw new Error("判断字段标识无效，请重新新增判断字段");
      if (!judgmentName) throw new Error("请输入自定义判断字段名称");
      if (inputField.fieldType !== BusinessDataFieldType.TEXT) throw new Error("判断字段类型固定为文本");
      if (inputField.unit) throw new Error("判断字段不支持配置单位");
      if (duplicateKeys.has(inputField.sourceFieldKey) || duplicateNames.has(judgmentName)) throw new Error("当前数据源已存在相同业务字段");
      duplicateKeys.add(inputField.sourceFieldKey);
      duplicateNames.add(judgmentName);
      return;
    }
    const sourceField = availableByKey.get(inputField.sourceFieldKey);
    if (!sourceField || !sourceField.isSelectable) throw new Error("部分业务字段已不在当前模版或系统维度中，请重新配置");
    if (sourceField.fieldRole === BusinessDataFieldRole.DIMENSION) {
      if (!sourceField.recommendedFieldType || inputField.fieldType !== sourceField.recommendedFieldType) throw new Error("系统维度的字段类型由系统固定，不可修改");
      if (inputField.unit) throw new Error("系统维度不支持配置单位");
    } else if (sourceField.sourceFieldType === "text") {
      if (inputField.fieldType !== BusinessDataFieldType.TEXT) throw new Error("文本业务字段的字段类型固定为文本，不可修改");
      if (inputField.unit) throw new Error("文本业务字段不支持配置单位");
    } else if (!metricTypes.has(inputField.fieldType)) {
      throw new Error("业务指标仅支持整数、数值、金额或百分比类型");
    }
    if (duplicateKeys.has(sourceField.sourceFieldKey) || duplicateNames.has(sourceField.fieldName)) throw new Error("当前数据源已存在相同业务字段");
    duplicateKeys.add(sourceField.sourceFieldKey);
    duplicateNames.add(sourceField.fieldName);
    if (inputField.fieldNameSnapshot && inputField.fieldNameSnapshot !== sourceField.fieldName) {
      if (duplicateNames.has(inputField.fieldNameSnapshot)) throw new Error("当前数据源已存在相同业务字段");
      duplicateNames.add(inputField.fieldNameSnapshot);
    }
    builtFields[sortOrder] = {
      sourceFieldKey: sourceField.sourceFieldKey,
      sourceFieldId: sourceField.sourceFieldId,
      sourceFieldCode: sourceField.sourceFieldCode,
      fieldNameSnapshot: sourceField.fieldName,
      sourceFieldType: sourceField.sourceFieldType,
      sourceFieldConfig: sourceField.sourceFieldConfig,
      fieldRole: sourceField.fieldRole,
      fieldType: inputField.fieldType,
      unit: inputField.unit || null,
      remark: inputField.remark || null,
      sortOrder,
      createdByUserId,
    };
    if (sourceField.fieldRole === BusinessDataFieldRole.METRIC && metricTypes.has(inputField.fieldType)) {
      numericSourceFieldsByName.set(sourceField.fieldName, { sourceFieldKey: sourceField.sourceFieldKey, fieldType: inputField.fieldType });
      numericFieldNamesByKey.set(sourceField.sourceFieldKey, sourceField.fieldName);
      if (inputField.fieldNameSnapshot) numericSourceFieldsByName.set(inputField.fieldNameSnapshot, { sourceFieldKey: sourceField.sourceFieldKey, fieldType: inputField.fieldType });
    }
  });

  input.fields.forEach((inputField, sortOrder) => {
    if (inputField.fieldSource !== "JUDGMENT") return;
    const judgmentName = inputField.judgmentName!.trim();
    const fieldResolver = (fieldName: string) => numericSourceFieldsByName.get(fieldName)?.sourceFieldKey || [...numericFieldNamesByKey.entries()].find(([, name]) => name === fieldName)?.[0] || null;
    let conditions: BusinessJudgmentCondition[];
    try {
      conditions = (inputField.judgmentConditions || []).map(condition => {
        const leftText = condition.leftExpression || (condition.leftFieldKey ? `{{${condition.leftFieldKey}}}` : "");
        const rightText = condition.rightExpression || (condition.rightFieldKey ? `{{${condition.rightFieldKey}}}` : "");
        const left = parseBusinessFormula(leftText, fieldResolver, { requireField: false });
        const right = parseBusinessFormula(rightText, fieldResolver, { requireField: false });
        return {
          leftExpression: left.expression,
          rightExpression: right.expression,
          leftDisplayExpression: left.displayExpression,
          rightDisplayExpression: right.displayExpression,
          leftReferenceKeys: left.referenceKeys,
          rightReferenceKeys: right.referenceKeys,
          leftRpn: left.rpn,
          rightRpn: right.rpn,
          operator: condition.operator,
          result: condition.result,
        };
      });
    } catch (error) {
      if (error instanceof BusinessFormulaError) throw new Error(`判断条件表达式不正确：${error.message}`);
      throw error;
    }
    if (!conditions.some(condition => (condition.leftReferenceKeys?.length || 0) + (condition.rightReferenceKeys?.length || 0) > 0)) throw new Error("判断条件至少需要引用一个数值字段或公式字段");
    const conditionError = validateBusinessJudgmentConditions(conditions, new Set(numericFieldNamesByKey.keys()));
    if (conditionError) throw new Error(conditionError);
    const storedConditions = conditions.map(condition => {
      const leftFieldName = condition.leftReferenceKeys?.length === 1 ? numericFieldNamesByKey.get(condition.leftReferenceKeys[0]) : undefined;
      const rightFieldName = condition.rightReferenceKeys?.length === 1 ? numericFieldNamesByKey.get(condition.rightReferenceKeys[0]) : undefined;
      return { ...condition, ...(leftFieldName ? { leftFieldName } : {}), ...(rightFieldName ? { rightFieldName } : {}) };
    });
    builtFields[sortOrder] = {
      sourceFieldKey: inputField.sourceFieldKey,
      sourceFieldId: null,
      sourceFieldCode: `JUDGMENT_${inputField.sourceFieldKey.slice("judgment:".length).replaceAll("-", "").toUpperCase()}`,
      fieldNameSnapshot: judgmentName,
      sourceFieldType: "judgment",
      sourceFieldConfig: {
        role: "metric",
        source: "JUDGMENT",
        judgment: {
          version: 1,
          conditions: storedConditions,
          referenceKeys: [...new Set(storedConditions.flatMap(condition => [...(condition.leftReferenceKeys || []), ...(condition.rightReferenceKeys || [])]))],
        },
      } as Prisma.InputJsonValue,
      fieldRole: BusinessDataFieldRole.METRIC,
      fieldType: BusinessDataFieldType.TEXT,
      unit: null,
      remark: inputField.remark || null,
      sortOrder,
      createdByUserId,
    };
  });

  input.fields.forEach((inputField, sortOrder) => {
    if (inputField.fieldSource !== "FORMULA") return;
    const formulaName = inputField.formulaName!.trim();
    try {
      const parsedFormula = parseBusinessFormula(inputField.formulaExpression!, fieldName => numericSourceFieldsByName.get(fieldName)?.sourceFieldKey || null);
      builtFields[sortOrder] = {
        sourceFieldKey: inputField.sourceFieldKey,
        sourceFieldId: null,
        sourceFieldCode: `FORMULA_${inputField.sourceFieldKey.slice("formula:".length).replaceAll("-", "").toUpperCase()}`,
        fieldNameSnapshot: formulaName,
        sourceFieldType: "formula",
        sourceFieldConfig: {
          role: "metric",
          source: "FORMULA",
          formula: {
            version: 1,
            expression: parsedFormula.expression,
            displayExpression: parsedFormula.displayExpression,
            referenceKeys: parsedFormula.referenceKeys,
            rpn: parsedFormula.rpn,
            divisionByZero: "NULL",
          },
        } as Prisma.InputJsonValue,
        fieldRole: BusinessDataFieldRole.METRIC,
        fieldType: inputField.fieldType,
        unit: inputField.unit || null,
        remark: inputField.remark || null,
        sortOrder,
        createdByUserId,
      };
    } catch (error) {
      if (error instanceof BusinessFormulaError) throw error;
      throw new Error("计算公式格式不正确");
    }
  });

  return { template, fields: builtFields.map(field => {
    if (!field) throw new Error("部分业务字段配置不完整，请重新配置");
    return field;
  }) };
}

export async function nextBusinessDataSourceRecordNo(tx: Prisma.TransactionClient, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find(item => item.type === type)?.value || "";
  const dateKey = `${part("year")}${part("month")}${part("day")}`;
  const sequence = await tx.businessDataSourceSequence.upsert({
    where: { dateKey },
    create: { dateKey, nextValue: 2 },
    update: { nextValue: { increment: 1 } },
  });
  const value = sequence.nextValue - 1;
  if (value > 9999) throw new Error("当日业务数据源记录编号已达到上限");
  return `${dateKey}${String(value).padStart(4, "0")}`;
}

export function formatBusinessDataSourceDate(value: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).format(value).replaceAll("/", "-");
}

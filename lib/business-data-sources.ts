import {
  BusinessDataFieldRole, BusinessDataFieldType, BusinessDataSourceType, Prisma, RecordStatus,
} from "@prisma/client";
import { z } from "zod";
import type { Session } from "@/lib/auth";
import { readAssessmentConfig } from "@/lib/assessment-config";
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
  sourceFieldKey: z.string().trim().min(1, "请选择数值字段").max(191),
  fieldType: z.nativeEnum(BusinessDataFieldType, { message: "请选择字段类型" }),
  unit: text(10).optional().default(""),
  remark: text(200).optional().default(""),
});

export const businessDataSourceInputSchema = z.object({
  businessName: z.string().trim().min(1, "请输入业务名称").refine(value => Array.from(value).length <= 20, "业务名称不能超过20个字符"),
  sourceType: z.nativeEnum(BusinessDataSourceType, { message: "请选择来源类型" }),
  templateId: z.string().trim().min(1, "请选择模版记录"),
  remark: text(200).optional().default(""),
  fields: z.array(businessDataSourceFieldInputSchema).min(1, "请至少新增一个数据字典字段").max(500, "单个业务数据源最多配置500个字段"),
});

export type BusinessDataSourceInput = z.infer<typeof businessDataSourceInputSchema>;

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
  createdByNameSnapshot: true,
  createdAt: true,
  updatedAt: true,
  version: true,
  _count: { select: { fields: true } },
} satisfies Prisma.BusinessDataSourceSelect;

type BusinessDataSourceListRow = Prisma.BusinessDataSourceGetPayload<{ select: typeof businessDataSourceListSelect }>;

export function serializeBusinessDataSourceListRow(row: BusinessDataSourceListRow) {
  return {
    ...row,
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

export async function getTemplateFields(sourceType: BusinessDataSourceType, templateId: string): Promise<SourceTemplateField[]> {
  if (sourceType === BusinessDataSourceType.TASK_TEMPLATE) {
    const task = await db.task.findFirst({ where: { id: templateId, deletedAt: null, configFileName: { not: null } }, select: { submitItems: true } });
    if (!task) return [];
    const items = Array.isArray(task.submitItems) ? task.submitItems as TaskSubmitItem[] : [];
    return [...getSystemDimensions(sourceType), ...items.flatMap((item, index) => {
      const name = typeof item.name === "string" ? item.name.trim() : "";
      const dataType = typeof item.dataType === "string" ? item.dataType : "";
      if (!name || item.component !== "input" || (dataType !== "quantity" && dataType !== "amount")) return [];
      return [{
        sourceFieldKey: `task-item:${index}`,
        sourceFieldId: null,
        sourceFieldCode: null,
        fieldName: name,
        sourceFieldType: dataType,
        fieldRole: BusinessDataFieldRole.METRIC,
        recommendedFieldType: dataType === "amount" ? BusinessDataFieldType.MONEY : BusinessDataFieldType.INTEGER,
        recommendedUnit: dataType === "amount" ? "元" : null,
        isSelectable: true,
        isNumericCompatible: true,
        sourceFieldConfig: { role: "metric", source: "TaskSubmissionItem", column: "value", sortOrder: index, itemName: name, componentType: "input", dataType },
        originalTableField: "TaskSubmissionItem.value",
      }];
    })];
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
  const template = await findTemplateOption(input.sourceType, input.templateId);
  if (!template) throw new Error("所选模版记录不存在或已删除，请重新选择");
  const availableFields = await getTemplateFields(input.sourceType, input.templateId);
  const availableByKey = new Map(availableFields.map(field => [field.sourceFieldKey, field]));
  const duplicateKeys = new Set<string>();
  const duplicateNames = new Set<string>();
  const metricTypes = new Set<BusinessDataFieldType>([
    BusinessDataFieldType.INTEGER, BusinessDataFieldType.DECIMAL,
    BusinessDataFieldType.MONEY, BusinessDataFieldType.PERCENTAGE,
  ]);
  const fields = input.fields.map((inputField, sortOrder) => {
    const sourceField = availableByKey.get(inputField.sourceFieldKey);
    if (!sourceField || !sourceField.isSelectable) throw new Error("部分业务字段已不在当前模版或系统维度中，请重新配置");
    if (sourceField.fieldRole === BusinessDataFieldRole.DIMENSION) {
      if (!sourceField.recommendedFieldType || inputField.fieldType !== sourceField.recommendedFieldType) throw new Error("系统维度的字段类型由系统固定，不可修改");
      if (inputField.unit) throw new Error("系统维度不支持配置单位");
    } else if (!metricTypes.has(inputField.fieldType)) {
      throw new Error("业务指标仅支持整数、数值、金额或百分比类型");
    }
    if (duplicateKeys.has(sourceField.sourceFieldKey) || duplicateNames.has(sourceField.fieldName)) throw new Error("当前数据源已存在相同数值字段");
    duplicateKeys.add(sourceField.sourceFieldKey);
    duplicateNames.add(sourceField.fieldName);
    return {
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
  });
  return { template, fields };
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

import { RecordStatus } from "@prisma/client";
import { z } from "zod";
import type { ParsedResearchDetails, ResearchTemplateConfig } from "@/lib/research-template-config";

export const researchTemplateInputSchema = z.object({
  templateType: z.string().trim().min(1, "请选择调研模版类型"),
  configFileBase: z.string().trim().min(1, "请输入调研明细配置文件名"),
  applicableBrands: z.array(z.string().trim().min(1)).min(1, "请至少选择一个适用品牌"),
  detailText: z.string().min(1, "请输入调研明细"),
  remark: z.string().trim().refine(value => Array.from(value).length <= 50, "备注不能超过50个汉字").optional().default(""),
});

export type ResearchTemplateInput = z.infer<typeof researchTemplateInputSchema>;

export function buildResearchConfig(input: ResearchTemplateInput, recordNo: string, version: number, status: RecordStatus, parsed: ParsedResearchDetails): ResearchTemplateConfig {
  return {
    recordNo,
    templateType: input.templateType,
    brands: input.applicableBrands,
    status: status === RecordStatus.ENABLED ? "已启用" : "已禁用",
    statusCode: status,
    configVersion: version,
    items: parsed.items,
  };
}

export function sameTimestamp(date: Date, value: string) {
  return date.getTime() === new Date(value).getTime();
}

export function serializeResearchTemplate<T extends { brandScopes: { brandValue: string }[] }>(row: T) {
  return { ...row, applicableBrands: row.brandScopes.map(scope => scope.brandValue), brandScopes: undefined };
}

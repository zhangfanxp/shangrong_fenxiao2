import type { ResearchTemplateConfig } from "@/lib/research-template-config";
import { readResearchConfig, ResearchTemplateConfigError } from "@/lib/research-template-config";

export const STORE_RESEARCH_TYPE = "督导巡店调研";

export type ResearchAnswer = { itemId: string; value: string };

export class LeadH5ResearchError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function validResearchMonth(value: string) {
  return /^\d{4}-(?:0[1-9]|1[0-2])$/.test(value);
}

export function researchTemplateMatchesBrand(brandValues: string[], brand: { id: string; code: string; name: string }) {
  return brandValues.some(value => value === brand.id || value === brand.code || value === brand.name);
}

export async function loadLeadH5ResearchConfig(fileName: string) {
  try {
    const config = await readResearchConfig(fileName);
    if (config.templateType !== STORE_RESEARCH_TYPE) throw new LeadH5ResearchError("调研表配置类型异常，请联系系统管理员。", 500);
    return config;
  } catch (error) {
    if (error instanceof LeadH5ResearchError) throw error;
    if (error instanceof ResearchTemplateConfigError) throw new LeadH5ResearchError(error.message, 500);
    throw error;
  }
}

export function validateResearchAnswers(config: ResearchTemplateConfig, answers: ResearchAnswer[]) {
  const answerMap = new Map(answers.map(answer => [answer.itemId, answer.value.trim()]));
  if (answerMap.size !== answers.length) throw new LeadH5ResearchError("调研项目存在重复数据，请刷新后重试。");
  const configIds = new Set(config.items.map(item => item.id));
  if (answers.some(answer => !configIds.has(answer.itemId))) throw new LeadH5ResearchError("调研项目与当前模版不一致，请刷新后重新填写。", 409);
  return {
    items: config.items.map(item => {
      const value = answerMap.get(item.id) || "";
      if (item.required && !value) throw new LeadH5ResearchError(`“${item.label}”为必填项，请填写后再提交。`);
      if (value.length > 2000) throw new LeadH5ResearchError(`“${item.label}”填写内容不能超过2000个字符。`);
      return {
        itemId: item.id,
        section: item.section,
        subSection: item.subSection,
        label: item.label,
        required: item.required,
        value,
      };
    }),
  };
}

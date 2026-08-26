import { promises as fs } from "node:fs";
import path from "node:path";
import type { RecordStatus } from "@prisma/client";

export const RESEARCH_CONFIG_DIRECTORY = path.join(process.cwd(), "data", "research-configs");

export type ResearchTemplateItem = {
  id: string;
  section: string;
  subSection: string;
  label: string;
  component: "input";
  required: boolean;
};

export type ParsedResearchDetails = { items: ResearchTemplateItem[]; normalizedText: string; itemCount: number };
export type ResearchTemplateConfig = {
  recordNo: string;
  templateType: string;
  brands: string[];
  status: "已启用" | "已禁用";
  statusCode: RecordStatus;
  configVersion: number;
  items: ResearchTemplateItem[];
};

export class ResearchTemplateConfigError extends Error {}

export function normalizeResearchFileName(value: string) {
  const baseName = value.trim().replace(/\.json$/i, "");
  if (!/^[A-Za-z0-9_]{1,20}$/.test(baseName)) {
    throw new ResearchTemplateConfigError("调研明细配置文件名称只能包含英文字母、数字和下划线，且不能超过20个字符");
  }
  return `${baseName}.json`;
}

export function parseResearchDetails(value: string): ParsedResearchDetails {
  const items: ResearchTemplateItem[] = [];
  const normalizedLines: string[] = [];
  value.replace(/\r\n/g, "\n").split("\n").forEach((original, index) => {
    const line = original.trim();
    if (!line) return;
    const lineNumber = index + 1;
    const fields = line.split(/[｜|]/).map(field => field.trim());
    if (fields.length !== 4 || fields.slice(0, 3).some(field => !field)) {
      throw new ResearchTemplateConfigError(`第${lineNumber}行调研明细格式错误，应为：总项｜子项｜检查明细项｜【输入框】必填/选填`);
    }
    const [section, subSection, label, control] = fields;
    if (control !== "【输入框】必填" && control !== "【输入框】选填") {
      throw new ResearchTemplateConfigError(`第${lineNumber}行调研控件格式错误，目前支持：【输入框】必填、【输入框】选填`);
    }
    items.push({ id: `item_${items.length + 1}`, section, subSection, label, component: "input", required: control === "【输入框】必填" });
    normalizedLines.push([section, subSection, label, control].join("｜"));
  });
  if (!items.length) throw new ResearchTemplateConfigError("请输入调研明细");
  return { items, normalizedText: normalizedLines.join("\n"), itemCount: items.length };
}

function targetPath(fileName: string) {
  if (path.basename(fileName) !== fileName || !/^[A-Za-z0-9_]{1,20}\.json$/.test(fileName)) {
    throw new ResearchTemplateConfigError("调研明细配置文件名称不合法");
  }
  return path.join(RESEARCH_CONFIG_DIRECTORY, fileName);
}

function validateConfig(value: unknown): ResearchTemplateConfig {
  if (!value || typeof value !== "object") throw new ResearchTemplateConfigError("调研配置文件格式异常，请联系系统管理员");
  const config = value as Partial<ResearchTemplateConfig>;
  if (typeof config.recordNo !== "string" || typeof config.templateType !== "string" || !Array.isArray(config.brands) || !Array.isArray(config.items) || typeof config.configVersion !== "number") {
    throw new ResearchTemplateConfigError("调研配置文件格式异常，请联系系统管理员");
  }
  const validItems = config.items.every(item => item && typeof item.id === "string" && typeof item.section === "string" && typeof item.subSection === "string" && typeof item.label === "string" && item.component === "input" && typeof item.required === "boolean");
  if (!validItems) throw new ResearchTemplateConfigError("调研配置文件格式异常，请联系系统管理员");
  return config as ResearchTemplateConfig;
}

export async function researchFileExists(fileName: string) {
  try { await fs.access(targetPath(fileName)); return true; } catch { return false; }
}

export async function readResearchConfig(fileName: string) {
  try { return validateConfig(JSON.parse(await fs.readFile(targetPath(fileName), "utf8"))); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new ResearchTemplateConfigError("未找到对应调研配置文件，请联系系统管理员处理。");
    if (error instanceof ResearchTemplateConfigError) throw error;
    if (error instanceof SyntaxError) throw new ResearchTemplateConfigError("调研配置文件格式异常，请联系系统管理员");
    throw error;
  }
}

export async function createResearchConfig(fileName: string, config: ResearchTemplateConfig) {
  await fs.mkdir(RESEARCH_CONFIG_DIRECTORY, { recursive: true });
  try { await fs.writeFile(targetPath(fileName), `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8", flag: "wx" }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new ResearchTemplateConfigError("调研明细配置文件名称已存在，请重新输入");
    throw error;
  }
}

export async function writeResearchConfig(fileName: string, config: ResearchTemplateConfig) {
  await fs.mkdir(RESEARCH_CONFIG_DIRECTORY, { recursive: true });
  const temporary = path.join(RESEARCH_CONFIG_DIRECTORY, `.${fileName}.${crypto.randomUUID()}.tmp`);
  try {
    await fs.writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    await fs.rename(temporary, targetPath(fileName));
  } finally { await fs.unlink(temporary).catch(() => undefined); }
}

export async function deleteResearchConfig(fileName: string) {
  await fs.unlink(targetPath(fileName)).catch(error => {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  });
}

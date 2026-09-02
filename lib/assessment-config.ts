import { promises as fs } from "fs";
import path from "path";

export const ASSESSMENT_CONFIG_DIRECTORY = path.join(process.cwd(), "data", "review-configs");
export const CREDIT_ASSESSMENT_TYPE = "门店信用评分";

export type AssessmentItem = { id: string; description: string; breachAmount?: string; maxScore: number; supportsPhoto?: boolean };
export type AssessmentSubsection = { name: string; items: AssessmentItem[] };
export type AssessmentSection = { name: string; children: AssessmentSubsection[] };
export type ParsedAssessment = {
  sections: AssessmentSection[];
  normalizedText: string;
  sectionCount: number;
  subsectionCount: number;
  itemCount: number;
  totalScore: number;
  detailFormat: "AUDIT" | "CREDIT";
};

export class AssessmentConfigError extends Error {}

export function normalizeAssessmentFileName(value: string) {
  const baseName = value.trim().replace(/\.json$/i, "");
  if (!/^[A-Za-z0-9_]{1,20}$/.test(baseName)) {
    throw new AssessmentConfigError("配置文件名称只能包含英文字母、数字和下划线，且不能超过20个字符");
  }
  return `${baseName}.json`;
}

export function parseAssessmentDetails(value: string, assessmentType?: string): ParsedAssessment {
  const isCredit = assessmentType === CREDIT_ASSESSMENT_TYPE;
  const sectionMap = new Map<string, Map<string, AssessmentItem[]>>();
  const normalizedLines: string[] = [];
  let itemCount = 0;
  let totalTenths = 0;

  value.replace(/\r\n/g, "\n").split("\n").forEach((original, index) => {
    const line = original.trim();
    if (!line) return;
    const lineNumber = index + 1;
    const fields = line.split(/[｜|]/).map(field => field.trim());
    if ((isCredit ? fields.length !== 5 : fields.length !== 4 && fields.length !== 5) || fields.some(field => !field)) {
      throw new AssessmentConfigError(`第${lineNumber}行考核明细格式错误，应为：${isCredit ? "类目｜违约项目｜违约金额｜分值｜拍照" : "总项｜子项｜检查明细项｜分值｜拍照"}`);
    }
    const sectionName = fields[0];
    const subsectionName = isCredit ? "违约项目" : fields[1];
    const description = isCredit ? fields[1] : fields[2];
    const breachAmount = isCredit ? fields[2] : undefined;
    const scoreText = fields[3];
    const photoText = fields[4] || "不支持拍照";
    if (!/^\d+(?:\.\d)?$/.test(scoreText) || Number(scoreText) <= 0) {
      throw new AssessmentConfigError(`第${lineNumber}行明细项分值必须为大于0的数字，且最多1位小数`);
    }
    const scoreTenths = Math.round(Number(scoreText) * 10);
    if (!Number.isSafeInteger(scoreTenths)) throw new AssessmentConfigError(`第${lineNumber}行明细项分值无效`);
    if (photoText !== "支持拍照" && photoText !== "不支持拍照") {
      throw new AssessmentConfigError(`第${lineNumber}行拍照设置仅支持填写“支持拍照”或“不支持拍照”`);
    }
    let subsections = sectionMap.get(sectionName);
    if (!subsections) { subsections = new Map(); sectionMap.set(sectionName, subsections); }
    let items = subsections.get(subsectionName);
    if (!items) { items = []; subsections.set(subsectionName, items); }
    itemCount += 1;
    totalTenths += scoreTenths;
    items.push({ id: `item_${itemCount}`, description, ...(breachAmount ? { breachAmount } : {}), maxScore: scoreTenths / 10, supportsPhoto: photoText === "支持拍照" });
    normalizedLines.push((isCredit ? [sectionName, description, breachAmount, scoreTenths / 10, photoText] : [sectionName, subsectionName, description, scoreTenths / 10, photoText]).join("｜"));
  });
  if (!itemCount) throw new AssessmentConfigError("请输入考核明细项");
  const sections = Array.from(sectionMap, ([name, subsectionMap]) => ({
    name,
    children: Array.from(subsectionMap, ([subsectionName, items]) => ({ name: subsectionName, items })),
  }));
  return {
    sections,
    normalizedText: normalizedLines.join("\n"),
    sectionCount: sections.length,
    subsectionCount: sections.reduce((sum, section) => sum + section.children.length, 0),
    itemCount,
    totalScore: totalTenths / 10,
    detailFormat: isCredit ? "CREDIT" : "AUDIT",
  };
}

function filePath(fileName: string) {
  if (path.basename(fileName) !== fileName || !/^[A-Za-z0-9_]{1,20}\.json$/.test(fileName)) {
    throw new AssessmentConfigError("配置文件名称不合法");
  }
  return path.join(ASSESSMENT_CONFIG_DIRECTORY, fileName);
}

export async function assessmentFileExists(fileName: string) {
  try { await fs.access(filePath(fileName)); return true; } catch { return false; }
}

export async function readAssessmentConfig(fileName: string) {
  try {
    return JSON.parse(await fs.readFile(filePath(fileName), "utf8")) as Record<string, unknown>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new AssessmentConfigError("未找到对应考核明细配置文件，请联系系统管理员。");
    if (error instanceof SyntaxError) throw new AssessmentConfigError("考核明细配置文件格式异常，请联系系统管理员。");
    throw error;
  }
}

export async function createAssessmentConfig(fileName: string, config: unknown) {
  await fs.mkdir(ASSESSMENT_CONFIG_DIRECTORY, { recursive: true });
  try {
    await fs.writeFile(filePath(fileName), `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new AssessmentConfigError("考核明细配置文件名称已存在，请重新输入");
    throw error;
  }
}

export async function writeAssessmentConfig(fileName: string, config: unknown) {
  const target = filePath(fileName);
  await fs.mkdir(ASSESSMENT_CONFIG_DIRECTORY, { recursive: true });
  const temporary = path.join(ASSESSMENT_CONFIG_DIRECTORY, `.${fileName}.${crypto.randomUUID()}.tmp`);
  try {
    await fs.writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    await fs.rename(temporary, target);
  } finally {
    await fs.unlink(temporary).catch(() => undefined);
  }
}

export async function deleteAssessmentConfig(fileName: string) {
  await fs.unlink(filePath(fileName)).catch(error => {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  });
}

import { promises as fs } from "fs";
import path from "path";

export const TASK_CONFIG_DIRECTORY = path.join(process.cwd(), "data", "task-configs");

export type SubmitItem = {
  name: string;
  component: "attachment" | "input" | "select";
  dataType: "photo" | "video" | "document" | "amount" | "quantity" | null;
  options: string[];
  description: string;
  required: boolean;
  weight: number;
};

export class TaskConfigError extends Error {}

export function normalizeConfigFileName(value: string) {
  const baseName = value.trim().replace(/\.json$/i, "");
  if (!/^[A-Za-z0-9_]{1,30}$/.test(baseName)) {
    throw new TaskConfigError("配置文件名称只能包含英文字母、数字和下划线，且不能超过30个字符");
  }
  return `${baseName}.json`;
}

function parseComponent(value: string, lineNumber: number): Pick<SubmitItem, "component" | "dataType" | "options"> {
  if (value === "[附件]照片") return { component: "attachment", dataType: "photo", options: [] };
  if (value === "[附件]视频") return { component: "attachment", dataType: "video", options: [] };
  if (value === "[附件]文档") return { component: "attachment", dataType: "document", options: [] };
  if (value === "[输入框]金额") return { component: "input", dataType: "amount", options: [] };
  if (value === "[输入框]数量") return { component: "input", dataType: "quantity", options: [] };
  if (value.startsWith("[下拉选框]")) {
    const options = value.slice("[下拉选框]".length).split(",").map(item => item.trim()).filter(Boolean);
    if (!options.length) throw new TaskConfigError(`第${lineNumber}行下拉选框未配置选项`);
    return { component: "select", dataType: null, options };
  }
  throw new TaskConfigError(`第${lineNumber}行提交组件不受支持`);
}

export function parseSubmitContent(value: string) {
  const items: SubmitItem[] = [];
  const normalizedLines: string[] = [];
  value.replace(/\r\n/g, "\n").split("\n").forEach((originalLine, index) => {
    const lineNumber = index + 1;
    const line = originalLine.trim().replace(/,+\s*$/, "");
    if (!line) return;
    const fields = line.split(/[｜|]/).map(field => field.trim());
    if (fields.length !== 5 || fields.some(field => !field)) {
      throw new TaskConfigError(`第${lineNumber}行提交内容格式错误，应包含：任务项名称、提交组件、提示说明、必填属性、完成率权重。`);
    }
    const [name, componentText, description, requiredText, weightText] = fields;
    const component = parseComponent(componentText, lineNumber);
    if (requiredText !== "必填" && requiredText !== "选填") {
      throw new TaskConfigError(`第${lineNumber}行必填属性只能填写“必填”或“选填”`);
    }
    if (!/^\d+$/.test(weightText) || Number(weightText) <= 0) {
      throw new TaskConfigError(`第${lineNumber}行完成率权重必须为大于0的整数`);
    }
    items.push({ name, description, required: requiredText === "必填", weight: Number(weightText), ...component });
    normalizedLines.push([name, componentText, description, requiredText, weightText].join("|"));
  });
  return { items, normalizedContent: normalizedLines.join("\n") };
}

function filePath(fileName: string) {
  if (path.basename(fileName) !== fileName || !/^[A-Za-z0-9_]{1,30}\.json$/.test(fileName)) throw new TaskConfigError("配置文件名称不合法");
  return path.join(TASK_CONFIG_DIRECTORY, fileName);
}

export async function configFileExists(fileName: string) {
  try { await fs.access(filePath(fileName)); return true; } catch { return false; }
}

export async function readTaskConfig(fileName: string) {
  try {
    return JSON.parse(await fs.readFile(filePath(fileName), "utf8")) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new TaskConfigError("未找到对应任务配置文件，请联系系统管理员处理。");
    if (error instanceof SyntaxError) throw new TaskConfigError("任务配置文件格式异常，请联系系统管理员。");
    throw error;
  }
}

export async function writeTaskConfig(fileName: string, config: unknown) {
  const target = filePath(fileName);
  await fs.mkdir(TASK_CONFIG_DIRECTORY, { recursive: true });
  const temporary = path.join(TASK_CONFIG_DIRECTORY, `.${fileName}.${crypto.randomUUID()}.tmp`);
  try {
    await fs.writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    await fs.rename(temporary, target);
  } finally {
    await fs.unlink(temporary).catch(() => undefined);
  }
}

export async function createTaskConfig(fileName: string, config: unknown) {
  const target = filePath(fileName);
  await fs.mkdir(TASK_CONFIG_DIRECTORY, { recursive: true });
  try {
    await fs.writeFile(target, `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new TaskConfigError("配置文件名称已存在，请重新输入");
    throw error;
  }
}

export async function deleteTaskConfig(fileName: string) {
  await fs.unlink(filePath(fileName)).catch(error => {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  });
}

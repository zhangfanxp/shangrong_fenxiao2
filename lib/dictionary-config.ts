import { promises as fs } from "fs";
import path from "path";

export const DICTIONARY_DIRECTORY = path.join(process.cwd(), "Data_Dictionary");

export class DictionaryConfigError extends Error {}

export function normalizeDictionaryFileName(value: string) {
  const baseName = value.trim().replace(/\.json$/i, "");
  if (!/^[A-Za-z0-9_]{1,30}$/.test(baseName)) {
    throw new DictionaryConfigError("本地JSON文件名称只能包含英文字母、数字和下划线，且不能超过30个字符");
  }
  return `${baseName}.json`;
}

function filePath(fileName: string) {
  if (path.basename(fileName) !== fileName || !/^[A-Za-z0-9_]{1,30}\.json$/.test(fileName)) {
    throw new DictionaryConfigError("本地JSON文件名称不合法");
  }
  const target = path.resolve(DICTIONARY_DIRECTORY, fileName);
  if (path.dirname(target) !== path.resolve(DICTIONARY_DIRECTORY)) {
    throw new DictionaryConfigError("本地JSON文件名称不合法");
  }
  return target;
}

export async function dictionaryFileExists(fileName: string) {
  try { await fs.access(filePath(fileName)); return true; } catch { return false; }
}

export async function createDictionaryFile(fileName: string) {
  await fs.mkdir(DICTIONARY_DIRECTORY, { recursive: true });
  try {
    await fs.writeFile(filePath(fileName), `${JSON.stringify({ values: [] }, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new DictionaryConfigError("本地JSON文件已存在，请重新输入文件名称");
    throw error;
  }
}

export async function readDictionaryValues(fileName: string) {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath(fileName), "utf8")) as { values?: unknown };
    if (!Array.isArray(parsed.values) || parsed.values.some(value => typeof value !== "string")) throw new DictionaryConfigError("数据字典文件格式异常，请联系系统管理员");
    // 兼容管理员在枚举编辑框中使用英文竖线或中文全角竖线分隔。
    // 历史文件中也可能把多个值写在同一个数组元素内，这里统一展开。
    return (parsed.values as string[]).flatMap(value => value.split(/[|｜]/)).map(value => value.trim()).filter(Boolean);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new DictionaryConfigError("未找到对应的本地数据字典文件，请联系系统管理员");
    if (error instanceof DictionaryConfigError) throw error;
    if (error instanceof SyntaxError) throw new DictionaryConfigError("数据字典文件格式异常，请联系系统管理员");
    throw error;
  }
}

export async function writeDictionaryValues(fileName: string, values: string[]) {
  const target = filePath(fileName);
  await fs.mkdir(DICTIONARY_DIRECTORY, { recursive: true });
  const temporary = path.join(DICTIONARY_DIRECTORY, `.${fileName}.${crypto.randomUUID()}.tmp`);
  try {
    await fs.writeFile(temporary, `${JSON.stringify({ values }, null, 2)}\n`, "utf8");
    await fs.rename(temporary, target);
  } finally {
    await fs.unlink(temporary).catch(() => undefined);
  }
}

export async function renameDictionaryFile(oldFileName: string, nextFileName: string) {
  if (oldFileName === nextFileName) return;
  if (await dictionaryFileExists(nextFileName)) throw new DictionaryConfigError("本地JSON文件已存在，请重新输入文件名称");
  try {
    await fs.rename(filePath(oldFileName), filePath(nextFileName));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new DictionaryConfigError("未找到对应的本地数据字典文件，请联系系统管理员");
    throw new DictionaryConfigError("本地JSON文件修改失败，请稍后重试");
  }
}

export async function deleteDictionaryFile(fileName: string) {
  await fs.unlink(filePath(fileName)).catch(error => {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  });
}

export function parseDictionaryValues(input: string) {
  const values = input.split(/[|｜]/).map(value => value.trim()).filter(Boolean);
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new DictionaryConfigError(`存在重复的枚举值“${value}”，请修改后保存`);
    seen.add(value);
  }
  return values;
}

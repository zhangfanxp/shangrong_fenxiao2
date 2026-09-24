import { readFile, stat } from "node:fs/promises";
import path from "node:path";

export type DatabaseDictionaryField = {
  name: string;
  chineseName: string;
  type: string;
  meaning: string;
  primaryKey: boolean;
  indexes: string[];
};

export type DatabaseDictionaryTable = {
  name: string;
  chineseName: string;
  purpose: string;
  fields: DatabaseDictionaryField[];
};

const dictionaryPath = () => path.join(process.cwd(), "db_dict.md");

function parseTableRow(line: string) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return [];
  return trimmed.slice(1, -1).split(/(?<!\\)\|/).map(cell => cell.trim().replaceAll("\\|", "|").replaceAll("\\\\", "\\"));
}

function isDivider(cells: string[]) {
  return cells.length > 0 && cells.every(cell => /^:?-{3,}:?$/.test(cell));
}

export function parseDatabaseDictionary(markdown: string) {
  const tables: DatabaseDictionaryTable[] = [];
  let current: DatabaseDictionaryTable | null = null;

  for (const sourceLine of markdown.replaceAll("\r\n", "\n").split("\n")) {
    const line = sourceLine.trim();
    const heading = line.match(/^##\s+`?([^|`]+?)`?\s*\|\s*(.+)$/);
    if (heading) {
      current = { name: heading[1].trim(), chineseName: heading[2].trim(), purpose: "", fields: [] };
      tables.push(current);
      continue;
    }
    if (!current) continue;
    if (line.startsWith("> 作用：")) {
      current.purpose = line.slice("> 作用：".length).trim();
      continue;
    }
    if (!line.startsWith("|")) continue;
    const cells = parseTableRow(line);
    if (cells.length !== 6 || cells[0] === "字段英文名" || isDivider(cells)) continue;
    current.fields.push({
      name: cells[0],
      chineseName: cells[1],
      type: cells[2],
      meaning: cells[3],
      primaryKey: cells[4] === "是",
      indexes: cells[5] === "—" || !cells[5] ? [] : cells[5].split("；").map(item => item.trim()).filter(Boolean),
    });
  }

  const invalid = tables.find(table => !table.name || !table.chineseName || !table.purpose || !table.fields.length);
  if (!tables.length) throw new Error("db_dict.md中没有可识别的数据表定义");
  if (invalid) throw new Error(`db_dict.md中的${invalid.name || "未知表"}缺少中文名、作用或字段定义`);
  const duplicate = tables.find((table, index) => tables.findIndex(item => item.name === table.name) !== index);
  if (duplicate) throw new Error(`db_dict.md中存在重复的数据表：${duplicate.name}`);
  return tables;
}

export async function readDatabaseDictionary() {
  const filePath = dictionaryPath();
  const [markdown, file] = await Promise.all([readFile(filePath, "utf8"), stat(filePath)]);
  const tables = parseDatabaseDictionary(markdown);
  return {
    source: "db_dict.md",
    updatedAt: file.mtime.toISOString(),
    tableCount: tables.length,
    fieldCount: tables.reduce((sum, table) => sum + table.fields.length, 0),
    tables,
  };
}

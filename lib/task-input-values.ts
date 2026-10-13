export type TaskInputDataType = "amount" | "quantity" | "score" | "text" | null;

export type TaskInputDefinition = {
  name: string;
  dataType: TaskInputDataType | "photo" | "video" | "document";
  maxValue?: number | null;
};

export function taskInputValueError(item: TaskInputDefinition, value: unknown) {
  if (value === undefined || value === null || String(value).trim() === "" || item.dataType === "text") return null;
  const text = String(value).trim();
  if (item.dataType === "score") return /^\d+(?:\.\d)?$/.test(text) && Number(text) <= 5 ? null : `“${item.name}”请输入0至5之间的整数或一位小数`;
  if (!/^\d+(?:\.\d+)?$/.test(text) || Number(text) < 0) return `“${item.name}”请输入大于等于0的有效数字`;
  if (item.dataType === "amount" && !/^\d+(?:\.\d{1,2})?$/.test(text)) return `“${item.name}”最多保留2位小数`;
  if (item.dataType === "quantity" && !/^\d+$/.test(text)) return `“${item.name}”请输入非负整数`;
  if (item.dataType === "quantity" && item.maxValue !== undefined && item.maxValue !== null && Number(text) > item.maxValue) return `“${item.name}”不能超过${item.maxValue}`;
  return null;
}

import { RecordStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { DictionaryConfigError, readDictionaryValues } from "@/lib/dictionary-config";

export type BusinessDictionaryCode =
  | "BRAND"
  | "CONTRACT_STATUS"
  | "COOPERATION_TYPE"
  | "REBATE_TYPE"
  | "STORE_OPERATION_STATUS"
  | "STORE_AREA"
  | "LOCATION_TYPE"
  | "POSITION_LEVEL"
  | "PERSONNEL_STATUS"
  | "SOCIAL_SECURITY_STATUS";

export type DictionaryOption = { label: string; value: string };

const aliases: Record<BusinessDictionaryCode, string[]> = {
  BRAND: ["BRAND"],
  CONTRACT_STATUS: ["CONTRACT_STATUS"],
  COOPERATION_TYPE: ["COOPERATION_TYPE"],
  REBATE_TYPE: ["REBATE_TYPE"],
  STORE_OPERATION_STATUS: ["STORE_OPERATION_STATUS"],
  STORE_AREA: ["STORE_AREA"],
  LOCATION_TYPE: ["LOCATION_TYPE"],
  POSITION_LEVEL: ["POSITION_LEVEL"],
  PERSONNEL_STATUS: ["PERSONNEL_STATUS", "PERSONNELSTATUS"],
  SOCIAL_SECURITY_STATUS: ["SOCIAL_SECURITY_STATUS"],
};

const protectedValues: Partial<Record<BusinessDictionaryCode, Record<string, string>>> = {
  CONTRACT_STATUS: { "待生效": "PENDING", "正常": "ACTIVE", "履约中": "ACTIVE", "待续约": "EXPIRING", "即将到期": "EXPIRING", "已解约": "TERMINATED", "已到期": "EXPIRED" },
  COOPERATION_TYPE: { "直营": "DIRECT", "直营店": "DIRECT", "加盟": "FRANCHISE", "加盟店": "FRANCHISE" },
  STORE_OPERATION_STATUS: { "筹备中": "PREPARING", "试营业": "TRIAL", "正式营业": "OPENING", "营业中": "OPENING", "解约中": "TERMINATING", "暂停营业": "SUSPENDED", "已停业": "CLOSED", "已关闭": "CLOSED" },
  PERSONNEL_STATUS: { "在职": "ACTIVE", "离职": "RESIGNED", "已离职": "RESIGNED" },
  SOCIAL_SECURITY_STATUS: { "是": "INSURED", "已参保": "INSURED", "已签补充协议": "AGREEMENT" },
};

export async function getBusinessDictionaryOptions(code: BusinessDictionaryCode): Promise<DictionaryOption[]> {
  const dictionary = await db.dataDictionary.findFirst({
    where: { code: { in: aliases[code] }, status: RecordStatus.ENABLED },
    select: { fileName: true },
  });
  if (!dictionary) throw new DictionaryConfigError(`未找到已启用的数据字典：${code}`);
  const values = await readDictionaryValues(dictionary.fileName);
  const mapping = protectedValues[code];
  if (!mapping) return values.map(label => ({ label, value: label }));
  const options = values.flatMap(label => mapping[label] ? [{ label, value: mapping[label] }] : []);
  if (!options.length && values.length) throw new DictionaryConfigError(`数据字典 ${code} 中没有可识别的枚举值`);
  return options;
}

export async function getBusinessDictionaries(codes: BusinessDictionaryCode[]) {
  return Object.fromEntries(await Promise.all(codes.map(async code => [code, await getBusinessDictionaryOptions(code)]))) as Partial<Record<BusinessDictionaryCode, DictionaryOption[]>>;
}

export async function businessDictionaryContains(code: BusinessDictionaryCode, value: string | null | undefined) {
  if (!value) return true;
  const options = await getBusinessDictionaryOptions(code);
  return options.some(option => option.value === value || option.label === value);
}

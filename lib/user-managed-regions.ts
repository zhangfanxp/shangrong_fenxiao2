import { Prisma } from "@prisma/client";
import { getBusinessDictionaryOptions } from "@/lib/business-dictionaries";

/** 将提交值规范化为 STORE_AREA 字典中的枚举值，并拒绝失效区域。 */
export async function normalizeManagedRegions(values: readonly string[] | null | undefined) {
  const requested = [...new Set((values || []).map(value => value.trim()).filter(Boolean))];
  if (!requested.length) return [];

  const options = await getBusinessDictionaryOptions("STORE_AREA");
  const normalized: string[] = [];
  for (const value of requested) {
    const option = options.find(item => item.value === value || item.label === value);
    if (!option) throw new Error("区域管理权限包含无效区域，请重新选择");
    if (!normalized.includes(option.value)) normalized.push(option.value);
  }
  return normalized;
}

export async function replaceManagedRegions(database: Prisma.TransactionClient, userId: string, regions: readonly string[]) {
  await database.userManagedRegion.deleteMany({ where: { userId } });
  if (regions.length) await database.userManagedRegion.createMany({ data: regions.map(region => ({ userId, region })) });
}

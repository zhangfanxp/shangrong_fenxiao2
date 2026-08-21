import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { StoreInput } from "@/lib/store-validation";

export const storeContractSelect = {
  id: true, recordNo: true, status: true, brandId: true, storeName: true, cooperationType: true,
  province: true, city: true, district: true, address: true, trialOpenDate: true,
  ownerName: true, ownerPhone: true, ownerIdNumber: true,
} satisfies Prisma.ContractSelect;

const dateOnly = (value: Date | null) => value?.toISOString().slice(0, 10) || null;

export async function validateStoreContract(contractId: string | null, data: StoreInput, storeId?: string) {
  if (!contractId) return { contract: null };
  const contract = await db.contract.findUnique({
    where: { id: contractId },
    select: { ...storeContractSelect, store: { select: { id: true } } },
  });
  if (!contract) return { message: "所选合同不存在或已删除" };
  if (contract.store && contract.store.id !== storeId) return { message: "该合同已关联其他门店，请重新选择" };

  const matchesContract = data.brandId === contract.brandId
    && data.name === contract.storeName
    && data.cooperationType === contract.cooperationType
    && data.province === contract.province
    && data.city === contract.city
    && data.district === contract.district
    && data.address === contract.address
    && dateOnly(data.trialOpenDate) === dateOnly(contract.trialOpenDate)
    && data.ownerName === contract.ownerName
    && data.ownerPhone === contract.ownerPhone
    && data.ownerIdNumber === contract.ownerIdNumber;
  if (!matchesContract) return { message: "关联合同引用的字段不可修改，请重新选择合同后保存" };
  return { contract };
}

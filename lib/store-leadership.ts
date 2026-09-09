import { Prisma, RecordStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { jsonIdArray } from "@/lib/user-store-scope";

const MANAGER_ROLE_NAME = "店长";
const CHEF_ROLE_NAME = "厨师长";

type LeadershipDatabase = Prisma.TransactionClient;

type StoreLeadership = {
  managerUserId: string | null;
  managerName: string | null;
  chefUserId: string | null;
  chefName: string | null;
};

/**
 * 将用户角色及“运营H5店铺权限”作为店长、厨师长的唯一数据源。
 * 同一门店同一角色存在多条有效用户时，按用户创建时间优先取第一条，保证结果稳定。
 */
export async function synchronizeStoreLeadership(storeIds?: readonly string[], database: LeadershipDatabase = db) {
  const requestedIds = storeIds ? [...new Set(storeIds.filter(Boolean))] : undefined;
  if (requestedIds && requestedIds.length === 0) return new Map<string, StoreLeadership>();

  const stores = await database.store.findMany({
    where: requestedIds ? { id: { in: requestedIds } } : undefined,
    select: { id: true, managerUserId: true, managerName: true, chefUserId: true, chefName: true },
  });
  if (!stores.length) return new Map<string, StoreLeadership>();

  const targetIds = new Set(stores.map(store => store.id));
  const leadership = new Map<string, StoreLeadership>(stores.map(store => [store.id, {
    managerUserId: null,
    managerName: null,
    chefUserId: null,
    chefName: null,
  }]));
  const users = await database.user.findMany({
    where: {
      status: RecordStatus.ENABLED,
      role: { status: RecordStatus.ENABLED, name: { in: [MANAGER_ROLE_NAME, CHEF_ROLE_NAME] } },
    },
    select: { id: true, realName: true, leadH5StoreIds: true, role: { select: { name: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  for (const user of users) {
    for (const storeId of jsonIdArray(user.leadH5StoreIds)) {
      if (!targetIds.has(storeId)) continue;
      const current = leadership.get(storeId)!;
      if (user.role.name === MANAGER_ROLE_NAME && !current.managerUserId) {
        current.managerUserId = user.id;
        current.managerName = user.realName;
      }
      if (user.role.name === CHEF_ROLE_NAME && !current.chefUserId) {
        current.chefUserId = user.id;
        current.chefName = user.realName;
      }
    }
  }

  for (const store of stores) {
    const current = leadership.get(store.id)!;
    if (store.managerUserId === current.managerUserId && store.managerName === current.managerName && store.chefUserId === current.chefUserId && store.chefName === current.chefName) continue;
    await database.store.update({
      where: { id: store.id },
      data: current,
    });
  }

  return leadership;
}

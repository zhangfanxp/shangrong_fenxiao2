import { Prisma, RecordStatus } from "@prisma/client";
import { db } from "@/lib/db";

type RegionManagerDatabase = Prisma.TransactionClient;

type StoreRegionManager = {
  supervisorUserId: string | null;
  supervisorName: string | null;
};

function normalizeRegion(region: string | null | undefined) {
  return region?.trim() || null;
}

function activeRegionManager(user: {
  id: string;
  realName: string;
  isRegionManager: boolean;
  status: RecordStatus;
  role: { status: RecordStatus };
} | null | undefined) {
  return user?.isRegionManager && user.status === RecordStatus.ENABLED && user.role.status === RecordStatus.ENABLED
    ? user
    : null;
}

/** 根据“区域管理权限”查找当前营运大区唯一有效的区域负责人。 */
export async function resolveStoreRegionManager(region: string | null | undefined, database: RegionManagerDatabase = db) {
  const normalizedRegion = normalizeRegion(region);
  if (!normalizedRegion) return null;

  const assignment = await database.userManagedRegion.findUnique({
    where: { region: normalizedRegion },
    select: {
      user: {
        select: {
          id: true,
          realName: true,
          isRegionManager: true,
          status: true,
          role: { select: { status: true } },
        },
      },
    },
  });
  return activeRegionManager(assignment?.user);
}

/**
 * 将门店“区域负责人”同步为该营运大区在用户列表中配置的负责人。
 * 用户的区域权限、负责人身份、账号或角色状态变化后调用本函数，可同步更新或清空门店负责人。
 */
export async function synchronizeStoreRegionManagers(regions?: readonly string[], database: RegionManagerDatabase = db) {
  const requestedRegions = regions
    ? [...new Set(regions.map(normalizeRegion).filter((region): region is string => !!region))]
    : undefined;
  if (requestedRegions && requestedRegions.length === 0) return new Map<string, StoreRegionManager>();

  const stores = await database.store.findMany({
    where: requestedRegions ? { region: { in: requestedRegions } } : undefined,
    select: { id: true, region: true, supervisorUserId: true, supervisorName: true },
  });
  if (!stores.length) return new Map<string, StoreRegionManager>();

  const storeRegions = [...new Set(stores.map(store => normalizeRegion(store.region)).filter((region): region is string => !!region))];
  const assignments = storeRegions.length
    ? await database.userManagedRegion.findMany({
        where: { region: { in: storeRegions } },
        select: {
          region: true,
          user: {
            select: {
              id: true,
              realName: true,
              isRegionManager: true,
              status: true,
              role: { select: { status: true } },
            },
          },
        },
      })
    : [];
  const managersByRegion = new Map(assignments.flatMap(assignment => {
    const manager = activeRegionManager(assignment.user);
    return manager ? [[assignment.region, manager] as const] : [];
  }));
  const synchronized = new Map<string, StoreRegionManager>();

  for (const store of stores) {
    const manager = managersByRegion.get(normalizeRegion(store.region) || "");
    const next = {
      supervisorUserId: manager?.id || null,
      supervisorName: manager?.realName || null,
    };
    synchronized.set(store.id, next);
    if (store.supervisorUserId === next.supervisorUserId && store.supervisorName === next.supervisorName) continue;
    await database.store.update({ where: { id: store.id }, data: next });
  }

  return synchronized;
}

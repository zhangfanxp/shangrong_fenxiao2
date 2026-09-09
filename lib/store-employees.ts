export type StoreLeadershipIdentity = {
  managerUserId: string | null;
  managerName: string | null;
  chefUserId: string | null;
  chefName: string | null;
};

export type PersonnelLeadershipIdentity = {
  platformUserId: string | null;
  platformUser?: { role: { name: string } } | null;
  name: string;
};

export function isStoreLeader(personnel: PersonnelLeadershipIdentity, store: StoreLeadershipIdentity) {
  if (personnel.platformUser && ["店长", "厨师长"].includes(personnel.platformUser.role.name)) return true;
  if (personnel.platformUserId && (personnel.platformUserId === store.managerUserId || personnel.platformUserId === store.chefUserId)) return true;
  if (!personnel.platformUserId && (personnel.name === store.managerName || personnel.name === store.chefName)) return true;
  return false;
}

export const storeEmployeeSelect = {
  id: true,
  recordNo: true,
  name: true,
  phone: true,
  positionLevel: true,
  laborCost: true,
  storeId: true,
  platformUserId: true,
  platformUser: { select: { role: { select: { name: true } } } },
} as const;

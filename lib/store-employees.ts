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
  positionLevel?: string | null;
};

export function isStoreLeader(personnel: PersonnelLeadershipIdentity, store: StoreLeadershipIdentity) {
  if (personnel.positionLevel && ["店长", "主管", "厨师长"].includes(personnel.positionLevel)) return true;
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
  organization: true,
  laborCost: true,
  storeId: true,
  platformUserId: true,
  platformUser: { select: { role: { select: { name: true } } } },
} as const;

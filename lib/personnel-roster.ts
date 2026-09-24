import { PersonnelStatus, Prisma } from "@prisma/client";
import type { Session } from "@/lib/auth";
import { db } from "@/lib/db";

export const birthdayPeriods = ["THIS_WEEK", "THIS_MONTH", "THIS_QUARTER", "LAST_WEEK", "LAST_MONTH", "LAST_QUARTER"] as const;
export type BirthdayPeriod = (typeof birthdayPeriods)[number];

export type PersonnelRosterAction = "query" | "export" | "sensitive" | "export-sensitive" | "headquarters";

export type PersonnelRosterFilters = {
  nameKeyword?: string;
  mobileKeyword?: string;
  idCardKeyword?: string;
  belonging?: "HEADQUARTERS" | "BRAND";
  brandCode?: string;
  storeId?: string;
  departmentCode?: string;
  positionLevel?: string;
  personnelStatus?: PersonnelStatus;
  birthdayPeriod?: BirthdayPeriod;
  joinStartDate?: string;
  joinEndDate?: string;
  leaveStartDate?: string;
  leaveEndDate?: string;
  contractExpireStartDate?: string;
  contractExpireEndDate?: string;
};

export function canPersonnelRoster(session: Session, action: PersonnelRosterAction) {
  if (session.permissions.includes("*")) return true;
  if (session.permissions.includes(`statistics:roster:${action}`)) return true;
  if (action === "query") return session.permissions.includes("statistics:roster:view") || session.permissions.includes("personnel:query") || session.permissions.includes("staff:view");
  if (action === "export") return session.permissions.includes("personnel:export");
  if (action === "sensitive") return session.permissions.includes("personnel:sensitive");
  if (action === "export-sensitive") return session.permissions.includes("personnel:sensitive") && session.permissions.includes("personnel:export");
  return session.permissions.includes("data:all");
}

function read(search: URLSearchParams, key: string, maximum = 100) {
  return search.get(key)?.trim().slice(0, maximum) || undefined;
}

export function readPersonnelRosterFilters(search: URLSearchParams): PersonnelRosterFilters {
  const belonging = read(search, "belonging", 20);
  const status = read(search, "personnelStatus", 30);
  const birthdayPeriod = read(search, "birthdayPeriod", 30);
  return {
    nameKeyword: read(search, "nameKeyword", 50),
    mobileKeyword: read(search, "mobileKeyword", 30),
    idCardKeyword: read(search, "idCardKeyword", 30)?.toUpperCase(),
    belonging: belonging === "HEADQUARTERS" || belonging === "BRAND" ? belonging : undefined,
    brandCode: read(search, "brandCode", 100),
    storeId: read(search, "storeId", 191),
    departmentCode: read(search, "departmentCode", 100),
    positionLevel: read(search, "positionLevel", 100),
    personnelStatus: Object.values(PersonnelStatus).includes(status as PersonnelStatus) ? status as PersonnelStatus : undefined,
    birthdayPeriod: birthdayPeriods.includes(birthdayPeriod as BirthdayPeriod) ? birthdayPeriod as BirthdayPeriod : undefined,
    joinStartDate: read(search, "joinStartDate", 10),
    joinEndDate: read(search, "joinEndDate", 10),
    leaveStartDate: read(search, "leaveStartDate", 10),
    leaveEndDate: read(search, "leaveEndDate", 10),
    contractExpireStartDate: read(search, "contractExpireStartDate", 10),
    contractExpireEndDate: read(search, "contractExpireEndDate", 10),
  };
}

function isValidDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validatePersonnelRosterFilters(filters: PersonnelRosterFilters, rawSearch?: URLSearchParams) {
  if (rawSearch?.get("belonging") && !filters.belonging) return "人员归属不正确";
  if (rawSearch?.get("personnelStatus") && !filters.personnelStatus) return "人员状态不正确";
  if (rawSearch?.get("birthdayPeriod") && !filters.birthdayPeriod) return "生日周期不正确";
  const ranges: Array<[string, string | undefined, string | undefined]> = [
    ["入职", filters.joinStartDate, filters.joinEndDate],
    ["离职", filters.leaveStartDate, filters.leaveEndDate],
    ["合同到期", filters.contractExpireStartDate, filters.contractExpireEndDate],
  ];
  for (const [label, start, end] of ranges) {
    if ((start && !isValidDateKey(start)) || (end && !isValidDateKey(end))) return `${label}日期格式不正确`;
    if (start && end && start > end) return `${label}开始日期不能晚于${label}截止日期`;
  }
  return null;
}

function shanghaiDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const value = (type: string) => parts.find(part => part.type === type)?.value || "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function utcDate(dateKey: string) {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

function plusUtcDays(value: Date, days: number) {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function monthDay(value: Date) {
  return `${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
}

export function birthdayMonthDays(period: BirthdayPeriod, now = new Date()) {
  const current = utcDate(shanghaiDateKey(now));
  if (period === "THIS_WEEK" || period === "LAST_WEEK") {
    const day = current.getUTCDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const start = plusUtcDays(current, mondayOffset + (period === "LAST_WEEK" ? -7 : 0));
    return Array.from({ length: 7 }, (_, index) => monthDay(plusUtcDays(start, index)));
  }
  const currentMonth = current.getUTCMonth() + 1;
  if (period === "THIS_MONTH") return [currentMonth];
  if (period === "LAST_MONTH") return [currentMonth === 1 ? 12 : currentMonth - 1];
  const currentQuarterStart = Math.floor((currentMonth - 1) / 3) * 3 + 1;
  const quarterStart = period === "LAST_QUARTER" ? (currentQuarterStart === 1 ? 10 : currentQuarterStart - 3) : currentQuarterStart;
  return [quarterStart, quarterStart + 1, quarterStart + 2];
}

function birthdayWhere(period: BirthdayPeriod): Prisma.PersonnelWhereInput {
  const values = birthdayMonthDays(period);
  if (period === "THIS_WEEK" || period === "LAST_WEEK") return { birthday: { in: values.map(String) } };
  return { OR: values.map(month => ({ birthday: { startsWith: `${String(month).padStart(2, "0")}-` } })) };
}

function jsonIdArrayOrNull(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item)) : null;
}

export type PersonnelRosterScope = {
  brandIds: string[] | null;
  storeIds: string[] | null;
  canViewHeadquarters: boolean;
};

export async function personnelRosterScope(session: Session): Promise<PersonnelRosterScope> {
  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: {
      leadH5BrandIds: true,
      leadH5StoreIds: true,
      personnelProfile: { select: { status: true, deletedAt: true, storeId: true, store: { select: { brandId: true } } } },
    },
  });
  if (!user) return { brandIds: [], storeIds: [], canViewHeadquarters: false };
  const tokenBrandIds = session.permissions.filter(value => value.startsWith("data:brand:")).map(value => value.slice(11)).filter(Boolean);
  const tokenStoreIds = session.permissions.filter(value => value.startsWith("data:store:")).map(value => value.slice(11)).filter(Boolean);
  const unrestricted = session.permissions.includes("*") || session.permissions.includes("data:all");
  const configuredBrandIds = jsonIdArrayOrNull(user.leadH5BrandIds) ?? (tokenBrandIds.length ? tokenBrandIds : null);
  const configuredStoreIds = jsonIdArrayOrNull(user.leadH5StoreIds) ?? (tokenStoreIds.length ? tokenStoreIds : null);
  const activeProfileStore = user.personnelProfile?.status === "ACTIVE" && !user.personnelProfile.deletedAt ? user.personnelProfile.store : null;
  const profileOnlyScope = !unrestricted && configuredBrandIds === null && configuredStoreIds === null && user.personnelProfile?.storeId && activeProfileStore;
  return {
    brandIds: unrestricted ? null : profileOnlyScope ? [activeProfileStore.brandId] : configuredBrandIds,
    storeIds: unrestricted ? null : profileOnlyScope ? [user.personnelProfile!.storeId!] : configuredStoreIds,
    canViewHeadquarters: canPersonnelRoster(session, "headquarters"),
  };
}

export async function personnelRosterDataScope(session: Session): Promise<Prisma.PersonnelWhereInput> {
  const scope = await personnelRosterScope(session);
  const branded: Prisma.PersonnelWhereInput = { organization: { not: "总部" } };
  if (scope.brandIds !== null) {
    const brands = await db.brand.findMany({ where: { id: { in: scope.brandIds } }, select: { id: true, name: true } });
    branded.AND = [{ OR: [{ store: { is: { brandId: { in: scope.brandIds } } } }, { organization: { in: brands.map(brand => brand.name) } }] }];
  }
  if (scope.storeIds !== null) (branded.AND as Prisma.PersonnelWhereInput[] | undefined)?.push({ storeId: { in: scope.storeIds } });
  if (scope.brandIds === null && scope.storeIds !== null) branded.AND = [{ storeId: { in: scope.storeIds } }];
  const allowed: Prisma.PersonnelWhereInput[] = [branded];
  if (scope.canViewHeadquarters) allowed.unshift({ organization: "总部" });
  return { deletedAt: null, OR: allowed };
}

export async function personnelRosterStoreScope(session: Session): Promise<Prisma.StoreWhereInput> {
  const scope = await personnelRosterScope(session);
  const where: Prisma.StoreWhereInput = {};
  if (scope.brandIds !== null) where.brandId = { in: scope.brandIds };
  if (scope.storeIds !== null) where.id = { in: scope.storeIds };
  return where;
}

function dbDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

export async function personnelRosterFilterWhere(filters: PersonnelRosterFilters): Promise<Prisma.PersonnelWhereInput> {
  const AND: Prisma.PersonnelWhereInput[] = [];
  if (filters.nameKeyword) AND.push({ name: { contains: filters.nameKeyword } });
  if (filters.mobileKeyword) AND.push({ phone: { contains: filters.mobileKeyword } });
  if (filters.idCardKeyword) AND.push({ idNumber: { contains: filters.idCardKeyword } });
  if (filters.belonging === "HEADQUARTERS") AND.push({ organization: "总部" });
  if (filters.belonging === "BRAND") AND.push({ organization: { not: "总部" } });
  if (filters.brandCode) {
    const brand = await db.brand.findFirst({ where: { OR: [{ id: filters.brandCode }, { code: filters.brandCode }, { name: filters.brandCode }] }, select: { id: true, name: true } });
    AND.push(brand ? { OR: [{ organization: brand.name }, { store: { is: { brandId: brand.id } } }] } : { organization: filters.brandCode });
  }
  if (filters.storeId) AND.push({ storeId: filters.storeId });
  if (filters.departmentCode) AND.push({ department: filters.departmentCode });
  if (filters.positionLevel) AND.push({ positionLevel: filters.positionLevel });
  if (filters.personnelStatus) AND.push({ status: filters.personnelStatus });
  if (filters.birthdayPeriod) AND.push(birthdayWhere(filters.birthdayPeriod));
  if (filters.joinStartDate || filters.joinEndDate) AND.push({ hireDate: { ...(filters.joinStartDate ? { gte: dbDate(filters.joinStartDate) } : {}), ...(filters.joinEndDate ? { lte: dbDate(filters.joinEndDate) } : {}) } });
  if (filters.leaveStartDate || filters.leaveEndDate) AND.push({ resignationDate: { ...(filters.leaveStartDate ? { gte: dbDate(filters.leaveStartDate) } : {}), ...(filters.leaveEndDate ? { lte: dbDate(filters.leaveEndDate) } : {}) } });
  if (filters.contractExpireStartDate || filters.contractExpireEndDate) AND.push({ contractYears: { not: null }, contractExpiryDate: { ...(filters.contractExpireStartDate ? { gte: dbDate(filters.contractExpireStartDate) } : {}), ...(filters.contractExpireEndDate ? { lte: dbDate(filters.contractExpireEndDate) } : {}) } });
  return AND.length ? { AND } : {};
}

export const personnelRosterSelect = {
  id: true,
  name: true,
  phone: true,
  idNumber: true,
  birthday: true,
  status: true,
  hireDate: true,
  positionLevel: true,
  organization: true,
  department: true,
  storeId: true,
  store: { select: { name: true, brand: { select: { code: true, name: true } } } },
  resignationDate: true,
  contractSignDate: true,
  contractYears: true,
  contractExpiryDate: true,
  homeAddress: true,
  currentAddress: true,
  _count: { select: { itemRequisitions: true } },
} satisfies Prisma.PersonnelSelect;

export type SelectedPersonnelRoster = Prisma.PersonnelGetPayload<{ select: typeof personnelRosterSelect }>;

function dateText(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : null;
}

export function maskMobile(value: string) {
  return value.length >= 7 ? `${value.slice(0, 3)}****${value.slice(-4)}` : "***";
}

export function maskIdCard(value: string) {
  return value.length >= 8 ? `${value.slice(0, 4)}${"*".repeat(Math.max(4, value.length - 8))}${value.slice(-4)}` : "***";
}

export function serializePersonnelRoster(row: SelectedPersonnelRoster, exposeSensitive: boolean) {
  const headquarters = row.organization === "总部";
  const indefinite = row.contractYears === null;
  return {
    personnelId: row.id,
    name: row.name,
    mobile: exposeSensitive ? row.phone : maskMobile(row.phone),
    idCard: exposeSensitive ? row.idNumber : maskIdCard(row.idNumber),
    birthday: row.birthday ? (exposeSensitive ? row.birthday : "**-**") : null,
    personnelStatus: row.status,
    joinDate: dateText(row.hireDate),
    positionLevel: row.positionLevel,
    belongingType: headquarters ? "HEADQUARTERS" as const : "BRAND" as const,
    brandName: headquarters ? null : row.store?.brand.name || row.organization,
    departmentName: headquarters ? row.department : null,
    storeName: headquarters ? null : row.store?.name || null,
    leaveDate: dateText(row.resignationDate),
    contractSignedDate: dateText(row.contractSignDate),
    contractTerm: indefinite ? "无固定期限" : `${row.contractYears}年`,
    contractExpireDate: indefinite ? null : dateText(row.contractExpiryDate),
    contractIndefinite: indefinite,
    registeredAddress: exposeSensitive ? row.homeAddress || null : (row.homeAddress ? "***" : null),
    currentAddress: exposeSensitive ? row.currentAddress || null : (row.currentAddress ? "***" : null),
    requisitionCount: row._count.itemRequisitions,
  };
}

export type PersonnelRosterRow = ReturnType<typeof serializePersonnelRoster>;

import { PersonnelStatus, Prisma, RecordStatus } from "@prisma/client";
import { db } from "@/lib/db";
import type { Session } from "@/lib/auth";
import type { PersonnelInput } from "@/lib/personnel-validation";
import { getBusinessDictionaryOptions } from "@/lib/business-dictionaries";
import { getConfiguredWorkdayHours } from "@/lib/brand-day-hour-config";
import { writeOperationLog, type OperationLogResult } from "@/lib/operation-log";

export const personnelInclude = {
  store: { select: { id: true, name: true, operationStatus: true, brand: { select: { id: true, name: true } } } },
  platformUser: { select: { id: true, username: true, realName: true, status: true, role: { select: { name: true } } } },
  createdBy: { select: { realName: true } },
  salaryHistory: { orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }], select: { id: true, oldSalary: true, newSalary: true, effectiveDate: true, reason: true, operatorName: true, createdAt: true } },
  positionHistory: { orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }], select: { id: true, oldOrganization: true, newOrganization: true, oldStoreName: true, newStoreName: true, oldPositionLevel: true, newPositionLevel: true, effectiveDate: true, reason: true, operatorName: true, createdAt: true } },
} satisfies Prisma.PersonnelInclude;

export function canPersonnel(session: Session, action: string) {
  return session.permissions.includes("*") || session.permissions.includes(`personnel:${action}`) || (action === "query" && session.permissions.includes("staff:view"));
}

export async function personnelLog(userId: string, action: string, result: OperationLogResult, detail?: string) {
  await writeOperationLog({ userId, page: "人员档案", action, result, detail }).catch(() => undefined);
}

export function resolveWorkdayHours(input: number | null | undefined, configured: number | undefined) {
  return input ?? configured ?? null;
}

export function toDate(value: string) { return new Date(`${value}T00:00:00.000`); }

export async function validatePersonnelRelations(data: PersonnelInput, editingId?: string) {
  const [store, departments, positions, socialSecurityStatuses, platformUser] = await Promise.all([
    data.storeId ? db.store.findUnique({ where: { id: data.storeId }, include: { brand: { select: { name: true } } } }) : null,
    getBusinessDictionaryOptions("DEPARTMENT"),
    getBusinessDictionaryOptions("POSITION_LEVEL"),
    getBusinessDictionaryOptions("SOCIAL_SECURITY_STATUS"),
    data.platformUserId ? db.user.findUnique({ where: { id: data.platformUserId }, include: { personnelProfile: { select: { id: true } } } }) : null,
  ]);
  if (data.organization === "总部") {
    if (!departments.some(option => option.value === data.department || option.label === data.department)) throw new Error("所选总部部门不存在或已禁用");
  } else {
    if (!store || store.operationStatus === "CLOSED") throw new Error("所选门店不存在或已关闭");
    if (store.brand.name !== data.organization) throw new Error("人员归属与所选门店品牌不一致");
  }
  const position = positions.find(option => option.value === data.positionLevel || option.label === data.positionLevel);
  if (!position) throw new Error("所属岗位星级不存在或已禁用");
  if (!socialSecurityStatuses.some(option => option.value === data.socialSecurity)) throw new Error("社保情况不存在或已禁用");
  if (data.platformUserId && (!platformUser || platformUser.status !== RecordStatus.ENABLED)) throw new Error("所选平台用户不存在或已禁用");
  if (platformUser?.personnelProfile && platformUser.personnelProfile.id !== editingId) throw new Error("该平台用户已绑定其他人员档案");
  const configuredWorkdayHours = store ? await getConfiguredWorkdayHours(store.brand.name) : undefined;
  // The brand parameter supplies the form default; an explicit user value takes precedence.
  return { positionLevel: position.label, workdayHours: resolveWorkdayHours(data.workdayHours, configuredWorkdayHours) };
}

export async function nextPersonnelRecordNo(tx: Prisma.TransactionClient) {
  const now = new Date();
  const dateKey = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const sequence = await tx.personnelSequence.upsert({ where: { dateKey }, create: { dateKey, nextValue: 2 }, update: { nextValue: { increment: 1 } }, select: { nextValue: true } });
  return `${dateKey}${String(sequence.nextValue - 1).padStart(4, "0")}`;
}

export function personnelData(data: PersonnelInput, normalizedPosition: string, workdayHours: number | null) {
  return {
    name: data.name, phone: data.phone, idNumber: data.idNumber, birthday: data.birthday || null,
    hireDate: toDate(data.hireDate), positionLevel: normalizedPosition, organization: data.organization, department: data.organization === "总部" ? data.department : null, storeId: data.organization === "总部" ? null : data.storeId,
    contractSignDate: toDate(data.contractSignDate), contractYears: data.contractYears ?? null, contractExpiryDate: toDate(data.contractExpiryDate),
    homeAddress: data.homeAddress, currentAddress: data.currentAddress, supplementaryMaterial: data.supplementaryMaterial || null,
    baseSalary: new Prisma.Decimal(data.baseSalary), laborCost: new Prisma.Decimal(data.laborCost), workdayHours: workdayHours === null ? null : new Prisma.Decimal(workdayHours), socialSecurity: data.socialSecurity, platformAccess: data.platformAccess || null,
    platformUserId: data.platformAccess === "YES" ? data.platformUserId : null, remark: data.remark || null,
  };
}

export function activePersonnelWhere() { return { deletedAt: null, status: PersonnelStatus.ACTIVE } as const; }

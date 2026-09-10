import {
  InventoryManageStock, ItemRequisitionStatus, PersonnelStatus, Prisma, RecordStatus,
} from "@prisma/client";
import { z } from "zod";
import type { Session } from "@/lib/auth";
import { db } from "@/lib/db";
import { shanghaiDateTime, writeOperationLog, type OperationLogResult } from "@/lib/operation-log";
import { jsonIdArray } from "@/lib/user-store-scope";

export type ItemRequisitionAction = "query" | "create" | "edit" | "view" | "export";
export type ItemRequisitionFilters = {
  startDate?: string;
  endDate?: string;
  itemNameKeyword?: string;
  specificationKeyword?: string;
  personnelKeyword?: string;
};

export const itemRequisitionCreateSchema = z.object({
  requestId: z.string().uuid("新增请求标识不正确"),
  personnelId: z.string().trim().min(1, "请选择领用人"),
  itemId: z.string().trim().min(1, "请选择领用物品"),
  quantity: z.number().int("领用数量仅支持正整数").min(1, "领用数量必须大于0").max(999999, "单次领用数量不能超过999999"),
  remark: z.string().max(100, "备注不能超过100个字符").nullable().optional(),
}).strict("新增请求包含不允许设置的字段");

export const itemRequisitionPersonnelSchema = z.object({
  personnelId: z.string().trim().min(1, "请选择领用人"),
  version: z.number().int().positive("领用记录版本不正确"),
}).strict("编辑请求包含不允许设置的字段");

export const itemRequisitionReturnSchema = z.object({
  requestId: z.string().uuid("返还请求标识不正确"),
  quantity: z.number().int("返还数量仅支持正整数").min(1, "返还数量必须大于0").max(999999, "单次返还数量不能超过999999"),
}).strict("返还请求包含不允许设置的字段");

export function canItemRequisition(session: Session, action: ItemRequisitionAction) {
  return session.permissions.includes("*")
    || session.permissions.includes(`item-requisitions:${action}`)
    || (action === "query" && session.permissions.includes("staff:view"));
}

export async function itemRequisitionLog(session: Session, action: string, result: OperationLogResult, detail?: string, request?: Request) {
  await writeOperationLog({ userId: session.userId, username: session.username, page: "领用管理", action, result, detail, request }).catch(() => undefined);
}

function configuredScope(value: unknown, permissions: string[], prefix: string) {
  if (Array.isArray(value)) return jsonIdArray(value);
  const ids = permissions.filter(permission => permission.startsWith(prefix)).map(permission => permission.slice(prefix.length)).filter(Boolean);
  return ids.length ? ids : null;
}

export async function requisitionPersonnelDataScope(session: Session): Promise<Prisma.PersonnelWhereInput> {
  if (session.permissions.includes("*") || session.role === "SUPER_ADMIN") return {};
  const user = await db.user.findUnique({ where: { id: session.userId }, select: { leadH5BrandIds: true, leadH5StoreIds: true } });
  if (!user) return { id: { in: [] } };
  const brandIds = configuredScope(user.leadH5BrandIds, session.permissions, "data:brand:");
  const storeIds = configuredScope(user.leadH5StoreIds, session.permissions, "data:store:");
  const and: Prisma.PersonnelWhereInput[] = [];
  if (brandIds !== null) and.push({ store: { is: { brandId: { in: brandIds } } } });
  if (storeIds !== null) and.push({ storeId: { in: storeIds } });
  return and.length ? { AND: and } : {};
}

export async function selectablePersonnelWhere(session: Session): Promise<Prisma.PersonnelWhereInput> {
  return { AND: [await requisitionPersonnelDataScope(session), { deletedAt: null, status: PersonnelStatus.ACTIVE }] };
}

export async function itemRequisitionDataScope(session: Session): Promise<Prisma.ItemRequisitionWhereInput> {
  return { personnel: { is: await requisitionPersonnelDataScope(session) } };
}

function readText(search: URLSearchParams, key: string, maxLength: number) {
  const value = search.get(key)?.trim() || undefined;
  if (value && value.length > maxLength) throw new Error(`${key}筛选内容过长`);
  return value;
}

function validDate(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return !value;
  const date = new Date(`${value}T00:00:00+08:00`);
  return !Number.isNaN(date.valueOf()) && shanghaiDate(date) === value;
}

export function readItemRequisitionFilters(search: URLSearchParams): ItemRequisitionFilters {
  const filters = {
    startDate: readText(search, "startDate", 10),
    endDate: readText(search, "endDate", 10),
    itemNameKeyword: readText(search, "itemNameKeyword", 30),
    specificationKeyword: readText(search, "specificationKeyword", 50),
    personnelKeyword: readText(search, "personnelKeyword", 50),
  };
  if (!validDate(filters.startDate) || !validDate(filters.endDate)) throw new Error("领用日期格式不正确");
  if (filters.startDate && filters.endDate && filters.startDate > filters.endDate) throw new Error("领用开始日期不能晚于领用截止日期");
  return filters;
}

export function itemRequisitionFilterWhere(filters: ItemRequisitionFilters): Prisma.ItemRequisitionWhereInput {
  return {
    ...(filters.startDate || filters.endDate ? { requisitionedAt: {
      ...(filters.startDate ? { gte: new Date(`${filters.startDate}T00:00:00+08:00`) } : {}),
      ...(filters.endDate ? { lte: new Date(`${filters.endDate}T23:59:59.999+08:00`) } : {}),
    } } : {}),
    ...(filters.itemNameKeyword ? { itemNameSnapshot: { contains: filters.itemNameKeyword } } : {}),
    ...(filters.specificationKeyword ? { specificationSnapshot: { contains: filters.specificationKeyword } } : {}),
    ...(filters.personnelKeyword ? { personnelNameSnapshot: { contains: filters.personnelKeyword } } : {}),
  };
}

export async function scopedItemRequisitionWhere(session: Session, filters: ItemRequisitionFilters = {}) {
  return { AND: [await itemRequisitionDataScope(session), itemRequisitionFilterWhere(filters)] } satisfies Prisma.ItemRequisitionWhereInput;
}

export async function nextItemRequisitionNo(tx: Prisma.TransactionClient) {
  const dateKey = shanghaiDateTime().dateKey;
  const sequence = await tx.itemRequisitionSequence.upsert({
    where: { dateKey }, create: { dateKey, nextValue: 2 }, update: { nextValue: { increment: 1 } }, select: { nextValue: true },
  });
  const value = sequence.nextValue - 1;
  if (value > 9999) throw new Error("当日领用单号已达到上限");
  return `${dateKey}${String(value).padStart(4, "0")}`;
}

const shanghaiDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
});

export function shanghaiDate(value: Date) {
  const parts = shanghaiDateFormatter.formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export const itemRequisitionSelect = {
  id: true,
  requisitionNo: true,
  requisitionedAt: true,
  personnelId: true,
  personnelNameSnapshot: true,
  personnelBelongingSnapshot: true,
  departmentStoreSnapshot: true,
  itemId: true,
  itemRecordNoSnapshot: true,
  itemNameSnapshot: true,
  itemTypeCodeSnapshot: true,
  itemTypeNameSnapshot: true,
  specificationSnapshot: true,
  unitSnapshot: true,
  manageStockSnapshot: true,
  quantity: true,
  remark: true,
  status: true,
  version: true,
  createdByUsername: true,
  createdByNameSnapshot: true,
  createdAt: true,
  updatedByNameSnapshot: true,
  updatedAt: true,
} satisfies Prisma.ItemRequisitionSelect;

export const itemRequisitionListSelect = {
  id: true,
  requisitionNo: true,
  requisitionedAt: true,
  personnelNameSnapshot: true,
  itemNameSnapshot: true,
  unitSnapshot: true,
  quantity: true,
  createdByNameSnapshot: true,
  createdAt: true,
} satisfies Prisma.ItemRequisitionSelect;

type SelectedItemRequisition = Prisma.ItemRequisitionGetPayload<{ select: typeof itemRequisitionSelect }>;

export function serializeItemRequisition(row: SelectedItemRequisition) {
  return {
    id: row.id,
    requisitionNo: row.requisitionNo,
    requisitionDate: shanghaiDate(row.requisitionedAt),
    requisitionedAt: row.requisitionedAt.toISOString(),
    personnelId: row.personnelId,
    personnelName: row.personnelNameSnapshot,
    personnelBelonging: row.personnelBelongingSnapshot,
    departmentStore: row.departmentStoreSnapshot,
    itemId: row.itemId,
    itemRecordNo: row.itemRecordNoSnapshot,
    itemName: row.itemNameSnapshot,
    itemTypeCode: row.itemTypeCodeSnapshot,
    itemType: row.itemTypeNameSnapshot,
    specification: row.specificationSnapshot,
    unit: row.unitSnapshot,
    manageStock: row.manageStockSnapshot,
    quantity: row.quantity,
    remark: row.remark,
    status: row.status,
    version: row.version,
    createdByUsername: row.createdByUsername,
    createdByName: row.createdByNameSnapshot,
    createdAt: row.createdAt.toISOString(),
    updatedByName: row.updatedByNameSnapshot,
    updatedAt: row.updatedAt.toISOString(),
  };
}

type SelectedItemRequisitionList = Prisma.ItemRequisitionGetPayload<{ select: typeof itemRequisitionListSelect }>;

export function serializeItemRequisitionListRow(row: SelectedItemRequisitionList) {
  return {
    id: row.id,
    requisitionNo: row.requisitionNo,
    requisitionDate: shanghaiDate(row.requisitionedAt),
    personnelName: row.personnelNameSnapshot,
    itemName: row.itemNameSnapshot,
    unit: row.unitSnapshot,
    quantity: row.quantity,
    createdByName: row.createdByNameSnapshot,
    createdAt: row.createdAt.toISOString(),
  };
}

export function itemSnapshot(item: {
  id: string; recordNo: string; itemName: string; itemTypeCode: string; itemTypeNameSnapshot: string;
  specification: string | null; unit: string; manageStock: InventoryManageStock;
}) {
  return {
    itemId: item.id,
    itemRecordNoSnapshot: item.recordNo,
    itemNameSnapshot: item.itemName,
    itemTypeCodeSnapshot: item.itemTypeCode,
    itemTypeNameSnapshot: item.itemTypeNameSnapshot,
    specificationSnapshot: item.specification,
    unitSnapshot: item.unit,
    manageStockSnapshot: item.manageStock,
  };
}

export function personnelSnapshot(personnel: {
  id: string; name: string; organization: string; department: string | null; store: { name: string } | null;
}) {
  return {
    personnelId: personnel.id,
    personnelNameSnapshot: personnel.name,
    personnelBelongingSnapshot: personnel.organization,
    departmentStoreSnapshot: personnel.organization === "总部" ? personnel.department : personnel.store?.name || null,
  };
}

export function safeItemRequisitionError(error: unknown, fallback: string) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2025") return "领用记录、人员或物品不存在";
    return fallback;
  }
  if (error instanceof Error) {
    const allowedPrefixes = ["当前库存不足，最新可用库存为"];
    const allowed = [
      "所选人员不存在、不在职或无权访问", "所选物品不存在或已被删除", "所选物品已禁用，无法领用",
      "当前物品库存数量异常，请联系系统管理员", "当日领用单号已达到上限", "当日库存流水编号已达到上限",
      "领用记录不存在或无权访问", "当前领用记录已被其他用户修改，请刷新后重新操作",
    ];
    if (allowed.includes(error.message) || allowedPrefixes.some(prefix => error.message.startsWith(prefix))) return error.message;
  }
  return fallback;
}

export const selectableItemWhere = { status: RecordStatus.ENABLED } satisfies Prisma.InventoryItemWhereInput;
export { InventoryManageStock, ItemRequisitionStatus, PersonnelStatus, RecordStatus };

import { createHash } from "node:crypto";
import {
  InventoryBusinessType, InventoryManageStock, Prisma, RecordStatus,
} from "@prisma/client";
import { z } from "zod";
import type { Session } from "@/lib/auth";
import { getBusinessDictionaryOptions } from "@/lib/business-dictionaries";
import { shanghaiDateTime, writeOperationLog, type OperationLogResult } from "@/lib/operation-log";

const optionalText = (maximum: number, message: string) => z.string().trim().max(maximum, message).optional().nullable().transform(value => value || null);

const editableFields = {
  itemName: z.string().trim().min(1, "请输入物品名称").max(30, "物品名称不能超过30个字符"),
  itemTypeCode: z.string().trim().min(1, "请选择物品类型").max(100, "物品类型不能超过100个字符"),
  specification: optionalText(50, "规格不能超过50个字符"),
  unit: z.string().trim().min(1, "请输入单位").max(5, "单位不能超过5个字符").regex(/^[\p{L}\p{N}]+$/u, "单位仅支持汉字、字母和数字"),
  remark: optionalText(200, "备注不能超过200个字符"),
};

export const inventoryCreateSchema = z.object({
  ...editableFields,
  manageStock: z.nativeEnum(InventoryManageStock, { message: "请选择是否管理库存" }),
  requiresReturnOnResignation: z.boolean().default(false),
}).strict("请求中包含不允许设置的物品字段");

export const inventoryEditSchema = z.object({
  ...editableFields,
  requiresReturnOnResignation: z.boolean({ required_error: "请选择离职是否需要返还" }),
  version: z.number().int().positive("物品版本不正确"),
}).strict("只能修改物品名称、物品类型、规格、单位和备注");

export const inventoryInboundSchema = z.object({
  inboundType: z.enum(["PURCHASE", "INITIAL"], { message: "请选择入库类型" }),
  quantity: z.number().int("入库数量仅支持正整数").min(1, "入库数量必须大于0").max(999999, "单次入库数量不能超过999999"),
}).strict("入库请求包含不允许设置的字段");

export const inventoryStatusSchema = z.object({
  status: z.nativeEnum(RecordStatus, { message: "物品状态不正确" }),
  version: z.number().int().positive("物品版本不正确"),
}).strict("状态操作包含不允许设置的字段");

export type InventoryCreateInput = z.infer<typeof inventoryCreateSchema>;
export type InventoryEditInput = z.infer<typeof inventoryEditSchema>;

export function canWorkwearInventory(session: Session, action: string) {
  return session.permissions.includes("*")
    || session.permissions.includes(`workwear-inventory:${action}`)
    || (action === "query" && session.permissions.includes("staff:view"));
}

export async function workwearInventoryLog(userId: string, username: string, action: string, result: OperationLogResult, detail?: string, request?: Request) {
  await writeOperationLog({ userId, username, page: "物品管理", action, result, detail, request }).catch(() => undefined);
}

export function inventoryDuplicateKey(itemName: string, itemTypeCode: string, specification?: string | null) {
  const canonical = [itemName, itemTypeCode, specification || ""].map(value => value.trim().normalize("NFKC").toLocaleLowerCase("zh-CN")).join("\u0000");
  return createHash("sha256").update(canonical).digest("hex");
}

export async function resolveInventoryItemType(itemTypeCode: string) {
  const options = await getBusinessDictionaryOptions("ITEM_REQUISITION_TYPE");
  const option = options.find(item => item.value === itemTypeCode || item.label === itemTypeCode);
  if (!option) throw new Error("所选物品类型不存在或已禁用");
  return { code: option.value, name: option.label };
}

export function inventoryData(data: InventoryCreateInput | InventoryEditInput, itemType: { code: string; name: string }) {
  return {
    duplicateKey: inventoryDuplicateKey(data.itemName, itemType.code, data.specification),
    itemName: data.itemName,
    itemTypeCode: itemType.code,
    itemTypeNameSnapshot: itemType.name,
    specification: data.specification,
    unit: data.unit,
    requiresReturnOnResignation: data.requiresReturnOnResignation,
    remark: data.remark,
  };
}

export async function nextInventoryItemRecordNo(tx: Prisma.TransactionClient) {
  const dateKey = shanghaiDateTime().dateKey;
  const sequence = await tx.inventoryItemSequence.upsert({
    where: { dateKey }, create: { dateKey, nextValue: 2 }, update: { nextValue: { increment: 1 } }, select: { nextValue: true },
  });
  const value = sequence.nextValue - 1;
  if (value > 9999) throw new Error("当日物品记录编号已达到上限");
  return `${dateKey}${String(value).padStart(4, "0")}`;
}

export async function nextInventoryTransactionNo(tx: Prisma.TransactionClient) {
  const dateKey = shanghaiDateTime().dateKey;
  const sequence = await tx.inventoryTransactionSequence.upsert({
    where: { dateKey }, create: { dateKey, nextValue: 2 }, update: { nextValue: { increment: 1 } }, select: { nextValue: true },
  });
  const value = sequence.nextValue - 1;
  if (value > 9999) throw new Error("当日库存流水编号已达到上限");
  return `${dateKey}${String(value).padStart(4, "0")}`;
}

type SerializableInventoryItem = {
  id: string;
  recordNo: string;
  itemName: string;
  itemTypeCode: string;
  itemTypeNameSnapshot: string;
  specification: string | null;
  unit: string;
  manageStock: InventoryManageStock;
  stockQuantity: bigint | null;
  status: RecordStatus;
  requiresReturnOnResignation: boolean;
  remark: string | null;
  version: number;
  createdByUserId: string | null;
  createdByName: string;
  createdAt: Date;
  updatedAt: Date;
  _count?: { transactions: number };
};

export function serializeInventoryItem(row: SerializableInventoryItem) {
  return {
    id: row.id,
    recordNo: row.recordNo,
    itemName: row.itemName,
    itemTypeCode: row.itemTypeCode,
    itemTypeName: row.itemTypeNameSnapshot,
    specification: row.specification,
    unit: row.unit,
    manageStock: row.manageStock,
    stockQuantity: row.stockQuantity === null ? null : row.stockQuantity.toString(),
    status: row.status,
    requiresReturnOnResignation: row.requiresReturnOnResignation,
    remark: row.remark,
    version: row.version,
    createdByUserId: row.createdByUserId,
    createdByName: row.createdByName,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    transactionCount: row._count?.transactions,
  };
}

export function inboundBusinessType(value: "PURCHASE" | "INITIAL") {
  return value === "INITIAL" ? InventoryBusinessType.INITIAL_STOCK : InventoryBusinessType.PURCHASE_INBOUND;
}

export function safeInventoryError(error: unknown, fallback: string) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return "相同物品名称、物品类型和规格的记录已存在";
    if (error.code === "P2025") return "物品不存在或已被删除";
    return fallback;
  }
  if (error instanceof Error) {
    const allowed = [
      "所选物品类型不存在或已禁用", "当日物品记录编号已达到上限", "当日库存流水编号已达到上限",
      "物品不存在或已被删除", "当前物品不管理库存，无需执行入库操作", "当前物品已禁用，不支持入库",
      "当前物品已产生库存记录，不允许再次录入期初库存", "当前物品已产生库存业务记录，不支持删除，请使用禁用功能",
      "当前物品库存数量异常，请联系系统管理员", "当前物品已被其他用户修改，请刷新后重新操作",
      "当前物品状态已发生变化，请刷新后重新操作",
    ];
    if (allowed.includes(error.message)) return error.message;
  }
  return fallback;
}

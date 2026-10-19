import bcrypt from "bcryptjs";
import { Prisma, RecordStatus, UserType } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession, sessionHasPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";
import { synchronizeStoreLeadership } from "@/lib/store-leadership";
import { synchronizeStoreRegionManagers } from "@/lib/store-supervisor";
import { normalizeManagedRegions, replaceManagedRegions } from "@/lib/user-managed-regions";
import { normalizeUserTags } from "@/lib/user-tags";
import { jsonIdArray } from "@/lib/user-store-scope";

const phone = z.string().trim().regex(/^1\d{10}$/, "请输入11位手机号码").optional().or(z.literal(""));
const updateSchema = z.object({ username: z.string().trim().regex(/^[A-Za-z][A-Za-z0-9_]{1,29}$/, "账号须为2-30位字母、数字或下划线，且以字母开头"), realName: z.string().trim().min(1, "请输入真实姓名").max(30, "真实姓名不能超过30个字符"), phone, tags: z.string().trim().max(200, "用户标签不能超过200个字符").optional().or(z.literal("")), leadH5BrandIds: z.array(z.string().min(1)).nullable(), leadH5StoreIds: z.array(z.string().min(1)).nullable(), isRegionManager: z.boolean().default(false), managedRegions: z.array(z.string().min(1)).nullable().optional(), roleId: z.string().min(1, "请选择角色"), status: z.nativeEnum(RecordStatus), updatedAt: z.string().min(1) });
const statusSchema = z.object({ action: z.literal("status"), status: z.nativeEnum(RecordStatus), updatedAt: z.string().min(1) });
const passwordSchema = z.object({ action: z.literal("resetPassword"), password: z.string().min(8, "密码至少需要8位"), updatedAt: z.string().min(1) });
const publicUser = { id: true, username: true, realName: true, phone: true, tags: true, leadH5BrandIds: true, leadH5StoreIds: true, isRegionManager: true, managedRegions: { select: { region: true }, orderBy: { region: "asc" } }, type: true, status: true, roleId: true, createdByUserId: true, createdBy: { select: { username: true, realName: true } }, lastLoginAt: true, createdAt: true, updatedAt: true, role: { select: { id: true, name: true, code: true, status: true } } } as const;
const sameTimestamp = (first: Date, second: string) => first.getTime() === new Date(second).getTime();
const duplicateMessage = (error: unknown, fallback: string) => {
  if ((error as { code?: string }).code === "P2002") {
    const target = JSON.stringify((error as { meta?: { target?: unknown } }).meta?.target || "");
    return target.includes("region") || target.includes("UserManagedRegion") ? "所选区域已分配给其他用户，请重新选择" : "账号已存在，请重新输入";
  }
  return error instanceof Error && (error.message.startsWith("运营H5") || error.message.startsWith("区域管理权限")) ? error.message : fallback;
};

async function findUser(id: string) { return db.user.findUnique({ where: { id }, select: publicUser }); }
async function enabledRole(roleId: string) { return db.role.findFirst({ where: { id: roleId, status: RecordStatus.ENABLED }, select: { id: true, code: true } }); }
async function validateDataScope(brandIds: string[] | null | undefined, storeIds: string[] | null | undefined) {
  const uniqueBrands = brandIds?.length ? [...new Set(brandIds)] : null;
  const uniqueStores = storeIds?.length ? [...new Set(storeIds)] : null;
  const [brands, stores] = await Promise.all([
    uniqueBrands ? db.brand.findMany({ where: { id: { in: uniqueBrands }, status: RecordStatus.ENABLED }, select: { id: true } }) : Promise.resolve([]),
    uniqueStores ? db.store.findMany({ where: { id: { in: uniqueStores }, ...(uniqueBrands ? { brandId: { in: uniqueBrands } } : {}) }, select: { id: true } }) : Promise.resolve([]),
  ]);
  if (uniqueBrands && brands.length !== uniqueBrands.length) throw new Error("运营H5品牌权限包含无效品牌，请重新选择");
  if (uniqueStores && stores.length !== uniqueStores.length) throw new Error("运营H5店铺权限包含无效或超出品牌范围的店铺，请重新选择");
  return { brandIds: uniqueBrands, storeIds: uniqueStores };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!sessionHasPermission(session, "settings:users")) return NextResponse.json({ message: "暂无用户管理权限" }, { status: 403 });
  const user = await findUser((await params).id);
  if (!user) return NextResponse.json({ message: "用户不存在或已被删除" }, { status: 404 });
  await writeOperationLog({ userId: session.userId, username: session.username, page: "用户列表", action: "查看", result: "成功", detail: `查看用户：${user.realName}（${user.username}）`, request });
  return NextResponse.json(user);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!sessionHasPermission(session, "settings:users")) return NextResponse.json({ message: "暂无用户管理权限" }, { status: 403 });
  const user = await findUser((await params).id);
  if (!user) return NextResponse.json({ message: "用户不存在或已被删除" }, { status: 404 });
  const body = await request.json();
  const isStatusChange = body.action === "status"; const isPasswordReset = body.action === "resetPassword";
  if (isStatusChange) {
    const parsed = statusSchema.safeParse(body); if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message }, { status: 400 });
    if (!sameTimestamp(user.updatedAt, parsed.data.updatedAt)) return NextResponse.json({ message: "用户已被其他人修改，请刷新后重试。" }, { status: 409 });
    if (user.type === UserType.SYSTEM && parsed.data.status === RecordStatus.DISABLED) return NextResponse.json({ message: "系统内置用户不可禁用" }, { status: 400 });
    if (user.id === session.userId && parsed.data.status === RecordStatus.DISABLED) return NextResponse.json({ message: "不可禁用当前登录账号" }, { status: 400 });
    const result = await db.$transaction(async transaction => {
      const updated = await transaction.user.updateMany({ where: { id: user.id, updatedAt: user.updatedAt }, data: { status: parsed.data.status } });
      if (updated.count) {
        await synchronizeStoreLeadership(jsonIdArray(user.leadH5StoreIds), transaction);
        await synchronizeStoreRegionManagers(user.managedRegions.map(item => item.region), transaction);
      }
      return updated;
    });
    if (!result.count) return NextResponse.json({ message: "用户已被其他人修改，请刷新后重试。" }, { status: 409 });
    const action = parsed.data.status === RecordStatus.ENABLED ? "启用" : "禁用"; await writeOperationLog({ userId: session.userId, username: session.username, page: "用户列表", action, result: "成功", detail: `${action}用户：${user.realName}（${user.username}）`, request }); return NextResponse.json({ message: `用户${action}成功` });
  }
  if (isPasswordReset) {
    const parsed = passwordSchema.safeParse(body); if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message }, { status: 400 });
    if (!sameTimestamp(user.updatedAt, parsed.data.updatedAt)) return NextResponse.json({ message: "用户已被其他人修改，请刷新后重试。" }, { status: 409 });
    const result = await db.user.updateMany({ where: { id: user.id, updatedAt: user.updatedAt }, data: { passwordHash: await bcrypt.hash(parsed.data.password, 12) } });
    if (!result.count) return NextResponse.json({ message: "用户已被其他人修改，请刷新后重试。" }, { status: 409 });
    await writeOperationLog({ userId: session.userId, username: session.username, page: "用户列表", action: "重置密码", result: "成功", detail: `重置用户密码：${user.realName}（${user.username}）`, request }); return NextResponse.json({ message: "密码重置成功" });
  }
  const parsed = updateSchema.safeParse(body); if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message }, { status: 400 });
  if (!sameTimestamp(user.updatedAt, parsed.data.updatedAt)) return NextResponse.json({ message: "用户已被其他人修改，请刷新后重试。" }, { status: 409 });
  if (user.type === UserType.SYSTEM && parsed.data.roleId !== user.roleId) return NextResponse.json({ message: "系统内置用户不可变更角色" }, { status: 400 });
  if (user.type === UserType.SYSTEM && parsed.data.status === RecordStatus.DISABLED) return NextResponse.json({ message: "系统内置用户不可禁用" }, { status: 400 });
  if (user.id === session.userId && parsed.data.status === RecordStatus.DISABLED) return NextResponse.json({ message: "不可禁用当前登录账号" }, { status: 400 });
  const role = await enabledRole(parsed.data.roleId); if (!role) return NextResponse.json({ message: "所选角色不存在或已禁用，请重新选择" }, { status: 400 });
  try {
    const scope = await validateDataScope(parsed.data.leadH5BrandIds, parsed.data.leadH5StoreIds);
    const managedRegions = parsed.data.isRegionManager ? await normalizeManagedRegions(parsed.data.managedRegions) : [];
    const affectedStoreIds = [...new Set([...jsonIdArray(user.leadH5StoreIds), ...(scope.storeIds || [])])];
    const affectedRegions = [...new Set([...user.managedRegions.map(item => item.region), ...managedRegions])];
    const result = await db.$transaction(async transaction => {
      const updated = await transaction.user.updateMany({ where: { id: user.id, updatedAt: user.updatedAt }, data: { username: parsed.data.username, realName: parsed.data.realName, phone: parsed.data.phone || null, tags: normalizeUserTags(parsed.data.tags), leadH5BrandIds: scope.brandIds ?? Prisma.DbNull, leadH5StoreIds: scope.storeIds ?? Prisma.DbNull, isRegionManager: parsed.data.isRegionManager, roleId: role.id, status: parsed.data.status } });
      if (updated.count) {
        await replaceManagedRegions(transaction, user.id, managedRegions);
        await synchronizeStoreLeadership(affectedStoreIds, transaction);
        await synchronizeStoreRegionManagers(affectedRegions, transaction);
      }
      return updated;
    });
    if (!result.count) return NextResponse.json({ message: "用户已被其他人修改，请刷新后重试。" }, { status: 409 });
    await writeOperationLog({ userId: session.userId, username: session.username, page: "用户列表", action: "编辑", result: "成功", detail: `编辑用户：${user.realName}（${user.username}）`, request }); return NextResponse.json({ message: "用户保存成功" });
  } catch (error) {
    const message = duplicateMessage(error, "用户保存失败，请稍后重试"); await writeOperationLog({ userId: session.userId, username: session.username, page: "用户列表", action: "编辑", result: "失败", detail: `用户：${user.username}；${message}`, request }); return NextResponse.json({ message }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!sessionHasPermission(session, "settings:users")) return NextResponse.json({ message: "暂无用户管理权限" }, { status: 403 });
  const user = await findUser((await params).id);
  if (!user) return NextResponse.json({ message: "用户不存在或已被删除" }, { status: 404 });
  if (user.id === session.userId) return NextResponse.json({ message: "不可删除当前登录账号" }, { status: 400 });
  if (user.type === UserType.SYSTEM) return NextResponse.json({ message: "系统内置用户不可删除" }, { status: 400 });
  if (await db.leadH5Review.count({ where: { reviewerUserId: user.id } })) return NextResponse.json({ message: "该用户已产生运营H5正式评分记录，请禁用账号而非删除" }, { status: 400 });
  await db.$transaction(async transaction => {
    await transaction.operationLog.updateMany({ where: { userId: user.id, username: null }, data: { username: user.username } });
    await transaction.operationLog.updateMany({ where: { userId: user.id }, data: { userId: null } });
    await transaction.user.delete({ where: { id: user.id } });
    await synchronizeStoreLeadership(jsonIdArray(user.leadH5StoreIds), transaction);
    await synchronizeStoreRegionManagers(user.managedRegions.map(item => item.region), transaction);
  });
  await writeOperationLog({ userId: session.userId, username: session.username, page: "用户列表", action: "删除", result: "成功", detail: `删除用户：${user.realName}（${user.username}）`, request });
  return NextResponse.json({ message: "用户删除成功" });
}

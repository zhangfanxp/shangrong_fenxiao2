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

const phone = z.string().trim().regex(/^1\d{10}$/, "请输入11位手机号码").optional().or(z.literal(""));
const userSchema = z.object({
  username: z.string().trim().regex(/^[A-Za-z][A-Za-z0-9_]{1,29}$/, "账号须为2-30位字母、数字或下划线，且以字母开头"),
  realName: z.string().trim().min(1, "请输入真实姓名").max(30, "真实姓名不能超过30个字符"),
  phone,
  tags: z.string().trim().max(200, "用户标签不能超过200个字符").optional().or(z.literal("")),
  leadH5BrandIds: z.array(z.string().min(1)).nullable().optional(),
  leadH5StoreIds: z.array(z.string().min(1)).nullable().optional(),
  isRegionManager: z.boolean().default(false),
  managedRegions: z.array(z.string().min(1)).nullable().optional(),
  roleId: z.string().min(1, "请选择角色"),
  status: z.nativeEnum(RecordStatus).default(RecordStatus.ENABLED),
  password: z.string().min(8, "密码至少需要8位"),
});
const publicUser = { id: true, username: true, realName: true, phone: true, tags: true, leadH5BrandIds: true, leadH5StoreIds: true, isRegionManager: true, managedRegions: { select: { region: true }, orderBy: { region: "asc" } }, type: true, status: true, roleId: true, createdByUserId: true, createdBy: { select: { username: true, realName: true } }, lastLoginAt: true, createdAt: true, updatedAt: true, role: { select: { id: true, name: true, code: true, status: true } } } as const;
const duplicateMessage = (error: unknown, fallback: string) => {
  if ((error as { code?: string }).code === "P2002") {
    const target = JSON.stringify((error as { meta?: { target?: unknown } }).meta?.target || "");
    return target.includes("region") || target.includes("UserManagedRegion") ? "所选区域已分配给其他用户，请重新选择" : "账号已存在，请重新输入";
  }
  return error instanceof Error && (error.message.startsWith("运营H5") || error.message.startsWith("区域管理权限")) ? error.message : fallback;
};

async function enabledRole(roleId: string) { return db.role.findFirst({ where: { id: roleId, status: RecordStatus.ENABLED }, select: { id: true, code: true, name: true } }); }
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

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!sessionHasPermission(session, "settings:users")) return NextResponse.json({ message: "暂无用户管理权限" }, { status: 403 });
  const url = new URL(request.url); const keyword = (url.searchParams.get("keyword") || "").trim(); const roleId = url.searchParams.get("roleId") || ""; const status = url.searchParams.get("status") || "";
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1); const pageSize = Math.min(100, Math.max(10, Number(url.searchParams.get("pageSize")) || 10));
  const where = { ...(keyword ? { OR: [{ username: { contains: keyword } }, { realName: { contains: keyword } }, { phone: { contains: keyword } }] } : {}), ...(roleId ? { roleId } : {}), ...(Object.values(RecordStatus).includes(status as RecordStatus) ? { status: status as RecordStatus } : {}) };
  const [total, rows] = await db.$transaction([db.user.count({ where }), db.user.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, select: publicUser })]);
  return NextResponse.json({ rows, total, page, pageSize });
}

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!sessionHasPermission(session, "settings:users")) return NextResponse.json({ message: "暂无用户管理权限" }, { status: 403 });
  const parsed = userSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message }, { status: 400 });
  const role = await enabledRole(parsed.data.roleId);
  if (!role) return NextResponse.json({ message: "所选角色不存在或已禁用，请重新选择" }, { status: 400 });
  try {
    const scope = await validateDataScope(parsed.data.leadH5BrandIds, parsed.data.leadH5StoreIds);
    const managedRegions = parsed.data.isRegionManager ? await normalizeManagedRegions(parsed.data.managedRegions) : [];
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const user = await db.$transaction(async transaction => {
      const created = await transaction.user.create({ data: { username: parsed.data.username, realName: parsed.data.realName, phone: parsed.data.phone || null, tags: normalizeUserTags(parsed.data.tags), leadH5BrandIds: scope.brandIds ?? Prisma.DbNull, leadH5StoreIds: scope.storeIds ?? Prisma.DbNull, isRegionManager: parsed.data.isRegionManager, type: UserType.CUSTOM, roleId: role.id, status: parsed.data.status, passwordHash, createdByUserId: session.userId }, select: publicUser });
      await replaceManagedRegions(transaction, created.id, managedRegions);
      await synchronizeStoreLeadership(scope.storeIds || [], transaction);
      await synchronizeStoreRegionManagers(managedRegions, transaction);
      return created;
    });
    await writeOperationLog({ userId: session.userId, username: session.username, page: "用户列表", action: "新增", result: "成功", detail: `新增用户：${user.realName}（${user.username}）`, request });
    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    const message = duplicateMessage(error, "用户新增失败，请稍后重试"); await writeOperationLog({ userId: session.userId, username: session.username, page: "用户列表", action: "新增", result: "失败", detail: message, request }); return NextResponse.json({ message }, { status: 400 });
  }
}

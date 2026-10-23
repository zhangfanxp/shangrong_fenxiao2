import bcrypt from "bcryptjs";
import { PersonnelStatus, Prisma, RecordStatus, UserType } from "@prisma/client";
import { pinyin } from "pinyin-pro";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession, sessionHasPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { canPersonnel, personnelLog } from "@/lib/personnel-service";
import { hasRolePlatformAccess } from "@/lib/role-permissions";

const accountPattern = /^[A-Za-z][A-Za-z0-9_]{1,29}$/;
const allowedPlatforms = ["lead-pc", "lead-h5", "store-h5"] as const;
const candidateSchema = z.object({
  personnelId: z.string().min(1),
  username: z.string().trim().regex(accountPattern, "账号须为2-30位字母、数字或下划线，且以字母开头"),
  roleId: z.string().min(1, "请选择角色"),
});
const batchSchema = z.object({ candidates: z.array(candidateSchema).min(1, "请选择要生成的平台用户").max(100, "每次最多生成100个账号") });

function rolePermissions(value: Prisma.JsonValue) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function defaultUsername(name: string) {
  return pinyin(name, { toneType: "none" }).replace(/\s+/g, "").replace(/[^A-Za-z0-9_]/g, "").toLowerCase().slice(0, 30);
}

async function authorizedSession() {
  const session = await requireApiSession();
  if (!session) return { session: null, response: NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 }) };
  if (!canPersonnel(session, "edit") || !sessionHasPermission(session, "settings:users")) {
    return { session: null, response: NextResponse.json({ message: "需要人员档案编辑和用户管理权限" }, { status: 403 }) };
  }
  return { session, response: null };
}

export async function GET(request: Request) {
  const access = await authorizedSession();
  if (!access.session) return access.response;
  const url = new URL(request.url);
  const usernames = [...new Set((url.searchParams.get("usernames") || "").split(",").map(value => value.trim()).filter(Boolean))];
  if (usernames.length > 100) return NextResponse.json({ message: "账号校验一次最多100个" }, { status: 400 });
  const [taken, roles] = await Promise.all([
    usernames.length ? db.user.findMany({ where: { username: { in: usernames } }, select: { username: true } }) : Promise.resolve([]),
    db.role.findMany({ where: { status: RecordStatus.ENABLED }, select: { id: true, name: true, permissions: true }, orderBy: { name: "asc" } }),
  ]);
  const roleOptions = roles.filter(role => {
    const permissions = rolePermissions(role.permissions);
    return allowedPlatforms.some(platform => hasRolePlatformAccess(permissions, platform));
  }).map(role => ({ id: role.id, name: role.name }));

  const ids = [...new Set((url.searchParams.get("ids") || "").split(",").filter(Boolean))];
  if (!ids.length) return NextResponse.json({ roles: roleOptions, takenUsernames: taken.map(item => item.username) });
  if (ids.length > 100) return NextResponse.json({ message: "每次最多选择100条人员档案" }, { status: 400 });

  const rows = await db.personnel.findMany({
    where: { id: { in: ids } },
    select: {
      id: true, name: true, status: true, deletedAt: true, storeId: true, platformUserId: true,
      store: { select: { id: true, name: true, operationStatus: true, brandId: true, brand: { select: { id: true, name: true, status: true } } } },
    },
  });
  const byId = new Map(rows.map(row => [row.id, row]));
  const defaultUsernames = rows.map(row => defaultUsername(row.name)).filter(Boolean);
  const defaultConflicts = defaultUsernames.length ? await db.user.findMany({ where: { username: { in: defaultUsernames } }, select: { username: true } }) : [];
  const takenUsernames = new Set([...taken.map(item => item.username), ...defaultConflicts.map(item => item.username)]);
  const candidates = ids.map(id => {
    const row = byId.get(id);
    if (!row) return { id, name: "未知人员档案", username: "", storeName: "", brandName: "", eligible: false, reason: "人员档案不存在" };
    const username = defaultUsername(row.name);
    const reason = row.deletedAt ? "人员档案已删除"
      : row.platformUserId ? "已绑定平台用户"
        : row.status !== PersonnelStatus.ACTIVE ? "仅在职员工可生成平台用户"
          : !row.storeId || !row.store ? "未分配门店，无法设置品牌和门店数据范围"
            : row.store.operationStatus === "CLOSED" ? "所属门店已关闭"
              : row.store.brand.status !== RecordStatus.ENABLED ? "所属品牌已停用"
                : !accountPattern.test(username) ? "姓名拼音无法生成有效账号，请先完善姓名"
                  : null;
    return {
      id: row.id, name: row.name, username,
      storeName: row.store?.name || "", brandName: row.store?.brand.name || "",
      eligible: !reason, reason, usernameTaken: takenUsernames.has(username),
    };
  });
  return NextResponse.json({ candidates, roles: roleOptions, takenUsernames: [...takenUsernames] });
}

export async function POST(request: Request) {
  const access = await authorizedSession();
  if (!access.session) return access.response;
  const parsed = batchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message }, { status: 400 });

  const candidates = parsed.data.candidates;
  const personnelIds = candidates.map(candidate => candidate.personnelId);
  const usernames = candidates.map(candidate => candidate.username);
  if (new Set(personnelIds).size !== personnelIds.length) return NextResponse.json({ message: "人员档案不能重复选择" }, { status: 400 });
  const normalizedUsernames = usernames.map(username => username.toLowerCase());
  const duplicateSubmitted = [...new Set(usernames.filter((_, index) => normalizedUsernames.indexOf(normalizedUsernames[index]) !== index))];
  if (duplicateSubmitted.length) return NextResponse.json({ message: "本次生成的账号不能重复，请修改冲突账号", duplicateUsernames: duplicateSubmitted }, { status: 409 });

  const [existingUsers, roles, personnelRows] = await Promise.all([
    db.user.findMany({ where: { username: { in: usernames } }, select: { username: true } }),
    db.role.findMany({ where: { id: { in: [...new Set(candidates.map(candidate => candidate.roleId))] }, status: RecordStatus.ENABLED }, select: { id: true, name: true, permissions: true } }),
    db.personnel.findMany({
      where: { id: { in: personnelIds } },
      select: {
        id: true, name: true, phone: true, status: true, deletedAt: true, storeId: true, platformUserId: true,
        store: { select: { id: true, name: true, operationStatus: true, brandId: true, brand: { select: { id: true, name: true, status: true } } } },
      },
    }),
  ]);
  if (existingUsers.length) return NextResponse.json({ message: "账号已被占用，请修改冲突账号后重试", duplicateUsernames: existingUsers.map(item => item.username) }, { status: 409 });

  const roleById = new Map(roles.map(role => [role.id, role]));
  const unavailableRoles = candidates.filter(candidate => {
    const role = roleById.get(candidate.roleId);
    return !role || !allowedPlatforms.some(platform => hasRolePlatformAccess(rolePermissions(role.permissions), platform));
  });
  if (unavailableRoles.length) return NextResponse.json({ message: "所选角色已停用或没有任何平台登录权限，请重新选择角色" }, { status: 400 });

  const personnelById = new Map(personnelRows.map(row => [row.id, row]));
  const ineligible = candidates.filter(candidate => {
    const row = personnelById.get(candidate.personnelId);
    return !row || row.deletedAt || row.platformUserId || row.status !== PersonnelStatus.ACTIVE || !row.storeId || !row.store || row.store.operationStatus === "CLOSED" || row.store.brand.status !== RecordStatus.ENABLED;
  });
  if (personnelRows.length !== candidates.length || ineligible.length) {
    return NextResponse.json({ message: "部分员工档案已绑定账号、已离职、未分配有效门店或已变化，请刷新列表后重试" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash("12345678", 12);
  try {
    const created = await db.$transaction(async transaction => {
      const result: { personnelId: string; personnelName: string; username: string; roleName: string }[] = [];
      for (const candidate of candidates) {
        const person = personnelById.get(candidate.personnelId)!;
        const store = person.store!;
        const role = roleById.get(candidate.roleId)!;
        const user = await transaction.user.create({
          data: {
            username: candidate.username, realName: person.name, phone: person.phone,
            passwordHash, mustChangePassword: true, type: UserType.CUSTOM,
            status: RecordStatus.ENABLED, roleId: role.id, createdByUserId: access.session!.userId,
            leadH5BrandIds: [store.brand.id], leadH5StoreIds: [store.id], isRegionManager: false,
          },
          select: { id: true },
        });
        const linked = await transaction.personnel.updateMany({
          where: { id: person.id, status: PersonnelStatus.ACTIVE, deletedAt: null, platformUserId: null, storeId: store.id },
          data: { platformAccess: "YES", platformUserId: user.id },
        });
        if (linked.count !== 1) throw new Error("人员档案状态发生变化，请刷新列表后重试");
        result.push({ personnelId: person.id, personnelName: person.name, username: candidate.username, roleName: role.name });
      }
      return result;
    });
    await personnelLog(access.session.userId, "批量生成平台用户", "成功", `生成${created.length}个账号：${created.map(item => `${item.personnelName}（${item.username}）`).join("、")}`);
    return NextResponse.json({ created });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      const conflicts = await db.user.findMany({ where: { username: { in: usernames } }, select: { username: true } });
      return NextResponse.json({ message: "账号已被占用，请修改冲突账号后重试", duplicateUsernames: conflicts.map(item => item.username) }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : "批量生成平台用户失败，请稍后重试";
    await personnelLog(access.session.userId, "批量生成平台用户", "失败", message);
    return NextResponse.json({ message }, { status: 409 });
  }
}

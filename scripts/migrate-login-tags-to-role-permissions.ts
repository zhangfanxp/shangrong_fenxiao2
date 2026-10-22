import { db } from "../lib/db";
import { leadH5PermissionGroups, storeH5PermissionGroups } from "../lib/role-permissions";

function tagSet(value: string | null | undefined) {
  return new Set((value || "").split(/[|｜]/).map(tag => tag.trim()).filter(Boolean));
}

function configuredTags(value: string | undefined, fallback: string) {
  return tagSet(value?.trim() || fallback);
}

function intersects(left: Set<string>, right: Set<string>) {
  return [...left].some(value => right.has(value));
}

async function main() {
  const legacyLeadH5Tags = configuredTags(process.env.LEGACY_LEAD_H5_LOGIN_TAGS, "运营");
  const legacyStoreH5Tags = configuredTags(process.env.LEGACY_STORE_H5_LOGIN_TAGS, "店长｜厨师长");
  const leadH5Permissions = leadH5PermissionGroups.flatMap(group => group.permissions.map(permission => permission.value));
  const storeH5Permissions = storeH5PermissionGroups.flatMap(group => group.permissions.map(permission => permission.value));
  const roles = await db.role.findMany({
    select: { id: true, code: true, name: true, permissions: true, users: { select: { tags: true } } },
  });
  const migrated: Array<{ code: string; name: string; platforms: string[]; permissionCount: number }> = [];

  for (const role of roles) {
    const existing = Array.isArray(role.permissions)
      ? role.permissions.filter((permission): permission is string => typeof permission === "string")
      : [];
    if (existing.includes("*")) continue;
    const roleUserTags = new Set(role.users.flatMap(user => [...tagSet(user.tags)]));
    const additions: string[] = [];
    const platforms: string[] = [];
    if (intersects(roleUserTags, legacyLeadH5Tags) && !existing.some(permission => permission.startsWith("lead-h5:"))) {
      additions.push(...leadH5Permissions);
      platforms.push("运营H5移动端");
    }
    if (intersects(roleUserTags, legacyStoreH5Tags) && !existing.some(permission => permission.startsWith("store-h5:"))) {
      additions.push(...storeH5Permissions);
      platforms.push("门店H5移动端");
    }
    if (!additions.length) continue;
    const permissions = [...new Set([...existing, ...additions])];
    await db.role.update({ where: { id: role.id }, data: { permissions } });
    migrated.push({ code: role.code, name: role.name, platforms, permissionCount: permissions.length });
  }

  process.stdout.write(`${JSON.stringify({ migrated, legacyTags: { leadH5: [...legacyLeadH5Tags], storeH5: [...legacyStoreH5Tags] } })}\n`);
}

main()
  .finally(() => db.$disconnect())
  .catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : "角色权限迁移失败"}\n`);
    process.exitCode = 1;
  });

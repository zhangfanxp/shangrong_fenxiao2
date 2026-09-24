import { leadH5PermissionGroups, storeH5PermissionGroups } from "@/lib/role-permissions";

const permissionValues = (groups: readonly { permissions: readonly { value: string }[] }[]) =>
  groups.flatMap(group => group.permissions.map(permission => permission.value));

export const fixedSystemRoles = [
  { code: "SUPER_ADMIN", name: "超级管理员", defaultPermissions: ["*"] },
  { code: "STORE_MANAGER", name: "店长", defaultPermissions: permissionValues(storeH5PermissionGroups) },
  { code: "HEAD_CHEF", name: "厨师长", defaultPermissions: permissionValues(storeH5PermissionGroups) },
  { code: "SUPERVISOR", name: "督导", defaultPermissions: permissionValues(leadH5PermissionGroups) },
] as const;

export type FixedSystemRoleCode = typeof fixedSystemRoles[number]["code"];

export function getFixedSystemRole(code: string) {
  return fixedSystemRoles.find(role => role.code === code);
}

export function isFixedSystemRoleCode(code: string): code is FixedSystemRoleCode {
  return fixedSystemRoles.some(role => role.code === code);
}

export function isFixedSystemRoleIdentity(name: string, code: string) {
  return fixedSystemRoles.some(role => role.code === code || role.name === name);
}

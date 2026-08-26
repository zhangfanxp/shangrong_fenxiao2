export type PermissionRequirement = string | readonly string[];

const anyPrefix = (permissions: string[], prefix: string) => permissions.some(permission => permission.startsWith(prefix));

export function hasPermission(permissions: string[], requirement: PermissionRequirement) {
  if (permissions.includes("*")) return true;
  const required = typeof requirement === "string" ? [requirement] : requirement;
  return required.some(permission => permissions.includes(permission));
}

export function canAccessPath(pathname: string, permissions: string[]) {
  if (permissions.includes("*")) return true;
  if (pathname === "/lead_pc/forbidden") return true;
  if (pathname === "/lead_pc/dashboard") return hasPermission(permissions, "dashboard:view");
  if (pathname === "/lead_pc/stores/contracts") return hasPermission(permissions, "stores:contracts:view");
  if (pathname === "/lead_pc/stores/list") return hasPermission(permissions, "stores:list:view");
  if (pathname.startsWith("/lead_pc/operations/")) return hasPermission(permissions, "operations:view");
  if (pathname === "/lead_pc/inspection/2") return hasPermission(permissions, ["inspection:view", "store-reviews:query"]);
  if (pathname === "/lead_pc/inspection/4") return hasPermission(permissions, "store-research-records:query");
  if (pathname.startsWith("/lead_pc/inspection/")) return hasPermission(permissions, "inspection:view");
  if (pathname === "/lead_pc/tasks/settings") return hasPermission(permissions, "tasks:settings:view");
  if (pathname === "/lead_pc/tasks/records") return hasPermission(permissions, ["tasks:records:query", "tasks:records:view"]);
  if (pathname === "/lead_pc/staff/0") return hasPermission(permissions, "staff:view") || anyPrefix(permissions, "personnel:");
  if (pathname.startsWith("/lead_pc/staff/")) return hasPermission(permissions, "staff:view");
  if (pathname.startsWith("/lead_pc/training/")) return hasPermission(permissions, "training:view");
  if (pathname.startsWith("/lead_pc/meetings/")) return hasPermission(permissions, "meetings:view");
  if (pathname === "/lead_pc/notifications/publish") return hasPermission(permissions, ["notifications:publish", "notifications:publish:access"]);
  if (pathname === "/lead_pc/notifications/manage") return hasPermission(permissions, "notifications:manage") || anyPrefix(permissions, "notifications:manage:");
  if (pathname === "/lead_pc/settings/roles") return hasPermission(permissions, "settings:roles");
  if (pathname === "/lead_pc/settings/users") return hasPermission(permissions, "settings:users");
  if (pathname === "/lead_pc/settings/dictionaries") return hasPermission(permissions, "settings:dictionaries") || anyPrefix(permissions, "dictionaries:");
  if (pathname === "/lead_pc/settings/assessments") return anyPrefix(permissions, "assessments:");
  if (pathname === "/lead_pc/settings/survey-templates") return anyPrefix(permissions, "research-templates:");
  if (pathname === "/lead_pc/settings/storage") return anyPrefix(permissions, "r2-storage:");
  if (pathname === "/lead_pc/settings/parameters") return hasPermission(permissions, "settings:parameters");
  if (pathname === "/lead_pc/settings/operation-logs") return hasPermission(permissions, ["operation-logs:view", "settings:logs"]);
  return false;
}

export const accessibleLandingPaths = [
  "/lead_pc/dashboard", "/lead_pc/stores/contracts", "/lead_pc/stores/list", "/lead_pc/operations/0", "/lead_pc/inspection/2", "/lead_pc/inspection/4",
  "/lead_pc/tasks/settings", "/lead_pc/tasks/records", "/lead_pc/staff/0", "/lead_pc/training/0", "/lead_pc/meetings/0",
  "/lead_pc/notifications/publish", "/lead_pc/notifications/manage", "/lead_pc/settings/roles", "/lead_pc/settings/users",
  "/lead_pc/settings/dictionaries", "/lead_pc/settings/assessments", "/lead_pc/settings/survey-templates", "/lead_pc/settings/storage", "/lead_pc/settings/parameters", "/lead_pc/settings/operation-logs",
] as const;

export function firstAccessiblePath(permissions: string[]) {
  return accessibleLandingPaths.find(path => canAccessPath(path, permissions)) ?? "/lead_pc/forbidden";
}

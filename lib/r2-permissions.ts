import type { Session } from "@/lib/auth";

export type R2StoragePermission = "query" | "create" | "edit" | "view" | "test" | "enable" | "disable" | "delete";

export function canR2Storage(session: Session, action: R2StoragePermission) {
  return session.permissions.includes("*") || session.permissions.includes(`r2-storage:${action}`);
}

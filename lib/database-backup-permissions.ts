import type { Session } from "@/lib/auth";

export type DatabaseBackupPermission = "query" | "configure" | "manual" | "download" | "delete";

export function canDatabaseBackup(session: Pick<Session, "permissions">, action: DatabaseBackupPermission) {
  return session.permissions.includes("*") || session.permissions.includes(`database-backups:${action}`);
}

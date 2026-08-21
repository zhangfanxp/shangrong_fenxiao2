import type { Session } from "@/lib/auth";

export type OperationLogPermission = "view" | "export";

export function canOperationLog(session: Pick<Session, "permissions">, action: OperationLogPermission) {
  return session.permissions.includes("*")
    || session.permissions.includes(`operation-logs:${action}`)
    || session.permissions.includes("settings:logs");
}

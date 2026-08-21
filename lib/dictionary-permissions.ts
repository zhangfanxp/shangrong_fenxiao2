import type { Session } from "@/lib/auth";

export type DictionaryPermission = "query" | "create" | "edit" | "view" | "enable" | "disable" | "values:view" | "values:edit";

export function canDictionary(session: Session, action: DictionaryPermission) {
  return session.permissions.includes("*")
    || session.permissions.includes("settings:dictionaries")
    || session.permissions.includes(`dictionaries:${action}`)
    || (action === "values:view" && session.permissions.includes("dictionaries:values:edit"));
}

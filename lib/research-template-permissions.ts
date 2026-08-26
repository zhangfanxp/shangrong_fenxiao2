import type { Session } from "@/lib/auth";

export type ResearchTemplatePermission = "query" | "create" | "preview" | "edit" | "view" | "enable" | "disable" | "delete";

export function canResearchTemplate(session: Session, action: ResearchTemplatePermission) {
  return session.permissions.includes("*") || session.permissions.includes(`research-templates:${action}`);
}

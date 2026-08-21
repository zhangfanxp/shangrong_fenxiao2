import type { Session } from "@/lib/auth";

export type AssessmentPermission = "query" | "create" | "preview" | "edit" | "view" | "enable" | "disable" | "delete";

export function canAssessment(session: Session, action: AssessmentPermission) {
  return session.permissions.includes("*") || session.permissions.includes(`assessments:${action}`);
}

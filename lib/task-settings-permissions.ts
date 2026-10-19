export type TaskSettingsAction = "query" | "create" | "view" | "edit" | "preview" | "enable" | "disable" | "delete" | "update";

export function canTaskSettingsAction(permissions: string[], action: TaskSettingsAction) {
  return permissions.includes("*") || permissions.includes("tasks:settings:view") || permissions.includes(`tasks:settings:${action}`);
}

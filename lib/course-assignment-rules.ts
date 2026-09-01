export const assignmentActions = ["query", "view", "learning", "disable", "enable", "batch-disable", "batch-enable"] as const;
export type AssignmentAction = typeof assignmentActions[number];
export type AssignmentStatus = "ENABLED" | "DISABLED";

export function canCourseAssignment(permissions: string[], action: AssignmentAction) {
  return permissions.includes("*") || permissions.includes("training:view") || permissions.includes(`course-assignments:${action}`);
}

export type AssignmentFilters = { courseName?: string; assigneeKeyword?: string; assignStartDate?: string; assignEndDate?: string };
export function assignmentDateError(start?: string, end?: string) {
  for (const date of [start, end]) {
    if (!date) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "分配日期格式不正确";
    const parsed = new Date(`${date}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return "分配日期格式不正确";
  }
  return start && end && start > end ? "分配开始日期不能晚于分配截止日期" : null;
}

// Legacy relations remain effective until explicitly imported into a batch.
export function effectiveCourseAssignment(userId: string) {
  return { userId, user: { status: "ENABLED" as const, role: { status: "ENABLED" as const } }, OR: [{ batchId: null }, { batch: { status: "ENABLED" as const } }] };
}

export type AssignmentRow = {
  id: string; recordNo: string; courseCount: number; userCount: number;
  assignedByName: string; assignedAt: string; assignedAtText: string;
  status: AssignmentStatus; version: number; legacyImported: boolean;
};
export type AssignmentCourse = {
  courseId: string; courseRecordNoSnapshot: string; courseNameSnapshot: string;
  applicablePositionSnapshot: string; coverUrl: string;
};
export type AssignmentDetail = AssignmentRow & { courses: AssignmentCourse[] };
export type AssignmentLearningRow = {
  id: string; userId: string; realName: string; recordNo?: string; courseName?: string; chapterName?: string;
  startedAt?: string | null; endedAt?: string | null; lastActiveAt?: string | null;
  visitStatus?: "ACTIVE" | "ENDED" | "INTERRUPTED" | "LEGACY";
};
export type AssignmentChangeResult = {
  changed: number; skipped: number; failed: number;
  results: { id: string; recordNo?: string; outcome: "changed" | "skipped" | "failed"; message?: string }[];
};

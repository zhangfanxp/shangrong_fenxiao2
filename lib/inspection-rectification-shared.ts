export const RECTIFICATION_STATUSES = ["PENDING", "IN_PROGRESS", "PENDING_ACCEPTANCE", "QUALIFIED", "NO_ACTION"] as const;
export type RectificationStatus = typeof RECTIFICATION_STATUSES[number];
export const RECTIFICATION_LABELS: Record<RectificationStatus, string> = {
  PENDING: "待生成", IN_PROGRESS: "整改中", PENDING_ACCEPTANCE: "待验收", QUALIFIED: "整改合格", NO_ACTION: "无需整改",
};
export const RECTIFICATION_DEADLINES = [{ value: 24, label: "24小时内" }, { value: 72, label: "72小时内" }, { value: 168, label: "一周内" }];
export const RECTIFICATION_DEFAULT_REQUIREMENT = "请抓紧时间整改";
export const RECTIFICATION_TASK_ID = "system-inspection-rectification";

export function rectificationDeadline(generatedAt: Date, hours: number) {
  if (![24, 72, 168].includes(hours)) throw new Error("请选择有效的时间节点");
  return new Date(generatedAt.getTime() + hours * 3_600_000);
}

export function rectificationIsOverdue(dueAt: Date | string, submittedAt?: Date | string | null, now = new Date()) {
  return new Date(submittedAt || now).getTime() > new Date(dueAt).getTime();
}

export function rectificationDateTime(value?: Date | string | null) {
  if (!value) return "-";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(value));
  const read = (type: string) => parts.find(part => part.type === type)?.value || "";
  return `${read("year")}-${read("month")}-${read("day")} ${read("hour")}:${read("minute")}:${read("second")}`;
}

export type RectificationPerson = { id: string; name: string };
export type RectificationPhoto = { id: string; name: string; url: string | null };
export type RectificationInspection = {
  recordNo: string; assessmentDate: string; reviewerName: string; storeName: string; brandName: string;
  assessmentName: string; sectionName: string; subsectionName: string; itemDescription: string;
  problemDescription: string | null; result: string; photos: RectificationPhoto[];
};
export type RectificationRoundDetail = {
  id: string; roundNumber: number; generatedAt: string; deadlineHours: number; dueAt: string;
  responsibleUserId: string; responsibleName: string; requirement: string; ccRecipients: RectificationPerson[];
  submittedAt: string | null; submissionDescription: string | null; photos: RectificationPhoto[];
  acceptedAt: string | null; acceptanceResult: string | null; acceptedByName: string | null;
  rejectionReason: string | null; overdue: boolean;
};
export type RectificationDetail = {
  id: string; recordNo: string; status: RectificationStatus; inspection: RectificationInspection;
  noActionReason: string | null; noActionAt: string | null; noActionByName: string | null;
  rounds: RectificationRoundDetail[];
};

import { Tag } from "antd";

const colors: Record<string, string> = {
  ENABLED: "success", ACTIVE: "success", OPENING: "success", COMPLETED: "success",
  DISABLED: "default", RESIGNED: "default", ACTIVE_PERSONNEL: "success", PENDING: "processing", PREPARING: "processing", TRIAL: "warning",
  EXPIRING: "warning", OVERDUE: "error", TERMINATED: "error", EXPIRED: "error", TERMINATING: "warning", SUSPENDED: "error", CLOSED: "default",
};
const labels: Record<string, string> = {
  ENABLED: "已启用", DISABLED: "已禁用", ACTIVE: "履约中", PENDING: "待生效", EXPIRING: "即将到期", TERMINATED: "已解约", EXPIRED: "已到期",
  PREPARING: "筹备中", TRIAL: "试营业", OPENING: "正式营业", TERMINATING: "解约中", SUSPENDED: "暂停营业", CLOSED: "已停业", COMPLETED: "已完成", OVERDUE: "已逾期", ACTIVE_PERSONNEL: "在职", RESIGNED: "已离职",
};
export function StatusTag({ value }: { value: string }) { return <Tag color={colors[value] || "default"}>{labels[value] || value}</Tag>; }

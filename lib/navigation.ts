import type { ComponentType } from "react";
import {
  AppstoreOutlined, AuditOutlined, BellOutlined, DashboardOutlined, FundOutlined, HomeOutlined,
  PieChartOutlined, ReadOutlined, SettingOutlined, SolutionOutlined, TeamOutlined, UnorderedListOutlined,
} from "@ant-design/icons";
import { canAccessPath } from "@/lib/access-control";

export type NavChild = { key: string; label: string; href: string };
export type NavGroup = { key: string; label: string; icon: ComponentType; children?: NavChild[]; href?: string };

export const navigation: NavGroup[] = [
  { key: "dashboard", label: "仪表板", icon: DashboardOutlined, href: "/lead_pc/dashboard" },
  { key: "stores", label: "门店", icon: HomeOutlined, children: [{ key: "contracts", label: "合同管理", href: "/lead_pc/stores/contracts" }, { key: "list", label: "门店列表", href: "/lead_pc/stores/list" }] },
  { key: "operations", label: "运营", icon: FundOutlined, children: [
    { key: "op-0", label: "目标营业额", href: "/lead_pc/operations/0" },
    { key: "op-1", label: "实际营业额", href: "/lead_pc/operations/1" },
    { key: "op-2", label: "人力成本", href: "/lead_pc/operations/2" },
    { key: "op-3", label: "用工记录", href: "/lead_pc/operations/3" },
    { key: "op-4", label: "千元用量表", href: "/lead_pc/operations/4" },
    { key: "op-5", label: "每日保本营业额", href: "/lead_pc/operations/5" },
    { key: "op-6", label: "每日销售数据上报", href: "/lead_pc/operations/6" },
    { key: "op-7", label: "产品类别销售占比", href: "/lead_pc/operations/7" },
    { key: "op-8", label: "微信私域每日新增", href: "/lead_pc/operations/8" },
    { key: "op-9", label: "线上团购数据", href: "/lead_pc/operations/9" },
    { key: "op-11", label: "每月采销比", href: "/lead_pc/operations/11" },
    { key: "op-12", label: "百日筑基表", href: "/lead_pc/operations/12" },
  ] },
  { key: "inspection", label: "巡店", icon: AuditOutlined, children: [
    { key: "inspection-2", label: "门店稽核评分", href: "/lead_pc/inspection/2" },
    { key: "inspection-3", label: "门店信用得分", href: "/lead_pc/inspection/3" },
    { key: "inspection-4", label: "巡店调研表", href: "/lead_pc/inspection/4" },
    { key: "inspection-assessments", label: "考核表格", href: "/lead_pc/inspection/assessments" },
    { key: "inspection-research-templates", label: "调研模版", href: "/lead_pc/inspection/research-templates" },
  ] },
  { key: "tasks", label: "任务", icon: UnorderedListOutlined, children: [{ key: "task-records", label: "任务记录", href: "/lead_pc/tasks/records" }, { key: "task-analysis", label: "智能分析", href: "/lead_pc/tasks/analysis" }, { key: "task-config", label: "任务设置", href: "/lead_pc/tasks/settings" }] },
  { key: "staff", label: "员工", icon: TeamOutlined, children: [
    { key: "staff-0", label: "人员档案", href: "/lead_pc/staff/0" },
    { key: "staff-2", label: "考勤记录", href: "/lead_pc/staff/2" },
    { key: "staff-3", label: "领用管理", href: "/lead_pc/staff/3" },
    { key: "staff-4", label: "物品管理", href: "/lead_pc/staff/4" },
    { key: "staff-5", label: "优秀员工", href: "/lead_pc/staff/5" },
  ] },
  { key: "training", label: "培训", icon: ReadOutlined, children: [
    { key: "training-0", label: "每日学习", href: "/lead_pc/training/0" },
    { key: "training-1", label: "课程管理", href: "/lead_pc/training/1" },
    { key: "training-3", label: "课程分配记录", href: "/lead_pc/training/3" },
    { key: "training-2", label: "题库管理", href: "/lead_pc/training/2" },
  ] },
  { key: "meetings", label: "会议", icon: AppstoreOutlined, children: ["每月线上会", "月中线下会", "季度线下会"].map((label, i) => ({ key: `meetings-${i}`, label, href: `/lead_pc/meetings/${i}` })) },
  { key: "notifications", label: "通知", icon: BellOutlined, children: [{ key: "notify-publish", label: "发布通知", href: "/lead_pc/notifications/publish" }, { key: "notify-manage", label: "通知管理", href: "/lead_pc/notifications/manage" }] },
  { key: "statistics", label: "统计", icon: PieChartOutlined, children: [{ key: "statistics-roster", label: "花名册一览表", href: "/lead_pc/statistics/roster" }, { key: "statistics-labor-contract-expiry", label: "劳动合同过期预警", href: "/lead_pc/statistics/labor-contract-expiry" }] },
  { key: "settings", label: "设置", icon: SettingOutlined, children: [{ key: "roles", label: "角色管理", href: "/lead_pc/settings/roles" }, { key: "users", label: "用户列表", href: "/lead_pc/settings/users" }, { key: "business-data-sources", label: "业务数据源", href: "/lead_pc/settings/business-data-sources" }, { key: "dict", label: "数据字典", href: "/lead_pc/settings/dictionaries" }, { key: "rest-days", label: "休息日管理", href: "/lead_pc/settings/rest-days" }, { key: "reminders", label: "提醒规则", href: "/lead_pc/settings/reminders" }, { key: "storage", label: "R2存储空间", href: "/lead_pc/settings/storage" }, { key: "backup", label: "数据库备份", href: "/lead_pc/settings/backups" }, { key: "clear", label: "清空业务数据", href: "/lead_pc/settings/clear-data" }, { key: "parameters", label: "系统参数", href: "/lead_pc/settings/parameters" }, { key: "logs", label: "操作日志", href: "/lead_pc/settings/operation-logs" }] },
];

export function navigationForPermissions(permissions: string[]) {
  return navigation.flatMap(group => {
    if (group.href) return canAccessPath(group.href, permissions) ? [group] : [];
    const children = group.children?.filter(item => canAccessPath(item.href, permissions)) ?? [];
    return children.length ? [{ ...group, children }] : [];
  });
}

export function findNavigation(pathname: string, items: NavGroup[] = navigation) {
  for (const group of items) {
    if (group.href === pathname) return { group, child: undefined };
    const child = group.children?.find((item) => item.href === pathname);
    if (child) return { group, child };
  }
  return items[0] ? { group: items[0], child: undefined } : null;
}

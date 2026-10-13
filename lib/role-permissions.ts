export type RolePermissionItem = Readonly<{ value: string; label: string }>;
export type RolePermissionPage = Readonly<{
  key: string;
  label: string;
  description?: string;
  permissions: readonly RolePermissionItem[];
}>;
export type RolePermissionGroup = Readonly<{
  key: string;
  label: string;
  pages: readonly RolePermissionPage[];
  permissions: readonly RolePermissionItem[];
}>;

const page = (key: string, label: string, permissions: readonly RolePermissionItem[], description?: string): RolePermissionPage => ({ key, label, permissions, description });
const group = (key: string, label: string, pages: readonly RolePermissionPage[]): RolePermissionGroup => ({
  key,
  label,
  pages,
  permissions: pages.flatMap(item => item.permissions),
});

export const permissionGroups = [
  group("dashboard", "仪表板", [
    page("dashboard-home", "仪表板页面", [{ value: "dashboard:view", label: "访问" }]),
  ]),
  group("stores", "门店", [
    page("store-contracts", "合同管理页面", [{ value: "stores:contracts:view", label: "访问及管理" }]),
    page("store-list", "门店列表页面", [
      { value: "stores:list:view", label: "查询及查看" },
      { value: "stores:aliases:edit", label: "编辑平台别名" },
      { value: "stores:employees:edit", label: "编辑门店员工" },
    ]),
  ]),
  group("operations", "运营", [
    page("revenue-targets", "目标营业额页面", [
      { value: "revenue-targets:query", label: "查询" },
      { value: "revenue-targets:create", label: "新增" },
      { value: "revenue-targets:export", label: "导出" },
      { value: "revenue-targets:view", label: "查看" },
      { value: "revenue-targets:calculate", label: "立即计算" },
      { value: "revenue-targets:delete", label: "删除" },
    ]),
    page("actual-revenue", "实际营业额页面", [
      { value: "actual-revenue:query", label: "查询" },
      { value: "actual-revenue:import", label: "导入" },
      { value: "actual-revenue:export", label: "导出" },
      { value: "actual-revenue:view", label: "查看" },
      { value: "actual-revenue:set-monthly-target", label: "设置月目标" },
      { value: "actual-revenue:daily-target-preview", label: "生成日目标" },
      { value: "actual-revenue:delete", label: "删除" },
    ]),
    page("labor-costs", "人力成本页面", [
      { value: "labor-costs:query", label: "查询" },
      { value: "labor-costs:view", label: "查看" },
      { value: "labor-costs:export", label: "导出" },
    ]),
    page("labor-records", "用工记录页面", [
      { value: "labor-records:query", label: "查询" },
      { value: "labor-records:view", label: "查看" },
      { value: "labor-records:export", label: "导出" },
    ]),
    page("daily-break-even", "每日保本营业额页面", [
      { value: "daily-break-even:query", label: "查询" },
      { value: "daily-break-even:view", label: "查看" },
      { value: "daily-break-even:export", label: "导出" },
    ]),
    page("daily-sales-report", "每日销售数据上报页面", [
      { value: "daily-sales-report:query", label: "查询" },
      { value: "daily-sales-report:export", label: "导出" },
    ]),
    page("product-category-sales", "产品类别销售占比页面", [
      { value: "product-category-sales:query", label: "查询" },
      { value: "product-category-sales:import", label: "导入" },
      { value: "product-category-sales:export", label: "导出" },
      { value: "product-category-sales:view", label: "查看" },
      { value: "product-category-sales:delete", label: "删除" },
    ]),
    page("wechat-private-daily-new", "微信私域每日新增页面", [
      { value: "wechat-private-daily-new:query", label: "查询" },
      { value: "wechat-private-daily-new:export", label: "导出" },
    ]),
    page("hundred-days", "百日筑基表页面", [
      { value: "hundred-days:query", label: "查询" },
      { value: "hundred-days:export", label: "导出" },
    ]),
    page("monthly-purchase-sales", "每月采销比页面", [
      { value: "monthly-purchase-sales:query", label: "查询" },
      { value: "monthly-purchase-sales:create", label: "新增" },
      { value: "monthly-purchase-sales:import", label: "导入" },
      { value: "monthly-purchase-sales:export", label: "导出" },
      { value: "monthly-purchase-sales:view", label: "查看" },
      { value: "monthly-purchase-sales:edit", label: "编辑" },
      { value: "monthly-purchase-sales:delete", label: "删除" },
    ]),
    page("operations-legacy", "其他运营页面", [{ value: "operations:view", label: "访问（兼容权限）" }], "用于尚未拆分操作权限的运营页面及历史角色兼容"),
  ]),
  group("inspection", "巡店", [
    page("store-reviews", "门店稽核评分页面", [
      { value: "store-reviews:query", label: "查询" },
      { value: "store-reviews:view", label: "查看" },
      { value: "store-reviews:export", label: "导出" },
      { value: "store-reviews:delete", label: "删除" },
    ]),
    page("store-credit-scores", "门店信用得分页面", [
      { value: "store-credit-scores:query", label: "查询" },
      { value: "store-credit-scores:view", label: "查看" },
      { value: "store-credit-scores:export", label: "导出" },
      { value: "store-credit-scores:delete", label: "删除" },
    ]),
    page("store-research-records", "巡店调研表页面", [
      { value: "store-research-records:query", label: "查询" },
      { value: "store-research-records:view", label: "查看" },
      { value: "store-research-records:export", label: "导出" },
      { value: "store-research-records:delete", label: "删除" },
    ]),
    page("assessments", "考核表格页面", [
      { value: "assessments:query", label: "查询" },
      { value: "assessments:create", label: "新增" },
      { value: "assessments:preview", label: "预览" },
      { value: "assessments:edit", label: "编辑" },
      { value: "assessments:view", label: "查看" },
      { value: "assessments:enable", label: "启用" },
      { value: "assessments:disable", label: "禁用" },
      { value: "assessments:delete", label: "删除" },
    ]),
    page("research-templates", "调研模版页面", [
      { value: "research-templates:query", label: "查询" },
      { value: "research-templates:create", label: "新增" },
      { value: "research-templates:preview", label: "预览" },
      { value: "research-templates:edit", label: "编辑" },
      { value: "research-templates:view", label: "查看" },
      { value: "research-templates:enable", label: "启用" },
      { value: "research-templates:disable", label: "禁用" },
      { value: "research-templates:delete", label: "删除" },
    ]),
    page("inspection-legacy", "巡店模块兼容权限", [{ value: "inspection:view", label: "访问及查看" }], "保留历史角色已有访问范围"),
  ]),
  group("tasks", "任务", [
    page("task-settings", "任务设置页面", [{ value: "tasks:settings:view", label: "访问及管理" }]),
    page("task-records", "任务记录页面", [
      { value: "tasks:records:query", label: "查询" },
      { value: "tasks:records:view", label: "查看" },
      { value: "tasks:records:edit", label: "编辑" },
      { value: "tasks:records:export", label: "导出" },
      { value: "tasks:records:analyze", label: "智能分析" },
      { value: "tasks:records:delete", label: "删除" },
    ]),
    page("intelligent-analysis", "智能分析页面", [
      { value: "intelligent-analysis:query", label: "查询" },
      { value: "intelligent-analysis:view", label: "查看" },
      { value: "intelligent-analysis:export", label: "导出" },
      { value: "intelligent-analysis:delete", label: "删除" },
    ]),
  ]),
  group("staff", "员工", [
    page("personnel", "人员档案页面", [
      { value: "personnel:query", label: "查询" },
      { value: "personnel:create", label: "新增" },
      { value: "personnel:edit", label: "编辑" },
      { value: "personnel:view", label: "查看" },
      { value: "personnel:import", label: "导入" },
      { value: "personnel:export", label: "导出" },
      { value: "personnel:salary", label: "调薪" },
      { value: "personnel:position", label: "调岗" },
      { value: "personnel:issues", label: "查看领用记录" },
      { value: "personnel:return", label: "物品返还" },
      { value: "personnel:resign", label: "离职" },
      { value: "personnel:delete", label: "删除" },
      { value: "personnel:sensitive", label: "查看敏感数据" },
    ]),
    page("attendance-records", "考勤记录页面", [
      { value: "attendance-records:query", label: "查询" },
      { value: "attendance-records:view", label: "查看" },
      { value: "attendance-records:export", label: "导出" },
    ]),
    page("item-requisitions", "领用管理页面", [
      { value: "item-requisitions:query", label: "查询" },
      { value: "item-requisitions:create", label: "新增" },
      { value: "item-requisitions:edit", label: "编辑" },
      { value: "item-requisitions:view", label: "查看" },
      { value: "item-requisitions:export", label: "导出" },
    ]),
    page("workwear-inventory", "物品管理页面", [
      { value: "workwear-inventory:query", label: "查询" },
      { value: "workwear-inventory:create", label: "新增" },
      { value: "workwear-inventory:view", label: "查看" },
      { value: "workwear-inventory:edit", label: "编辑" },
      { value: "workwear-inventory:inbound", label: "入库" },
      { value: "workwear-inventory:enable", label: "启用" },
      { value: "workwear-inventory:disable", label: "禁用" },
      { value: "workwear-inventory:export", label: "导出" },
      { value: "workwear-inventory:delete", label: "删除" },
    ]),
    page("staff-legacy", "员工模块兼容权限", [{ value: "staff:view", label: "访问及查看" }], "保留历史角色已有访问范围"),
  ]),
  group("training", "培训", [
    page("daily-learning", "每日学习页面", [
      { value: "daily-learning:query", label: "查询" },
      { value: "daily-learning:create", label: "新增" },
      { value: "daily-learning:view", label: "查看" },
      { value: "daily-learning:update", label: "更新任务" },
      { value: "daily-learning:edit", label: "编辑" },
      { value: "daily-learning:delete", label: "删除" },
    ]),
    page("courses", "课程管理页面", [
      { value: "courses:query", label: "查询" },
      { value: "courses:create", label: "新增" },
      { value: "courses:view", label: "查看" },
      { value: "courses:edit", label: "编辑" },
      { value: "courses:enable", label: "启用" },
      { value: "courses:disable", label: "禁用" },
      { value: "courses:delete", label: "删除" },
    ]),
    page("course-lessons", "课程课时", [
      { value: "course-lessons:create", label: "新增" },
      { value: "course-lessons:view", label: "查看" },
      { value: "course-lessons:edit", label: "编辑" },
      { value: "course-lessons:delete", label: "删除" },
      { value: "course-lessons:order", label: "排序" },
    ]),
    page("course-assignments", "课程分配记录页面", [
      { value: "course-assignments:query", label: "查询" },
      { value: "course-assignments:view", label: "查看" },
      { value: "course-assignments:learning", label: "查看学习记录" },
      { value: "course-assignments:disable", label: "停用" },
      { value: "course-assignments:enable", label: "启用" },
      { value: "course-assignments:batch-disable", label: "批量停用" },
      { value: "course-assignments:batch-enable", label: "批量启用" },
    ]),
    page("training-legacy", "培训模块兼容权限", [{ value: "training:view", label: "访问及查看" }], "保留历史角色已有访问范围"),
  ]),
  group("meetings", "会议", [
    page("monthly-online-meetings", "每月线上会页面", [
      { value: "monthly-online-meetings:query", label: "查询" },
      { value: "monthly-online-meetings:view", label: "查看" },
      { value: "monthly-online-meetings:attendance", label: "签到" },
      { value: "monthly-online-meetings:export", label: "导出" },
    ]),
    page("mid-month-offline-meetings", "月中线下会页面", [
      { value: "mid-month-offline-meetings:query", label: "查询" },
      { value: "mid-month-offline-meetings:view", label: "查看" },
      { value: "mid-month-offline-meetings:attendance", label: "签到" },
      { value: "mid-month-offline-meetings:export", label: "导出" },
    ]),
    page("quarterly-offline-meetings", "季度线下会页面", [
      { value: "quarterly-offline-meetings:query", label: "查询" },
      { value: "quarterly-offline-meetings:view", label: "查看" },
      { value: "quarterly-offline-meetings:attendance", label: "签到" },
      { value: "quarterly-offline-meetings:export", label: "导出" },
    ]),
    page("meetings-legacy", "会议模块兼容权限", [{ value: "meetings:view", label: "访问及查看" }], "保留历史角色已有访问范围"),
  ]),
  group("notifications", "通知", [
    page("notification-publish", "发布通知页面", [
      { value: "notifications:publish:access", label: "访问" },
      { value: "notifications:publish:save", label: "保存及发布" },
      { value: "notifications:publish:select-users", label: "选择接收用户" },
      { value: "notifications:publish", label: "全部发布（兼容权限）" },
    ]),
    page("notification-manage", "通知管理页面", [
      { value: "notifications:manage:query", label: "查询" },
      { value: "notifications:manage:view", label: "查看" },
      { value: "notifications:manage:export", label: "导出" },
      { value: "notifications:manage:stop", label: "停止" },
      { value: "notifications:manage", label: "全部管理（兼容权限）" },
    ]),
  ]),
  group("statistics", "统计", [
    page("personnel-roster", "花名册一览表页面", [
      { value: "statistics:roster:query", label: "查询" },
      { value: "statistics:roster:view", label: "查看" },
      { value: "statistics:roster:export", label: "导出" },
      { value: "statistics:roster:sensitive", label: "查看敏感信息" },
      { value: "statistics:roster:export-sensitive", label: "导出敏感信息" },
      { value: "statistics:roster:headquarters", label: "查看总部人员" },
    ]),
    page("labor-contract-expiry", "劳动合同过期预警页面", [{ value: "statistics:labor-contract-expiry:view", label: "查看" }]),
  ]),
  group("settings", "设置", [
    page("settings-roles", "角色管理页面", [{ value: "settings:roles", label: "访问及管理" }]),
    page("settings-users", "用户列表页面", [{ value: "settings:users", label: "访问及管理" }]),
    page("settings-parameters", "系统参数页面", [{ value: "settings:parameters", label: "访问及管理" }]),
    page("rest-days", "休息日管理页面", [
      { value: "rest-days:query", label: "查询" },
      { value: "rest-days:create", label: "新增" },
      { value: "rest-days:view", label: "查看" },
      { value: "rest-days:edit", label: "编辑" },
      { value: "rest-days:calculate", label: "立即计算" },
      { value: "rest-days:export", label: "导出" },
      { value: "rest-days:delete", label: "删除" },
      { value: "settings:rest-days", label: "访问（兼容权限）" },
    ]),
    page("store-labor-standards", "门店用工标准页面", [
      { value: "store-labor-standards:query", label: "查询" },
      { value: "store-labor-standards:create", label: "新增" },
      { value: "store-labor-standards:view", label: "查看" },
      { value: "store-labor-standards:edit", label: "编辑" },
      { value: "store-labor-standards:export", label: "导出" },
      { value: "store-labor-standards:delete", label: "删除" },
      { value: "settings:store-labor-standards", label: "访问（兼容权限）" },
    ]),
    page("business-data-sources", "业务数据源页面", [
      { value: "business-data-sources:query", label: "查询" },
      { value: "business-data-sources:create", label: "新增" },
      { value: "business-data-sources:view", label: "查看" },
      { value: "business-data-sources:edit", label: "编辑" },
      { value: "business-data-sources:delete", label: "删除" },
      { value: "business-data-sources:export", label: "导出" },
    ]),
    page("dictionaries", "数据字典页面", [
      { value: "dictionaries:query", label: "查询" },
      { value: "dictionaries:create", label: "新增" },
      { value: "dictionaries:edit", label: "编辑" },
      { value: "dictionaries:view", label: "查看" },
      { value: "dictionaries:enable", label: "启用" },
      { value: "dictionaries:disable", label: "停用" },
      { value: "dictionaries:values:view", label: "查看枚举值" },
      { value: "dictionaries:values:edit", label: "编辑枚举值" },
      { value: "settings:dictionaries", label: "访问（兼容权限）" },
    ]),
    page("r2-storage", "R2存储空间页面", [
      { value: "r2-storage:query", label: "查询" },
      { value: "r2-storage:create", label: "新增" },
      { value: "r2-storage:edit", label: "编辑" },
      { value: "r2-storage:view", label: "查看" },
      { value: "r2-storage:test", label: "测试" },
      { value: "r2-storage:enable", label: "启用" },
      { value: "r2-storage:disable", label: "停用" },
      { value: "r2-storage:delete", label: "删除" },
    ]),
    page("database-backups", "数据库备份页面", [
      { value: "database-backups:query", label: "查询" },
      { value: "database-backups:configure", label: "定时设置" },
      { value: "database-backups:manual", label: "手动备份" },
      { value: "database-backups:download", label: "下载" },
      { value: "database-backups:delete", label: "删除" },
    ]),
    page("operation-logs", "操作日志页面", [
      { value: "operation-logs:view", label: "查看" },
      { value: "operation-logs:export", label: "导出" },
      { value: "settings:logs", label: "访问（兼容权限）" },
    ]),
  ]),
] as const;

export const leadH5PermissionGroups = [
  group("lead-h5-workbench", "工作台", [
    page("lead-h5-home", "运营工作台页面", [{ value: "lead-h5:home:view", label: "访问" }]),
  ]),
  group("lead-h5-inspection", "巡店", [
    page("lead-h5-front-hall", "前厅稽核评分页面", [
      { value: "lead-h5:front-hall:view", label: "查看评分表" },
      { value: "lead-h5:front-hall:submit", label: "上传照片及提交" },
    ]),
    page("lead-h5-back-kitchen", "后厨稽核评分页面", [
      { value: "lead-h5:back-kitchen:view", label: "查看评分表" },
      { value: "lead-h5:back-kitchen:submit", label: "上传照片及提交" },
    ]),
    page("lead-h5-store-credit", "门店信用评分页面", [
      { value: "lead-h5:store-credit:view", label: "查看评分表" },
      { value: "lead-h5:store-credit:submit", label: "上传照片及提交" },
    ]),
    page("lead-h5-store-research", "门店调研表页面", [
      { value: "lead-h5:store-research:view", label: "查看调研表" },
      { value: "lead-h5:store-research:submit", label: "填写及提交" },
    ]),
  ]),
  group("lead-h5-tasks", "任务", [
    page("lead-h5-task-center", "任务中心页面", [
      { value: "lead-h5:tasks:query", label: "查询" },
      { value: "lead-h5:tasks:view", label: "查看" },
      { value: "lead-h5:tasks:attachment", label: "管理附件" },
      { value: "lead-h5:tasks:submit", label: "提交任务" },
    ]),
  ]),
  group("lead-h5-training", "培训", [
    page("lead-h5-daily-learning", "每日学习页面", [
      { value: "lead-h5:daily-learning:view", label: "查看" },
      { value: "lead-h5:daily-learning:record", label: "录制及上传" },
      { value: "lead-h5:daily-learning:complete", label: "完成学习" },
    ]),
    page("lead-h5-online-courses", "线上课堂页面", [
      { value: "lead-h5:courses:query", label: "查询" },
      { value: "lead-h5:courses:view", label: "查看课程及课时" },
      { value: "lead-h5:courses:learn", label: "学习及记录进度" },
      { value: "lead-h5:courses:download", label: "下载课程资料" },
    ]),
  ]),
  group("lead-h5-notifications", "通知", [
    page("lead-h5-notification-center", "通知中心页面", [
      { value: "lead-h5:notifications:view", label: "查看" },
      { value: "lead-h5:notifications:read", label: "标记已读及确认" },
    ]),
  ]),
] as const;

export const storeH5PermissionGroups = [
  group("store-h5-workbench", "工作台", [
    page("store-h5-home", "门店工作台页面", [{ value: "store-h5:home:view", label: "访问" }]),
  ]),
  group("store-h5-my-store", "我的门店", [
    page("store-h5-my-store-home", "我的门店页面", [{ value: "store-h5:my-store:view", label: "访问" }]),
    page("store-h5-my-store-employees", "员工页面", [
      { value: "store-h5:my-store:employees:query", label: "查询员工" },
      { value: "store-h5:my-store:employees:create", label: "新增员工" },
      { value: "store-h5:my-store:employees:view", label: "查看员工详情" },
      { value: "store-h5:my-store:employees:resign", label: "办理员工离职" },
    ]),
    page("store-h5-my-store-cost", "成本页面", [
      { value: "store-h5:my-store:cost:view", label: "查看" },
      { value: "store-h5:my-store:cost:edit", label: "编辑" },
    ]),
    page("store-h5-my-store-aliases", "别名页面", [
      { value: "store-h5:my-store:aliases:view", label: "查看" },
      { value: "store-h5:my-store:aliases:edit", label: "编辑" },
    ]),
  ]),
  group("store-h5-tasks", "任务", [
    page("store-h5-task-center", "任务中心页面", [
      { value: "store-h5:tasks:query", label: "查询" },
      { value: "store-h5:tasks:view", label: "查看" },
      { value: "store-h5:tasks:attachment", label: "管理附件" },
      { value: "store-h5:tasks:submit", label: "提交任务" },
    ]),
  ]),
  group("store-h5-training", "培训", [
    page("store-h5-daily-learning", "每日学习页面", [
      { value: "store-h5:daily-learning:query", label: "查询" },
      { value: "store-h5:daily-learning:view", label: "查看" },
      { value: "store-h5:daily-learning:record", label: "录制及上传" },
      { value: "store-h5:daily-learning:complete", label: "完成学习" },
    ]),
    page("store-h5-online-courses", "线上课堂页面", [
      { value: "store-h5:courses:query", label: "查询" },
      { value: "store-h5:courses:view", label: "查看课程及课时" },
      { value: "store-h5:courses:learn", label: "学习及记录进度" },
      { value: "store-h5:courses:download", label: "下载课程资料" },
    ]),
  ]),
  group("store-h5-notifications", "通知", [
    page("store-h5-notification-center", "通知中心页面", [
      { value: "store-h5:notifications:view", label: "查看" },
      { value: "store-h5:notifications:read", label: "标记已读及确认" },
    ]),
  ]),
  group("store-h5-attendance", "考勤", [
    page("store-h5-daily-attendance", "每日考勤页面", [
      { value: "store-h5:daily-attendance:view", label: "查看" },
      { value: "store-h5:daily-attendance:submit", label: "提交考勤及补正" },
    ]),
  ]),
] as const;

export const rolePermissionPlatforms = [
  { key: "lead-pc", label: "PC运营端", shortLabel: "PC", description: "运营后台页面、数据与管理操作", groups: permissionGroups },
  { key: "lead-h5", label: "运营H5移动端", shortLabel: "运营H5", description: "督导及运营人员移动巡店与学习功能", groups: leadH5PermissionGroups },
  { key: "store-h5", label: "门店H5移动端", shortLabel: "门店H5", description: "门店员工任务、学习、考勤与门店档案功能", groups: storeH5PermissionGroups },
] as const;

export type RolePermissionPlatformKey = typeof rolePermissionPlatforms[number]["key"];

export const permissionValuesByPlatform = Object.fromEntries(rolePermissionPlatforms.map(platform => [platform.key, platform.groups.flatMap(item => item.permissions.map(permission => permission.value))])) as Record<RolePermissionPlatformKey, string[]>;
export const permissionValues = rolePermissionPlatforms.flatMap(platform => permissionValuesByPlatform[platform.key]);

export type RolePermissionRequirement = string | readonly string[];

export function hasRolePermission(permissions: readonly string[], requirement: RolePermissionRequirement) {
  if (permissions.includes("*")) return true;
  const required = typeof requirement === "string" ? [requirement] : requirement;
  return required.some(permission => permissions.includes(permission));
}

export function hasRolePlatformAccess(permissions: readonly string[], platform: RolePermissionPlatformKey) {
  return permissions.includes("*") || permissionValuesByPlatform[platform].some(permission => permissions.includes(permission));
}

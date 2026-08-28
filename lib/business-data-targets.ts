export const businessDataTargets = [
  {
    value: "contracts",
    label: "合同记录",
    description: "清空合同及返利记录，并同步清空门店和门店关联业务数据",
  },
  {
    value: "stores",
    label: "门店档案",
    description: "清空门店及关联的人员、巡店、调研和任务执行记录，保留合同记录",
  },
  {
    value: "storeReviews",
    label: "门店稽核评分记录",
    description: "清空稽核评分、评分明细及历史考核结果，保留考核表格配置",
  },
  {
    value: "researchRecords",
    label: "巡店调研记录",
    description: "清空运营端正式提交的门店调研记录，保留调研模版配置",
  },
  {
    value: "personnel",
    label: "人员档案及变动记录",
    description: "清空人员档案、薪资调整和岗位调动历史，保留系统用户账号",
  },
  {
    value: "tasks",
    label: "任务设置及执行记录",
    description: "清空任务设置、任务记录、提交明细、附件记录及调度记录",
  },
  {
    value: "dailyLearning",
    label: "每日学习数据",
    description: "清空学习计划、分配人员和学习完成记录，保留 R2 存储配置",
  },
  {
    value: "meetings",
    label: "会议及签到记录",
    description: "清空每月线上会、月中线下会及参会记录，保留对应通知",
  },
  {
    value: "notifications",
    label: "通知及阅读记录",
    description: "清空通知、接收和阅读记录，并同步清空由通知生成的会议记录",
  },
  {
    value: "operationLogs",
    label: "操作日志",
    description: "清空已有操作日志；本次清空操作仍会生成一条新的审计日志",
  },
] as const;

export const businessDataTargetValues = [
  "contracts",
  "stores",
  "storeReviews",
  "researchRecords",
  "personnel",
  "tasks",
  "dailyLearning",
  "meetings",
  "notifications",
  "operationLogs",
] as const;

export type BusinessDataTarget = (typeof businessDataTargetValues)[number];

export const businessDataTargetLabels = Object.fromEntries(
  businessDataTargets.map(target => [target.value, target.label]),
) as Record<BusinessDataTarget, string>;

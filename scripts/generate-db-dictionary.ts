import { loadEnvConfig } from "@next/env";
import { writeFile } from "node:fs/promises";
import path from "node:path";

type TableMeta = { chineseName: string; purpose: string };
type ColumnRow = {
  tableName: string; columnName: string; columnType: string; isNullable: "YES" | "NO";
  columnKey: string; columnComment: string; ordinalPosition: number;
};
type IndexRow = { tableName: string; columnName: string; indexName: string; nonUnique: bigint | number; seqInIndex: bigint | number };

const TABLE_META: Record<string, TableMeta> = {
  Role: { chineseName: "角色", purpose: "存储平台角色、角色类型、启停状态及功能权限集合。" },
  User: { chineseName: "用户", purpose: "存储平台登录账号、人员身份、角色归属和最近登录信息。" },
  Assessment: { chineseName: "考核表配置", purpose: "存储巡店、督导等考核表的基础配置、评分模式和版本信息。" },
  AssessmentBrandScope: { chineseName: "考核表品牌范围", purpose: "存储考核表适用的品牌及考核类型范围。" },
  AssessmentRecord: { chineseName: "考核记录", purpose: "存储按考核表产生的配置快照、评分结果和实际总分。" },
  ResearchTemplate: { chineseName: "调研模板", purpose: "存储门店调研、竞品调研等模板配置及版本信息。" },
  ResearchTemplateBrand: { chineseName: "调研模板品牌", purpose: "存储调研模板与适用品牌之间的关联关系。" },
  ResearchTemplateRecord: { chineseName: "调研提交记录", purpose: "存储用户按调研模板提交的门店调研内容和模板快照。" },
  BusinessDataSource: { chineseName: "业务数据源", purpose: "存储可配置业务数据源的名称、编码、展示与权限设置。" },
  BusinessDataSourceField: { chineseName: "业务数据源字段", purpose: "存储业务数据源中每个字段的类型、角色、校验和展示配置。" },
  BusinessDataSourceSequence: { chineseName: "业务数据源编号序列", purpose: "维护业务数据源记录编号的顺序值。" },
  LeadH5ResearchSequence: { chineseName: "运营端调研编号序列", purpose: "维护运营 H5 调研提交记录编号的顺序值。" },
  Brand: { chineseName: "品牌", purpose: "存储餐饮品牌的编码、名称和启停状态。" },
  Contract: { chineseName: "合同", purpose: "存储门店合作合同、期限、费用、合作方式和附件信息。" },
  ContractRebate: { chineseName: "合同返利", purpose: "存储合同约定的返利年度、比例和金额。" },
  Store: { chineseName: "门店", purpose: "存储门店档案、所属品牌、经营状态、地址及人员配置。" },
  MonthlyPurchaseSalesRatio: { chineseName: "月度采销比", purpose: "存储门店每月进货、销售和采销比数据。" },
  MonthlyPurchaseSalesSequence: { chineseName: "月度采销比编号序列", purpose: "维护月度采销比记录编号的顺序值。" },
  MonthlyPurchaseSalesImportBatch: { chineseName: "月度采销比导入批次", purpose: "存储月度采销比批量导入任务及处理统计。" },
  MonthlyPurchaseSalesImportFailure: { chineseName: "月度采销比导入失败明细", purpose: "存储月度采销比导入失败的行号、原始数据和失败原因。" },
  ProductCategorySalesMonthly: { chineseName: "品类月度销售", purpose: "存储门店月度品类销售汇总及来源信息。" },
  ProductCategorySalesDetail: { chineseName: "品类销售明细", purpose: "存储月度品类销售中各品类的销售额、占比和排序。" },
  ProductCategorySalesSequence: { chineseName: "品类销售编号序列", purpose: "维护品类月度销售记录编号的顺序值。" },
  ProductCategorySalesImportBatch: { chineseName: "品类销售导入批次", purpose: "存储品类销售批量导入任务及处理统计。" },
  ProductCategorySalesImportFailure: { chineseName: "品类销售导入失败明细", purpose: "存储品类销售导入失败的行号、原始数据和失败原因。" },
  StoreCost: { chineseName: "门店成本", purpose: "存储门店月度固定成本、变动成本和成本备注。" },
  ActualRevenueMonthly: { chineseName: "月度实际营业额", purpose: "存储门店月度实际营业额汇总、目标和完成情况。" },
  ActualRevenueDaily: { chineseName: "每日实际营业额", purpose: "存储月度营业额记录下每天的实际营业额。" },
  ActualRevenueSequence: { chineseName: "实际营业额编号序列", purpose: "维护实际营业额记录编号的顺序值。" },
  StoreMonthlyTarget: { chineseName: "门店月度目标", purpose: "存储门店月度营业目标、计算参数和目标状态。" },
  StoreMonthlyTargetSequence: { chineseName: "月度目标编号序列", purpose: "维护门店月度目标记录编号的顺序值。" },
  StoreDailyTarget: { chineseName: "门店每日目标", purpose: "存储月度目标拆分到每天的营业额目标。" },
  LeadH5Review: { chineseName: "运营端巡店评分", purpose: "存储运营人员对门店前厅、后厨或信用等考核的提交结果。" },
  LeadH5ReviewItem: { chineseName: "巡店评分明细", purpose: "存储巡店评分中每个检查项的得分、问题和备注。" },
  LeadH5ReviewPhoto: { chineseName: "巡店评分照片", purpose: "存储巡店评分所上传照片的 R2 对象信息。" },
  LeadH5ReviewSequence: { chineseName: "巡店评分编号序列", purpose: "维护巡店评分记录编号的顺序值。" },
  PersonnelSequence: { chineseName: "人员档案编号序列", purpose: "维护人员档案记录编号的顺序值。" },
  InventoryItemSequence: { chineseName: "物品编号序列", purpose: "维护库存物品记录编号的顺序值。" },
  InventoryTransactionSequence: { chineseName: "库存流水编号序列", purpose: "维护库存出入库流水编号的顺序值。" },
  ItemRequisitionSequence: { chineseName: "领用单编号序列", purpose: "维护物品领用单记录编号的顺序值。" },
  InventoryItem: { chineseName: "库存物品", purpose: "存储工服等物品档案、库存数量、预警值和启停状态。" },
  ItemRequisition: { chineseName: "物品领用单", purpose: "存储人员领用物品的数量、状态和经办信息。" },
  ItemRequisitionReturn: { chineseName: "物品归还记录", purpose: "存储领用物品的归还数量、时间和经办人。" },
  InventoryTransaction: { chineseName: "库存流水", purpose: "存储物品入库、领用、归还和调整产生的库存变动流水。" },
  Personnel: { chineseName: "人员档案", purpose: "存储员工基础信息、岗位、薪资、社保及任职状态。" },
  DailyAttendanceRecord: { chineseName: "每日考勤记录", purpose: "存储门店每日考勤提交单、汇总工时和提交状态。" },
  DailyAttendanceItem: { chineseName: "每日考勤明细", purpose: "存储考勤单内每位员工的考勤类型、工时和备注。" },
  DailyAttendanceSequence: { chineseName: "考勤记录编号序列", purpose: "维护每日考勤记录编号的顺序值。" },
  SalaryHistory: { chineseName: "薪资调整历史", purpose: "存储人员工资调整前后数值、生效日期和操作人。" },
  PositionHistory: { chineseName: "岗位调动历史", purpose: "存储人员岗位、门店或品牌调动的前后信息。" },
  Task: { chineseName: "任务设置", purpose: "存储周期或临时任务的执行规则、表单配置和适用范围。" },
  TaskExecutorRole: { chineseName: "任务执行角色", purpose: "存储任务与允许执行该任务的角色关联。" },
  TaskBrand: { chineseName: "任务适用品牌", purpose: "存储任务与适用品牌之间的关联关系。" },
  TaskRecord: { chineseName: "任务实例", purpose: "存储按任务规则生成的具体执行实例及完成状态。" },
  TaskSchedulerRun: { chineseName: "任务调度运行记录", purpose: "存储每日任务生成调度的运行状态、结果和错误信息。" },
  ScheduledJobRun: { chineseName: "通用定时任务运行记录", purpose: "存储各类定时作业每日执行状态、结果和错误信息。" },
  TaskSubmission: { chineseName: "任务提交", purpose: "存储任务实例的正式提交信息、执行人和配置快照。" },
  TaskSubmissionSequence: { chineseName: "任务提交编号序列", purpose: "维护任务提交记录编号的顺序值。" },
  TaskSubmissionItem: { chineseName: "任务提交项", purpose: "存储任务提交中每个表单项的值、附件及 AI 分析结果。" },
  TaskAiAnalysis: { chineseName: "任务智能分析", purpose: "存储任务提交的 AI 分析汇总、结论和人工复核信息。" },
  TaskAiAnalysisItem: { chineseName: "任务智能分析明细", purpose: "存储任务中每个分析项的输入、输出和合格判断。" },
  TaskAiAnalysisSequence: { chineseName: "智能分析编号序列", purpose: "维护任务智能分析记录编号的顺序值。" },
  TaskAttachment: { chineseName: "任务附件", purpose: "存储任务执行过程中上传到 R2 的附件元数据。" },
  DictionaryItem: { chineseName: "基础字典项", purpose: "存储系统内通用下拉字典的标签、值和排序。" },
  DataDictionary: { chineseName: "数据字典配置", purpose: "存储可维护数据字典文件的名称、编码和版本。" },
  OperationLog: { chineseName: "操作日志", purpose: "存储用户在系统中的页面操作、结果、明细和客户端信息。" },
  OperationLogSequence: { chineseName: "操作日志编号序列", purpose: "维护操作日志记录编号的顺序值。" },
  RestDay: { chineseName: "休息日", purpose: "存储品牌或门店年度休息日、节假日类型和备注。" },
  RestDaySequence: { chineseName: "休息日编号序列", purpose: "维护休息日记录编号的顺序值。" },
  RestDayYearLock: { chineseName: "休息日年度锁", purpose: "存储年度休息日生成或维护时使用的并发锁。" },
  StoreLaborStandard: { chineseName: "门店用工标准", purpose: "存储各品牌按考核金额区间配置的标准用工人数。" },
  StoreLaborStandardSequence: { chineseName: "门店用工标准编号序列", purpose: "维护门店用工标准记录编号的每日顺序值。" },
  StoreLaborStandardBrandLock: { chineseName: "门店用工标准品牌锁", purpose: "存储按品牌维护用工标准时使用的并发锁。" },
  StoreLaborStandardPolicyVersion: { chineseName: "门店用工标准版本", purpose: "保存品牌用工标准的不可变版本快照，供历史用工记录引用。" },
  StoreLaborRecord: { chineseName: "用工记录", purpose: "按门店和日期保存销售、考勤与标准快照及用工状态。" },
  LaborCostPolicyVersion: { chineseName: "人工成本政策版本", purpose: "存储人工成本核算政策的版本、配置和生效范围。" },
  DailyLearningPlan: { chineseName: "每日学习计划", purpose: "存储每日学习任务的主题、内容、适用范围和发布时间。" },
  DailyLearningAssignee: { chineseName: "每日学习指派", purpose: "存储学习计划与指定学习人员的关联关系。" },
  DailyLearningProgress: { chineseName: "每日学习进度", purpose: "存储用户对每日学习计划的完成、录音和确认信息。" },
  DailyLearningSequence: { chineseName: "每日学习编号序列", purpose: "维护每日学习计划记录编号的顺序值。" },
  CourseDraft: { chineseName: "课程草稿", purpose: "存储尚未发布课程的名称、简介和编辑状态。" },
  Course: { chineseName: "在线课程", purpose: "存储已发布课程的基础信息、封面、状态和版本。" },
  CourseAssignment: { chineseName: "课程分配", purpose: "存储课程学习任务的分配方式、期限和状态。" },
  CourseAssignmentBatch: { chineseName: "课程分配批次", purpose: "存储一次课程分配操作的批次信息和处理结果。" },
  CourseAssignmentCourse: { chineseName: "分配批次课程", purpose: "存储课程分配批次所包含的课程及快照。" },
  CourseAssignmentUser: { chineseName: "课程分配用户", purpose: "存储课程分配与具体学习用户之间的关联。" },
  CourseAssignmentUserScope: { chineseName: "课程分配用户范围", purpose: "存储分配用户对应的品牌、门店等适用范围快照。" },
  CourseAssignmentSequence: { chineseName: "课程分配编号序列", purpose: "维护课程分配记录编号的顺序值。" },
  CourseBrand: { chineseName: "课程适用品牌", purpose: "存储课程与适用品牌之间的关联关系。" },
  CourseLesson: { chineseName: "课程课节", purpose: "存储课程中的视频、音频或文档课节及 R2 文件信息。" },
  CourseLearningProgress: { chineseName: "课程学习进度", purpose: "存储用户对整门课程的总体学习进度和完成状态。" },
  CourseLessonProgress: { chineseName: "课节学习进度", purpose: "存储用户对单个课节的播放位置、进度和完成状态。" },
  CourseSequence: { chineseName: "课程编号序列", purpose: "维护课程记录编号的顺序值。" },
  CourseLessonVisit: { chineseName: "课节访问记录", purpose: "存储用户每次进入课程课节的访问会话和停留信息。" },
  CourseLessonSequence: { chineseName: "课节编号序列", purpose: "维护课程课节记录编号的顺序值。" },
  Notification: { chineseName: "通知", purpose: "存储系统通知内容、发布模式、时间和状态。" },
  NotificationRecipient: { chineseName: "通知接收人", purpose: "存储通知与接收用户之间的关联及阅读确认状态。" },
  NotificationSequence: { chineseName: "通知编号序列", purpose: "维护通知记录编号的顺序值。" },
  Meeting: { chineseName: "会议", purpose: "存储线上或线下会议的主题、时间、地点和参与范围。" },
  MeetingParticipant: { chineseName: "会议参与人", purpose: "存储会议参与人员及签到、出席状态。" },
  R2StorageConfig: { chineseName: "R2存储空间配置", purpose: "存储 Cloudflare R2 存储桶连接参数、加密凭证和状态。" },
  R2StorageReference: { chineseName: "R2存储空间引用", purpose: "存储业务模块对 R2 存储配置的占用关系，防止误删。" },
  R2StorageTest: { chineseName: "R2连接测试", purpose: "存储 R2 存储桶连接测试文件及测试结果。" },
  DatabaseBackupSetting: { chineseName: "数据库备份设置", purpose: "存储数据库定时备份开关、频率、时间和目标 R2 存储桶。" },
  DatabaseBackupFile: { chineseName: "数据库备份文件", purpose: "存储每次全量数据库备份的 R2 文件、校验值和执行状态。" },
  DeploymentMigration: { chineseName: "部署迁移记录", purpose: "存储部署过程中一次性数据库变更的版本、校验值和执行结果。" },
};

const FIELD_LABELS: Record<string, string> = {
  id: "主键ID", code: "编码", name: "名称", type: "类型", status: "状态", version: "版本号", recordNo: "记录编号",
  createdAt: "创建时间", updatedAt: "更新时间", deletedAt: "删除时间", startedAt: "开始时间", completedAt: "完成时间",
  createdByUserId: "创建人用户ID", createdByName: "创建人姓名", updatedByUserId: "更新人用户ID", updatedByName: "更新人姓名",
  partTimeHeadcount: "今日兼职人数", partTimeHours: "今日兼职工时", partTimeLaborCost: "兼职用工成本",
  partTimeLaborCostSnapshot: "兼职用工成本快照", partTimeActualLaborCost: "今日兼职用工成本",
  username: "登录账号", passwordHash: "密码哈希", realName: "真实姓名", phone: "手机号码", permissions: "权限集合",
  remark: "备注", description: "说明", detail: "详细信息", result: "执行结果", error: "错误信息", errorMessage: "错误信息",
  dateKey: "日期键", nextValue: "下一个序号", sortOrder: "排序序号", sort: "排序序号", activeKey: "有效记录键",
  configVersion: "配置版本", configSnapshot: "配置快照", configFileName: "配置文件名", configJson: "配置JSON",
  fileName: "文件名称", originalName: "原始文件名", objectKey: "对象存储键", mimeType: "文件媒体类型", size: "文件大小", sizeBytes: "文件大小（字节）",
  checksumSha256: "SHA-256校验值", durationSeconds: "执行耗时（秒）", executionDate: "执行日期", scheduledTime: "计划执行时间",
  executionTimes: "执行时间集合", weekdays: "执行星期集合", frequency: "执行频率", enabled: "是否启用", scheduleKey: "调度唯一键", activeLockKey: "运行锁键",
  accessKeyIdEncrypted: "加密访问密钥ID", secretAccessKeyEncrypted: "加密访问密钥", accountId: "Cloudflare账户ID", bucketName: "存储桶名称", endpoint: "访问端点",
  signedUrlExpireSeconds: "签名链接有效秒数", r2StorageId: "R2存储配置ID", r2ConfigId: "R2存储配置ID", r2StorageNameSnapshot: "R2配置名称快照",
  bucketNameSnapshot: "存储桶名称快照", businessType: "业务类型", businessId: "业务记录ID",
  brandId: "品牌ID", brandName: "品牌名称", brandCode: "品牌编码", storeId: "门店ID", storeName: "门店名称", roleId: "角色ID", userId: "用户ID",
  taskId: "任务ID", taskRecordId: "任务实例ID", courseId: "课程ID", lessonId: "课节ID", personnelId: "人员ID", contractId: "合同ID",
  assessmentId: "考核表ID", submissionId: "提交记录ID", notificationId: "通知ID", meetingId: "会议ID",
  year: "年份", month: "月份", day: "日期", date: "日期", executionTime: "执行时间", publishedAt: "发布时间", submittedAt: "提交时间",
  amount: "金额", actualAmount: "实际金额", targetAmount: "目标金额", totalAmount: "总金额", score: "得分", totalScore: "总分", actualTotalScore: "实际总分",
  itemCount: "项目数量", sectionCount: "章节数量", subsectionCount: "子章节数量", totalCount: "总数量", successCount: "成功数量", failureCount: "失败数量",
  source: "数据来源", sourceType: "来源类型", systemSources: "组合系统来源", value: "数据值", label: "显示标签", content: "内容", title: "标题", subject: "主题",
  address: "地址", longitude: "经度", latitude: "纬度", email: "电子邮箱", gender: "性别", birthday: "出生日期",
  joinedAt: "入职时间", resignedAt: "离职时间", effectiveDate: "生效日期", operationDate: "操作日期", operationTime: "操作时间",
  ip: "IP地址", client: "客户端", page: "页面", action: "操作动作", required: "是否必填", isRequired: "是否必填",
  isActive: "是否有效", isCompleted: "是否完成", completed: "是否完成", deleted: "是否删除", locked: "是否锁定",
  revenueAmount: "营业额", discountAmount: "优惠金额", operatingIncome: "营业收入", orderCount: "订单数", dinerCount: "就餐人数", tableCount: "开台数",
  preDiscountPerCapita: "折前人均消费", postDiscountPerCapita: "折后人均消费", preDiscountAvgOrder: "折前订单均价", postDiscountAvgOrder: "折后订单均价",
  tableOpenRate: "开台率", tableTurnoverRate: "翻台率", seatOccupancyRate: "上座率", avgDiningDurationMinutes: "平均用餐时长（分钟）",
  statMonth: "统计月份", businessDate: "营业日期", backupType: "备份类型", tags: "标签", unit: "单位", specification: "规格",
};

const FIELD_MEANINGS: Record<string, string> = {
  id: "数据库记录的唯一主键标识。", passwordHash: "经过单向哈希处理的登录密码，不保存可还原的密码明文。",
  permissions: "以 JSON 数组保存角色拥有的页面和操作权限标识。", accessKeyIdEncrypted: "加密保存的 R2 API Access Key ID。",
  secretAccessKeyEncrypted: "加密保存的 R2 API Secret Access Key。", checksumSha256: "备份文件内容的 SHA-256 完整性校验值。",
  objectKey: "文件在 R2 存储桶中的唯一对象路径。", configSnapshot: "业务发生时固化的配置 JSON，避免后续配置变化影响历史记录。",
  activeLockKey: "用于限制同一时刻只能运行一个数据库备份任务的唯一锁。", scheduleKey: "用于防止同一个定时时点被重复执行的唯一标识。",
  executionTimes: "以 JSON 数组保存每天需要触发备份的 HH:mm 时间。", weekdays: "以 JSON 数组保存每周需要执行的星期序号（1至7）。",
  systemSources: "以 JSON 数组保存业务数据源组合使用的系统来源标识。",
};

const TOKEN_LABELS: Record<string, string> = {
  access: "权限", actual: "实际", active: "有效", address: "地址", acknowledged: "确认", after: "后", ai: "AI", alias: "别名", aliases: "别名", amount: "金额", analysis: "分析", analyzed: "分析", app: "应用", applicable: "适用", applied: "应用", archive: "归档", assessment: "考核", assigned: "指派", assignment: "分配", at: "时间", attended: "出席",
  assignee: "被指派人", attachment: "附件", attendance: "考勤", auto: "自动", available: "可用", base: "基础", batch: "批次", birthday: "生日",
  avg: "平均", before: "前", belonging: "归属", box: "箱", brand: "品牌", brands: "品牌集合", business: "业务", by: "人", bytes: "字节", calendar: "日历", capita: "人均",
  capture: "捕获", category: "品类", channel: "渠道", chapter: "章节", checked: "已", chef: "厨师长", check: "检查", city: "城市", checksum: "校验值", client: "客户端", code: "编码", coefficient: "系数",
  completed: "完成", completion: "完成", component: "组件", config: "配置", contact: "联系人", consumed: "使用", content: "内容", contract: "合同", cooperation: "合作", cost: "成本", courseware: "课件",
  count: "数量", course: "课程", cover: "封面", created: "创建", creator: "创建人", current: "当前", daily: "每日", data: "数据", date: "日期", day: "日期", days: "天数",
  deadline: "截止", default: "默认", deleted: "删除", department: "部门", deposit: "押金", description: "说明", detail: "明细", dining: "用餐", direction: "方向",
  design: "设计", discount: "折扣", dish: "菜品", district: "区县", document: "文档", dormitory: "宿舍", douyin: "抖音", draft: "草稿", due: "到期", duplicate: "重复", duration: "耗时", effective: "生效", employee: "员工", enabled: "启用",
  end: "结束", ended: "结束", error: "错误", excel: "Excel", execution: "执行", executor: "执行人", expires: "过期", expiry: "到期", expire: "过期", failed: "失败", failure: "失败", fallbacks: "回退值",
  fee: "费用", field: "字段", file: "文件", finance: "财务", first: "首次", fixed: "固定", formal: "正式", friday: "周五", frequency: "频率", front: "前厅", full: "全量",
  h5: "H5", headcount: "人数", headquarter: "总部", hire: "入职", holiday: "节假日", home: "家庭", hourly: "小时", hour: "小时", hours: "小时",
  headquarters: "总部", hint: "提示", id: "ID", ids: "ID集合", import: "导入", imported: "已导入", in: "签到", income: "收入", include: "是否计入", index: "索引", inserted: "新增", inventory: "库存", is: "是否", iso: "ISO",
  item: "项目", items: "项目集合", job: "作业", key: "键", kuaishou: "快手", label: "标签", labor: "人工", laike: "来客", last: "最近", lead: "运营端", learned: "学习", learner: "学员", learning: "学习",
  leave: "请假", legal: "法定", legacy: "历史", lesson: "课节", level: "级别", limit: "上限", location: "地点", lock: "锁", login: "登录", manage: "管理",
  manager: "负责人", manual: "人工", material: "材料", max: "最高", meeting: "会议", meituan: "美团", message: "消息", mime: "媒体", minutes: "分钟", mode: "模式", monday: "周一",
  month: "月份", monthly: "月度", name: "名称", new: "新", next: "下一个", no: "编号", notification: "通知", object: "对象", occupancy: "上座",
  number: "号码", offset: "偏移", old: "原", on: "时", open: "开台", operated: "操作", operating: "营业", operation: "操作", operator: "操作人", order: "订单", organization: "组织", original: "原始",
  other: "其他", overtime: "加班", owner: "业主", part: "兼职", participant: "参与人", password: "密码", percent: "百分比", per: "每", period: "周期", person: "人员",
  personnel: "人员", phone: "手机", photo: "照片", plan: "计划", platform: "平台", policy: "政策", position: "岗位", post: "折后", pre: "折前", previous: "上期",
  price: "价格", progress: "进度", prompt: "提示词", property: "物业", province: "省份", publish: "发布", published: "发布", publisher: "发布人", purchase: "采购",
  qualified: "合格", quantity: "数量", r2: "R2", rate: "率", ratio: "比例", raw: "原始", read: "阅读", real: "真实", reason: "原因", rebate: "返利", recipient: "接收人", record: "记录", rest: "休息", revenue: "营业额", row: "行", rows: "行集合", rule: "规则",
  recording: "录音", reference: "引用", refunded: "已退", region: "区域", related: "关联", release: "发布日期", remark: "备注", rent: "租金", request: "请求",
  requisition: "领用", requisitioned: "领用", require: "需要", required: "必填", requires: "是否需要", research: "调研", resignation: "离职", resigned: "离职", responsible: "负责人",
  result: "结果", return: "归还", returned: "归还", review: "评分", reviewer: "评分人", role: "角色", salary: "薪资", sale: "销售", sales: "销售",
  saturday: "周六", schedule: "调度", scheduled: "计划", scheduler: "调度器", score: "得分", seconds: "秒", secret: "密钥", seat: "座位", section: "章节",
  security: "社保", sequence: "序列", service: "服务", sha256: "SHA-256", show: "显示", sign: "签约", signed: "签名", size: "大小", skipped: "跳过",
  saved: "保存", setting: "设置", snapshot: "快照", social: "社会", sort: "排序", source: "来源", specification: "规格", specified: "指定", start: "开始", stat: "统计", status: "状态", storage: "存储",
  stock: "库存", stopped: "停止", store: "门店", student: "学员", subsection: "子章节", submission: "提交", submit: "提交", submitted: "提交", success: "成功",
  summary: "汇总", sunday: "周日", supervisor: "督导", supplementary: "补充", table: "桌台", tag: "标签", tags: "标签", target: "目标", targets: "目标集合", task: "任务", template: "模板", trial: "试营业",
  test: "测试", text: "文本", thursday: "周四", time: "时间", times: "时间集合", title: "标题", total: "总计", transaction: "流水", triggered: "触发",
  tuesday: "周二", type: "类型", unit: "单位", unique: "唯一", unqualified: "不合格", updated: "更新", uploader: "上传人", url: "链接", user: "用户",
  username: "用户名", utilities: "水电", value: "值", version: "版本", video: "视频", visit: "访问", wednesday: "周三", week: "周", weekday: "星期",
  values: "值集合", weekdays: "星期集合", weekly: "每周", weight: "权重", workday: "工作日", wages: "工资", year: "年份", years: "年数",
};

function splitIdentifier(value: string) {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").split(/[_\s]+/).filter(Boolean);
}

function fieldLabel(name: string) {
  if (FIELD_LABELS[name]) return FIELD_LABELS[name];
  return splitIdentifier(name).map(token => TOKEN_LABELS[token.toLowerCase()] || token).join("");
}

function fieldMeaning(row: ColumnRow, table: TableMeta, label: string) {
  if (row.columnComment.trim()) return row.columnComment.trim();
  if (FIELD_MEANINGS[row.columnName]) return FIELD_MEANINGS[row.columnName];
  if (row.columnName.endsWith("Snapshot")) return `业务发生时固化的${label.replace(/快照$/, "")}快照，避免源数据后续变化影响历史记录。`;
  if (row.columnName.endsWith("Id") && row.columnName !== "id") return `关联记录的${label}。`;
  if (/json/i.test(row.columnType)) return `以 JSON 结构保存的${label}。`;
  if (row.columnName.endsWith("At")) return `${label}对应的时间点。`;
  if (row.columnName.endsWith("Date") || row.columnName === "date") return `${label}对应的业务日期。`;
  if (/^(is|has|include|required|enabled|completed|deleted|locked)/.test(row.columnName)) return `标识${label}。`;
  return `${table.chineseName}记录中的${label}。`;
}

function escapeCell(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("|", "\\|").replace(/[\r\n]+/g, " ").trim();
}

function shanghaiTimestamp() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

async function main() {
  loadEnvConfig(process.cwd());
  const { db } = await import("@/lib/db");
  try {
    const [columns, indexes] = await Promise.all([
      db.$queryRawUnsafe<ColumnRow[]>(`SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName, COLUMN_TYPE AS columnType, IS_NULLABLE AS isNullable, COLUMN_KEY AS columnKey, COLUMN_COMMENT AS columnComment, ORDINAL_POSITION AS ordinalPosition FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME, ORDINAL_POSITION`),
      db.$queryRawUnsafe<IndexRow[]>(`SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName, INDEX_NAME AS indexName, NON_UNIQUE AS nonUnique, SEQ_IN_INDEX AS seqInIndex FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`),
    ]);
    const indexMap = new Map<string, IndexRow[]>();
    for (const index of indexes) {
      const key = `${index.tableName}.${index.columnName}`;
      indexMap.set(key, [...(indexMap.get(key) || []), index]);
    }
    const tables = new Map<string, ColumnRow[]>();
    for (const column of columns) tables.set(column.tableName, [...(tables.get(column.tableName) || []), column]);

    const lines = [
      "# 数据库数据字典",
      "",
      `> 数据源：当前项目所连接的 MySQL 数据库；生成时间（Asia/Shanghai）：${shanghaiTimestamp()}。`,
      "> 页面会直接读取本文件。后续数据库结构变化时，只需按现有章节和六列表格格式更新本文件，无需修改页面代码。",
      "",
    ];
    for (const [tableName, tableColumns] of tables) {
      const meta = TABLE_META[tableName] || { chineseName: tableName, purpose: `存储 ${tableName} 相关业务数据。` };
      lines.push(`## ${tableName} | ${meta.chineseName}`, "", `> 作用：${meta.purpose}`, "", "| 字段英文名 | 中文名 | 字段类型 | 数据内容（意义） | 是否主键 | 索引 |", "| --- | --- | --- | --- | --- | --- |");
      for (const column of tableColumns) {
        const label = fieldLabel(column.columnName);
        const primary = column.columnKey === "PRI";
        const fieldIndexes = (indexMap.get(`${tableName}.${column.columnName}`) || []).map(index => {
          if (index.indexName === "PRIMARY") return "主键：PRIMARY";
          return `${Number(index.nonUnique) === 0 ? "唯一" : "普通"}：${index.indexName}${Number(index.seqInIndex) > 1 ? `（第${Number(index.seqInIndex)}列）` : ""}`;
        });
        const type = `${column.columnType}${column.isNullable === "YES" ? " NULL" : " NOT NULL"}`;
        lines.push(`| ${escapeCell(column.columnName)} | ${escapeCell(label)} | ${escapeCell(type)} | ${escapeCell(fieldMeaning(column, meta, label))} | ${primary ? "是" : "否"} | ${fieldIndexes.length ? fieldIndexes.map(escapeCell).join("；") : "—"} |`);
      }
      lines.push("");
    }
    const outputPath = path.join(process.cwd(), "db_dict.md");
    await writeFile(outputPath, `${lines.join("\n")}\n`, "utf8");
    process.stdout.write(`数据库数据字典已生成：${outputPath}（${tables.size}张表，${columns.length}个字段）\n`);
  } finally {
    await db.$disconnect();
  }
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : "数据库数据字典生成失败"}\n`);
  process.exitCode = 1;
});

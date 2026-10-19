import { Card, Descriptions } from "antd";
import { redirect } from "next/navigation";
import { AssessmentList } from "@/components/assessment-list";
import { ActualRevenueList } from "@/components/actual-revenue-list";
import { RevenueTargetList } from "@/components/revenue-target-list";
import { ClearBusinessData } from "@/components/clear-business-data";
import { DictionaryManagement } from "@/components/dictionary-management";
import { OperationLogList } from "@/components/operation-log-list";
import { MidMonthOfflineMeetingList, MonthlyOnlineMeetingList, QuarterlyOfflineMeetingList } from "@/components/monthly-online-meeting-list";
import { PageHeader } from "@/components/page-header";
import { RoleManagement } from "@/components/role-management";
import { ResearchTemplateList } from "@/components/research-template-list";
import { R2StorageList } from "@/components/r2-storage-list";
import { DatabaseBackup } from "@/components/database-backup";
import { StoreReviewList } from "@/components/store-review-list";
import { StoreCreditScoreList } from "@/components/store-credit-score-list";
import { StoreResearchRecordList } from "@/components/store-research-record-list";
import { UserManagement } from "@/components/user-management";
import { DailyLearningList } from "@/components/daily-learning-list";
import { CourseManagement } from "@/components/course-management";
import { CourseAssignmentList } from "@/components/course-assignment-list";
import { WorkwearInventoryList } from "@/components/workwear-inventory-list";
import { ItemRequisitionList } from "@/components/item-requisition-list";
import { AttendanceRecordList } from "@/components/attendance-record-list";
import { LaborCostList } from "@/components/labor-cost-list";
import { LaborRecordList } from "@/components/labor-record-list";
import { RestDayList } from "@/components/rest-day-list";
import { StoreLaborStandardList } from "@/components/store-labor-standard-list";
import { BusinessDataSourceList } from "@/components/business-data-source-list";
import { PersonnelRosterList } from "@/components/personnel-roster-list";
import { MonthlyPurchaseSalesRatioList } from "@/components/monthly-purchase-sales-ratio-list";
import { ProductCategorySalesRatioList } from "@/components/product-category-sales-ratio-list";
import { WechatPrivateDailyNewList } from "@/components/wechat-private-daily-new-list";
import { HundredDaysFoundationList } from "@/components/hundred-days-foundation-list";
import { DailySalesReportList } from "@/components/daily-sales-report-list";
import { OnlineGroupBuyList } from "@/components/online-group-buy-list";
import { DailyBreakEvenList } from "@/components/daily-break-even-list";
import { EmployeeAttendanceMonthlyList } from "@/components/employee-attendance-monthly-list";
import { getPlatformConfig, platformAssetUrl } from "@/lib/platform-config";
import { requirePageAccess } from "@/lib/auth";
import { db } from "@/lib/db";
import { serializeStoreReview, storeReviewDataScope, storeReviewSelect } from "@/lib/store-reviews";
import { serializeStoreCreditScore, storeCreditScoreDataScope, storeCreditScoreFilterWhere, storeCreditScoreSelect } from "@/lib/store-credit-scores";
import { serializeStoreResearch, storeResearchDataScope, storeResearchSelect } from "@/lib/store-research-records";
import { actualRevenueDataScope, actualRevenueListSelect, serializeActualRevenue } from "@/lib/actual-revenue";
import { revenueTargetDataScope, revenueTargetListSelect, serializeRevenueTarget } from "@/lib/revenue-targets";
import { attendanceRecordDataScope, attendanceRecordListSelect, serializeAttendanceRecord } from "@/lib/attendance-records";
import { canLaborCost, laborCostDataScope, laborCostRecordSelect, serializeLaborCostRecord } from "@/lib/labor-costs";
import { canPersonnelRoster, personnelRosterDataScope, personnelRosterSelect, serializePersonnelRoster } from "@/lib/personnel-roster";
import { canMonthlyPurchaseSales, monthlyPurchaseSalesDataScope, monthlyPurchaseSalesSelect, serializeMonthlyPurchaseSales } from "@/lib/monthly-purchase-sales-ratios";
import { canProductCategorySales, productCategorySalesDataScope, productCategorySalesListSelect, serializeProductCategorySales } from "@/lib/product-category-sales-ratios";
import { queryEmployeeAttendanceMonthlyRows } from "@/lib/employee-attendance-monthly";
import { DeploymentDataTransfer } from "@/components/deployment-data-transfer";

const titles: Record<string, { title: string; description: string }> = {
  "settings/backups": { title: "数据库备份", description: "将可独立恢复的 MySQL 全量备份安全保存至 Cloudflare R2" },
  "settings/deployment-data": { title: "数据导入导出", description: "加密导出和迁移角色、数据字典、业务模板及系统配置" },
  "inspection/2": { title: "门店稽核评分", description: "查询、查看及管理门店前厅、后厨等稽核评分记录" },
  "inspection/3": { title: "门店信用得分", description: "查询和管理运营移动端正式提交的门店信用评分结果" },
  "operations/0": { title: "目标营业额", description: "管理门店月度营业目标及每日目标分解" },
  "operations/1": { title: "实际营业额", description: "管理门店月度实际经营数据及目标" },
  "operations/2": { title: "人力成本", description: "按门店和考勤日期汇总全职、兼职及当日用工成本" },
  "operations/3": { title: "用工记录", description: "按门店和日期对比实际用工与品牌用工标准" },
  "operations/4": { title: "千元用量表", description: "查询和导出门店千元用量数据" },
  "operations/5": { title: "保本营业额", description: "按品牌、门店和业务日期查询每日保本营业额及达标情况" },
  "operations/6": { title: "每日销售数据上报", description: "按品牌、门店和业务日期查询每日销售及渠道业绩数据" },
  "operations/7": { title: "产品类别销售占比", description: "查询门店月度菜品大类销售结构" },
  "operations/8": { title: "微信私域每日新增", description: "按门店和业务日期查询每日新增微信好友数据" },
  "operations/9": { title: "线上团购数据", description: "按品牌、门店和业务日期查询各线上渠道及线下订单占比" },
  "operations/11": { title: "每月采销比", description: "查询并维护门店月度销售额、要货金额及采销比" },
  "operations/12": { title: "百日筑基表", description: "按门店、周次和团购平台查询百日筑基经营数据" },
  "inspection/4": { title: "巡店调研表", description: "查询、查看及管理运营 H5 正式提交的门店调研记录" },
  "inspection/assessments": { title: "考核表格", description: "配置平台检查、督导及运营考核评分模板" },
  "inspection/research-templates": { title: "调研模版", description: "配置门店调研、竞品调研等标准化调研表单" },
  "staff/4": { title: "物品管理", description: "管理员工工装及领用物资基础档案和库存" },
  "staff/5": { title: "优秀员工", description: "查询和查看优秀员工记录" },
  "staff/3": { title: "领用管理", description: "管理员工工装及物资领用记录" },
  "staff/2": { title: "考勤记录", description: "查询门店每日员工考勤及兼职用工情况" },
  "notifications/publish": { title: "发布通知", description: "创建定时通知，指定接收用户并在发布日期 06:00 自动发布" },
  "statistics/roster": { title: "花名册一览表", description: "集中查看员工花名册统计信息" },
  "statistics/labor-contract-expiry": { title: "劳动合同过期预警", description: "查看员工劳动合同到期及预警信息" },
  "statistics/attendance-monthly": { title: "员工出勤月度汇总表", description: "按月份、门店和员工汇总每日考勤提交数据" },
  "training/0": { title: "每日学习", description: "按 ISO 周制定移动端每日学习计划，并跟踪学员完成情况" },
  "training/1": { title: "课程管理", description: "管理线上培训课程、课程课时及课件" },
  "training/3": { title: "课程分配记录", description: "查询课程分配批次及学员学习情况" },
  "training/2": { title: "题库管理", description: "维护培训题库及题目内容" },
  "meetings/0": { title: "每月线上会", description: "查询和管理每月线上会议及实际参会情况" },
  "meetings/1": { title: "月中线下会", description: "查询和管理月中线下会议及实际参会情况" },
  "meetings/2": { title: "季度线下会", description: "查询和管理季度线下会议及实际参会情况" },
  "tasks/settings": { title: "任务设置", description: "管理每日、每周、每月、临时及日历任务模板" }, "tasks/calendar-templates": { title: "日历任务模版", description: "维护日历任务日期、当天说明及备注" }, "tasks/records": { title: "任务记录", description: "查看门店任务执行与完成情况" }, "tasks/analysis": { title: "智能分析", description: "查看任务执行结果的AI智能分析记录" },
  "settings/rest-days": { title: "休息日管理", description: "管理法定节假日及系统特殊休息日期" },
  "settings/store-labor-standards": { title: "门店用工标准", description: "按品牌和金额区间维护门店标准用工人数" },
  "settings/roles": { title: "角色管理", description: "管理系统角色以及页面、功能按钮权限" }, "settings/users": { title: "用户列表", description: "维护平台用户账号、角色和使用状态" }, "settings/business-data-sources": { title: "业务数据源", description: "管理任务、考核及调研模版的数据字段映射" }, "settings/dictionaries": { title: "数据字典", description: "统一维护业务枚举及下拉选项" }, "settings/storage": { title: "R2存储空间", description: "管理平台 Cloudflare R2 存储桶及访问参数" }, "settings/parameters": { title: "系统参数", description: "维护平台信息与考勤参数" }, "settings/operation-logs": { title: "操作日志", description: "追溯系统关键操作及执行结果" }, "settings/clear-data": { title: "清空业务数据", description: "查看各清理项目涉及的数据表、主要字段和关联影响；仅限超级管理员执行" },
};
const pageTitle = (section: string, page: string) => titles[`${section}/${page}`] ?? { title: "功能模块", description: "该模块已接入统一导航、权限和页面规范，可按业务规则逐步配置数据字段。" };

export default async function GenericPage({ params }: { params: Promise<{ section: string; page: string }> }) {
  const { section, page } = await params; const key = `${section}/${page}`;
  if (key === "settings/survey-templates") redirect("/lead_pc/inspection/research-templates");
  const session = await requirePageAccess(`/lead_pc/${section}/${page}`); const meta = pageTitle(section, page);
  if (key === "operations/0") {
    const where = await revenueTargetDataScope(session);
    const [initialRows, initialTotal] = await db.$transaction([
      db.storeMonthlyTarget.findMany({ where, select: revenueTargetListSelect, orderBy: [{ targetMonth: "desc" }, { storeNameSnapshot: "asc" }], take: 20 }),
      db.storeMonthlyTarget.count({ where }),
    ]);
    return <main className="page-wrap"><PageHeader {...meta} /><RevenueTargetList permissions={session.permissions} initialRows={initialRows.map(serializeRevenueTarget)} initialTotal={initialTotal} /></main>;
  }
  if (key === "operations/1") {
    const where = await actualRevenueDataScope(session);
    const [initialRows, initialTotal] = await db.$transaction([
      db.actualRevenueMonthly.findMany({ where, select: actualRevenueListSelect, orderBy: [{ statMonth: "desc" }, { storeNameSnapshot: "asc" }], take: 20 }),
      db.actualRevenueMonthly.count({ where }),
    ]);
    return <main className="page-wrap"><PageHeader {...meta} /><ActualRevenueList permissions={session.permissions} initialRows={initialRows.map(serializeActualRevenue)} initialTotal={initialTotal} /></main>;
  }
  if (key === "operations/2") {
    const [initialRows, initialTotal] = canLaborCost(session, "query")
      ? await (async () => {
        const where = await laborCostDataScope(session);
        return db.$transaction([
          db.dailyAttendanceRecord.findMany({ where, select: laborCostRecordSelect, orderBy: [{ attendanceDate: "desc" }, { createdAt: "desc" }], take: 20 }),
          db.dailyAttendanceRecord.count({ where }),
        ]);
      })()
      : [[], 0] as const;
    return <main className="page-wrap"><PageHeader {...meta} /><LaborCostList permissions={session.permissions} initialRows={initialRows.map(serializeLaborCostRecord)} initialTotal={initialTotal} /></main>;
  }
  if (key === "operations/3") return <main className="page-wrap"><PageHeader {...meta} /><LaborRecordList permissions={session.permissions} /></main>;
  if (key === "operations/5") return <main className="page-wrap"><PageHeader {...meta} /><DailyBreakEvenList permissions={session.permissions} /></main>;
  if (key === "operations/6") return <main className="page-wrap"><PageHeader {...meta} /><DailySalesReportList permissions={session.permissions} /></main>;
  if (key === "operations/8") return <main className="page-wrap"><PageHeader {...meta} /><WechatPrivateDailyNewList permissions={session.permissions} /></main>;
  if (key === "operations/9") return <main className="page-wrap"><PageHeader {...meta} /><OnlineGroupBuyList permissions={session.permissions} /></main>;
  if (key === "operations/12") return <main className="page-wrap"><PageHeader {...meta} /><HundredDaysFoundationList permissions={session.permissions} /></main>;
  if (key === "operations/7") {
    const [initialRows, initialTotal] = canProductCategorySales(session, "query")
      ? await (async () => {
        const where = await productCategorySalesDataScope(session);
        return db.$transaction([
          db.productCategorySalesMonthly.findMany({ where, select: productCategorySalesListSelect, orderBy: [{ year: "desc" }, { month: "desc" }, { storeNameSnapshot: "asc" }], take: 20 }),
          db.productCategorySalesMonthly.count({ where }),
        ]);
      })()
      : [[], 0] as const;
    return <main className="page-wrap"><PageHeader {...meta} /><ProductCategorySalesRatioList permissions={session.permissions} initialRows={initialRows.map(serializeProductCategorySales)} initialTotal={initialTotal} /></main>;
  }
  if (key === "operations/11") {
    const [initialRows, initialTotal] = canMonthlyPurchaseSales(session, "query")
      ? await (async () => {
        const where = await monthlyPurchaseSalesDataScope(session);
        return db.$transaction([
          db.monthlyPurchaseSalesRatio.findMany({ where, select: monthlyPurchaseSalesSelect, orderBy: [{ year: "desc" }, { month: "desc" }, { storeNameSnapshot: "asc" }], take: 20 }),
          db.monthlyPurchaseSalesRatio.count({ where }),
        ]);
      })()
      : [[], 0] as const;
    return <main className="page-wrap"><PageHeader {...meta} /><MonthlyPurchaseSalesRatioList permissions={session.permissions} currentUserName={session.realName} initialRows={initialRows.map(serializeMonthlyPurchaseSales)} initialTotal={initialTotal} /></main>;
  }
  if (key === "inspection/2") {
    const where = { AND: [await storeReviewDataScope(session), { reviewType: { in: ["FRONT_HALL_AUDIT", "BACK_KITCHEN_AUDIT"] } }] };
    const [initialRows, initialTotal] = await db.$transaction([
      db.leadH5Review.findMany({ where, select: storeReviewSelect, orderBy: [{ assessmentDate: "desc" }, { createdAt: "desc" }, { recordNo: "desc" }], take: 20 }),
      db.leadH5Review.count({ where }),
    ]);
    return <main className="page-wrap"><PageHeader {...meta} /><StoreReviewList permissions={session.permissions} initialRows={initialRows.map(serializeStoreReview)} initialTotal={initialTotal} /></main>;
  }
  if (key === "inspection/3") {
    const where = { AND: [await storeCreditScoreDataScope(session), storeCreditScoreFilterWhere({})] };
    const [initialRows, initialTotal] = await db.$transaction([
      db.leadH5Review.findMany({ where, select: storeCreditScoreSelect, orderBy: [{ assessmentDate: "desc" }, { id: "desc" }], take: 20 }),
      db.leadH5Review.count({ where }),
    ]);
    return <main className="page-wrap"><PageHeader {...meta} /><StoreCreditScoreList permissions={session.permissions} initialRows={initialRows.map(serializeStoreCreditScore)} initialTotal={initialTotal} /></main>;
  }
  if (key === "inspection/4") {
    const where = { AND: [await storeResearchDataScope(session), { status: "SUBMITTED" }] };
    const [initialRows, initialTotal] = await db.$transaction([
      db.researchTemplateRecord.findMany({ where, select: storeResearchSelect, orderBy: [{ submittedAt: "desc" }, { id: "desc" }], take: 20 }),
      db.researchTemplateRecord.count({ where }),
    ]);
    return <main className="page-wrap"><PageHeader {...meta} /><StoreResearchRecordList permissions={session.permissions} initialRows={initialRows.map(serializeStoreResearch)} initialTotal={initialTotal} /></main>;
  }
  if (key === "inspection/assessments") return <main className="page-wrap"><PageHeader {...meta} /><AssessmentList permissions={session.permissions} /></main>;
  if (key === "staff/2") {
    const where = await attendanceRecordDataScope(session);
    const [initialRows, initialTotal] = await db.$transaction([
      db.dailyAttendanceRecord.findMany({ where, select: attendanceRecordListSelect, orderBy: [{ attendanceDate: "desc" }, { createdAt: "desc" }], take: 20 }),
      db.dailyAttendanceRecord.count({ where }),
    ]);
    return <main className="page-wrap"><PageHeader {...meta} /><AttendanceRecordList permissions={session.permissions} initialRows={initialRows.map(serializeAttendanceRecord)} initialTotal={initialTotal} /></main>;
  }
  if (key === "statistics/roster") {
    const where = await personnelRosterDataScope(session);
    const [initialRows, initialTotal] = await db.$transaction([
      db.personnel.findMany({ where, select: personnelRosterSelect, orderBy: [{ status: "asc" }, { hireDate: "desc" }, { id: "desc" }], take: 20 }),
      db.personnel.count({ where }),
    ]);
    const exposeSensitive = canPersonnelRoster(session, "sensitive");
    return <main className="page-wrap"><PageHeader {...meta} /><PersonnelRosterList permissions={session.permissions} initialRows={initialRows.map(row => serializePersonnelRoster(row, exposeSensitive))} initialTotal={initialTotal} /></main>;
  }
  if (key === "statistics/attendance-monthly") {
    const initial = await queryEmployeeAttendanceMonthlyRows(session, {}, 1, 20);
    return <main className="page-wrap"><PageHeader {...meta} /><EmployeeAttendanceMonthlyList permissions={session.permissions} initialRows={initial.rows} initialTotal={initial.total} /></main>;
  }
  if (key === "staff/4") return <main className="page-wrap"><PageHeader {...meta} /><WorkwearInventoryList permissions={session.permissions} currentUserName={session.realName} /></main>;
  if (key === "staff/3") return <main className="page-wrap"><PageHeader {...meta} /><ItemRequisitionList permissions={session.permissions} currentUserName={session.realName} /></main>;
  if (key === "meetings/0") return <main className="page-wrap"><PageHeader {...meta} /><MonthlyOnlineMeetingList permissions={session.permissions} /></main>;
  if (key === "training/0") return <main className="page-wrap"><PageHeader {...meta} /><DailyLearningList permissions={session.permissions} /></main>;
  if (key === "training/3") return <main className="page-wrap"><PageHeader {...meta} /><CourseAssignmentList permissions={session.permissions} /></main>;
  if (key === "training/1") {
    const platform = await getPlatformConfig();
    const defaultCourseCover = platformAssetUrl("course-cover", platform.courseCoverDataUrl);
    const defaultLessonCover = platformAssetUrl("lesson-cover", platform.lessonCoverDataUrl);
    return <main className="page-wrap"><PageHeader {...meta} /><CourseManagement permissions={session.permissions} defaultCourseCover={defaultCourseCover} defaultLessonCover={defaultLessonCover} /></main>;
  }
  if (key === "meetings/1") return <main className="page-wrap"><PageHeader {...meta} /><MidMonthOfflineMeetingList permissions={session.permissions} /></main>;
  if (key === "meetings/2") return <main className="page-wrap"><PageHeader {...meta} /><QuarterlyOfflineMeetingList permissions={session.permissions} /></main>;
  if (key === "settings/clear-data") return <main className="page-wrap"><PageHeader {...meta} /><ClearBusinessData /></main>;
  if (key === "settings/roles") return <main className="page-wrap"><PageHeader {...meta} /><RoleManagement /></main>;
  if (key === "settings/users") return <main className="page-wrap"><PageHeader {...meta} /><UserManagement /></main>;
  if (key === "settings/business-data-sources") return <main className="page-wrap"><PageHeader {...meta} /><BusinessDataSourceList permissions={session.permissions} currentUserName={session.realName} /></main>;
  if (key === "inspection/research-templates") return <main className="page-wrap"><PageHeader {...meta} /><ResearchTemplateList permissions={session.permissions} /></main>;
  if (key === "settings/storage") return <main className="page-wrap"><PageHeader {...meta} /><R2StorageList permissions={session.permissions} /></main>;
  if (key === "settings/backups") return <main className="page-wrap"><PageHeader {...meta} /><DatabaseBackup permissions={session.permissions} /></main>;
  if (key === "settings/deployment-data") return <main className="page-wrap"><PageHeader {...meta} /><DeploymentDataTransfer /></main>;
  if (key === "settings/dictionaries") return <main className="page-wrap"><PageHeader {...meta} /><DictionaryManagement permissions={session.permissions} /></main>;
  if (key === "settings/rest-days") return <main className="page-wrap"><PageHeader {...meta} /><RestDayList permissions={session.permissions} currentUserName={session.realName} /></main>;
  if (key === "settings/store-labor-standards") return <main className="page-wrap"><PageHeader {...meta} /><StoreLaborStandardList permissions={session.permissions} /></main>;
  if (key === "settings/operation-logs") return <main className="page-wrap"><PageHeader {...meta} /><OperationLogList permissions={session.permissions} /></main>;
  return <main className="page-wrap"><PageHeader {...meta} /><Card><Descriptions title="模块状态" column={1}><Descriptions.Item label="页面框架">已接入统一导航、登录会话与权限边界</Descriptions.Item><Descriptions.Item label="下一步">根据该模块的业务规则配置字段、数据采集来源和审批流程</Descriptions.Item></Descriptions></Card></main>;
}

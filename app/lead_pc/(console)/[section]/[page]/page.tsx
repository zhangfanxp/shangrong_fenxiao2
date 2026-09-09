import { Card, Descriptions } from "antd";
import { AssessmentList } from "@/components/assessment-list";
import { ActualRevenueList } from "@/components/actual-revenue-list";
import { RevenueTargetList } from "@/components/revenue-target-list";
import { ClearBusinessData } from "@/components/clear-business-data";
import { DictionaryManagement } from "@/components/dictionary-management";
import { OperationLogList } from "@/components/operation-log-list";
import { MidMonthOfflineMeetingList, MonthlyOnlineMeetingList } from "@/components/monthly-online-meeting-list";
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
import { getPlatformConfig } from "@/lib/platform-config";
import { requirePageAccess } from "@/lib/auth";
import { db } from "@/lib/db";
import { serializeStoreReview, storeReviewDataScope, storeReviewSelect } from "@/lib/store-reviews";
import { serializeStoreCreditScore, storeCreditScoreDataScope, storeCreditScoreFilterWhere, storeCreditScoreSelect } from "@/lib/store-credit-scores";
import { serializeStoreResearch, storeResearchDataScope, storeResearchSelect } from "@/lib/store-research-records";
import { actualRevenueDataScope, actualRevenueListSelect, serializeActualRevenue } from "@/lib/actual-revenue";
import { revenueTargetDataScope, revenueTargetListSelect, serializeRevenueTarget } from "@/lib/revenue-targets";

const titles: Record<string, { title: string; description: string }> = {
  "settings/backups": { title: "数据库备份", description: "将可独立恢复的 MySQL 全量备份安全保存至 Cloudflare R2" },
  "inspection/2": { title: "门店稽核评分", description: "查询、查看及管理门店前厅、后厨等稽核评分记录" },
  "inspection/3": { title: "门店信用得分", description: "查询和管理运营移动端正式提交的门店信用评分结果" },
  "operations/0": { title: "目标营业额", description: "管理门店月度营业目标及每日目标分解" },
  "operations/1": { title: "实际营业额", description: "管理门店月度实际经营数据及目标" },
  "inspection/4": { title: "巡店调研表", description: "查询、查看及管理运营 H5 正式提交的门店调研记录" },
  "notifications/publish": { title: "发布通知", description: "创建定时通知，指定接收用户并在发布日期 06:00 自动发布" },
  "training/0": { title: "每日学习", description: "按 ISO 周制定移动端每日学习计划，并跟踪学员完成情况" },
  "training/1": { title: "课程管理", description: "管理线上培训课程、课程课时及课件" },
  "training/3": { title: "课程分配记录", description: "查询课程分配批次及学员学习情况" },
  "meetings/0": { title: "每月线上会", description: "查询和管理每月线上会议及实际参会情况" },
  "meetings/1": { title: "月中线下会", description: "查询和管理月中线下会议及实际参会情况" },
  "tasks/settings": { title: "任务设置", description: "管理每日、每周、每月及临时任务模板" }, "tasks/records": { title: "任务记录", description: "查看门店任务执行与完成情况" }, "tasks/analysis": { title: "智能分析", description: "查看任务执行结果的AI智能分析记录" },
  "settings/roles": { title: "角色管理", description: "管理系统角色以及页面、功能按钮权限" }, "settings/users": { title: "用户列表", description: "维护平台用户账号、角色和使用状态" }, "settings/dictionaries": { title: "数据字典", description: "统一维护业务枚举及下拉选项" }, "settings/assessments": { title: "考核表格", description: "配置平台检查、督导及运营考核评分模板" }, "settings/survey-templates": { title: "调研模版", description: "配置门店调研、竞品调研等标准化调研表单" }, "settings/storage": { title: "R2存储空间", description: "管理平台 Cloudflare R2 存储桶及访问参数" }, "settings/parameters": { title: "系统参数", description: "维护平台信息与品牌工作日小时" }, "settings/operation-logs": { title: "操作日志", description: "追溯系统关键操作及执行结果" }, "settings/clear-data": { title: "清空业务数据", description: "仅限超级管理员执行的系统维护操作" },
};
const pageTitle = (section: string, page: string) => titles[`${section}/${page}`] ?? { title: "功能模块", description: "该模块已接入统一导航、权限和页面规范，可按业务规则逐步配置数据字段。" };

export default async function GenericPage({ params }: { params: Promise<{ section: string; page: string }> }) {
  const { section, page } = await params; const session = await requirePageAccess(`/lead_pc/${section}/${page}`); const meta = pageTitle(section, page); const key = `${section}/${page}`;
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
  if (key === "meetings/0") return <main className="page-wrap"><PageHeader {...meta} /><MonthlyOnlineMeetingList permissions={session.permissions} /></main>;
  if (key === "training/0") return <main className="page-wrap"><PageHeader {...meta} /><DailyLearningList permissions={session.permissions} /></main>;
  if (key === "training/3") return <main className="page-wrap"><PageHeader {...meta} /><CourseAssignmentList permissions={session.permissions} /></main>;
  if (key === "training/1") {
    const platform = await getPlatformConfig();
    return <main className="page-wrap"><PageHeader {...meta} /><CourseManagement permissions={session.permissions} defaultCourseCover={platform.courseCoverDataUrl} defaultLessonCover={platform.lessonCoverDataUrl} /></main>;
  }
  if (key === "meetings/1") return <main className="page-wrap"><PageHeader {...meta} /><MidMonthOfflineMeetingList permissions={session.permissions} /></main>;
  if (key === "settings/clear-data") return <main className="page-wrap"><PageHeader {...meta} /><ClearBusinessData /></main>;
  if (key === "settings/roles") return <main className="page-wrap"><PageHeader {...meta} /><RoleManagement /></main>;
  if (key === "settings/users") return <main className="page-wrap"><PageHeader {...meta} /><UserManagement /></main>;
  if (key === "settings/assessments") return <main className="page-wrap"><PageHeader {...meta} /><AssessmentList permissions={session.permissions} /></main>;
  if (key === "settings/survey-templates") return <main className="page-wrap"><PageHeader {...meta} /><ResearchTemplateList permissions={session.permissions} /></main>;
  if (key === "settings/storage") return <main className="page-wrap"><PageHeader {...meta} /><R2StorageList permissions={session.permissions} /></main>;
  if (key === "settings/backups") return <main className="page-wrap"><PageHeader {...meta} /><DatabaseBackup permissions={session.permissions} /></main>;
  if (key === "settings/dictionaries") return <main className="page-wrap"><PageHeader {...meta} /><DictionaryManagement permissions={session.permissions} /></main>;
  if (key === "settings/operation-logs") return <main className="page-wrap"><PageHeader {...meta} /><OperationLogList permissions={session.permissions} /></main>;
  return <main className="page-wrap"><PageHeader {...meta} /><Card><Descriptions title="模块状态" column={1}><Descriptions.Item label="页面框架">已接入统一导航、登录会话与权限边界</Descriptions.Item><Descriptions.Item label="下一步">根据该模块的业务规则配置字段、数据采集来源和审批流程</Descriptions.Item></Descriptions></Card></main>;
}

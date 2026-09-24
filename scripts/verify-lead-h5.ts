import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { db } from "../lib/db";
import { currentIsoWeek, DAILY_LEARNING_DAY_FIELDS, isoWeekStartAt, nextDailyLearningRecordNo, shanghaiNowParts } from "../lib/daily-learning";
import { STORE_RESEARCH_TYPE } from "../lib/lead-h5-research";
import { BACK_KITCHEN_REVIEW_TYPE, FRONT_HALL_REVIEW_TYPE, scoreReview, STORE_CREDIT_REVIEW_TYPE } from "../lib/lead-h5-reviews";
import { leadH5PermissionGroups, storeH5PermissionGroups } from "../lib/role-permissions";

const baseUrl = process.env.LEAD_H5_VERIFY_URL || "http://127.0.0.1:3001";
const username = `h5_verify_${Date.now()}`;
const password = "TemporaryVerify2026";
let userId: string | undefined;
let roleId: string | undefined;
let learningPlanId: string | undefined;
const reviewIds: string[] = [];
const researchRecordIds: string[] = [];

async function request(path: string, init?: RequestInit, cookie?: string) {
  return fetch(`${baseUrl}${path}`, { ...init, headers: { ...(init?.headers || {}), ...(cookie ? { cookie } : {}) } });
}

async function main() {
  const binaryConfig = {
    reviewName: "前厅稽核评分", scoreMode: "BINARY" as const, configVersion: 1, totalScore: 2,
    sections: [{ name: "规范", children: [{ name: "仪容", items: [{ id: "item_1", description: "着装", maxScore: 2 }] }] }],
  };
  assert.equal(scoreReview(binaryConfig, [{ itemId: "item_1", result: "PASS" }]).actualScore, 2);
  assert.throws(() => scoreReview(binaryConfig, [{ itemId: "item_1", result: "PARTIAL", score: 1 }]));

  const role = await db.role.create({ data: {
    code: `H5_VERIFY_${Date.now()}`,
    name: `H5自动验证角色_${Date.now()}`,
    type: "CUSTOM",
    permissions: [...leadH5PermissionGroups, ...storeH5PermissionGroups].flatMap(group => group.permissions.map(permission => permission.value)),
  } });
  roleId = role.id;
  const learningTag = `每日学习验证_${Date.now()}`;
  const user = await db.user.create({ data: { username, passwordHash: await bcrypt.hash(password, 10), realName: "H5自动验证", tags: learningTag, roleId: role.id, status: "ENABLED" } });
  userId = user.id;

  const pcLogin = await request("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
  assert.equal(pcLogin.status, 403, "仅配置H5权限的角色不应允许登录运营PC端");
  const login = await request("/api/lead-h5/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
  assert.equal(login.status, 200, `登录接口返回 ${login.status}`);
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  assert(cookie, "登录成功后应设置H5会话Cookie");
  const storeLogin = await request("/api/store-h5/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
  assert.equal(storeLogin.status, 200, `门店H5登录接口返回 ${storeLogin.status}`);
  const storeCookie = storeLogin.headers.get("set-cookie")?.split(";")[0];
  assert(storeCookie, "门店H5登录成功后应设置会话Cookie");

  const me = await request("/api/lead-h5/me", undefined, cookie);
  assert.equal(me.status, 200, `当前用户接口返回 ${me.status}`);
  assert.equal((await me.json() as { username: string }).username, username);

  const noLearning = await request("/api/lead-h5/daily-learning/today", undefined, cookie);
  assert.equal(noLearning.status, 200, `今日学习查询接口返回 ${noLearning.status}`);
  assert.equal((await noLearning.json() as { task: unknown }).task, null, "未匹配学习计划时应返回空任务");
  for (const [endpoint, sessionCookie] of [["/api/lead-h5/daily-learning/pending", cookie], ["/api/store-h5/daily-learning/pending", storeCookie]] as const) {
    const pending = await request(endpoint, undefined, sessionCookie);
    assert.equal(pending.status, 200, `${endpoint} 返回 ${pending.status}`);
    assert.equal((await pending.json() as { pending: boolean }).pending, false, "无当天学习任务时不应展示提醒红点");
  }
  const now = new Date();
  const currentWeek = currentIsoWeek(now);
  const todayParts = shanghaiNowParts(now);
  const todayContent = "运营H5每日学习录音自动验证内容";
  const contentField = DAILY_LEARNING_DAY_FIELDS[currentWeek.weekDay - 1];
  const learningPlan = await db.$transaction(async tx => {
    const recordNo = await nextDailyLearningRecordNo(tx, now);
    return tx.dailyLearningPlan.create({ data: {
      recordNo,
      isoYear: currentWeek.isoYear,
      isoWeek: currentWeek.isoWeek,
      studentTag: learningTag,
      activeKey: `${currentWeek.isoYear}:${currentWeek.isoWeek}:${learningTag}`,
      weekStartAt: isoWeekStartAt(currentWeek.isoYear, currentWeek.isoWeek),
      mondayContent: null,
      tuesdayContent: null,
      wednesdayContent: null,
      thursdayContent: null,
      fridayContent: null,
      saturdayContent: null,
      sundayContent: null,
      [contentField]: todayContent,
      learningDays: 1,
      createdByUserId: user.id,
      createdByName: user.realName,
      assignees: { create: { userId: user.id, usernameSnapshot: user.username, realNameSnapshot: user.realName, labelSnapshot: user.tags || "" } },
    } });
  });
  learningPlanId = learningPlan.id;
  const todayLearning = await request("/api/lead-h5/daily-learning/today", undefined, cookie);
  assert.equal(todayLearning.status, 200, `匹配后的今日学习查询接口返回 ${todayLearning.status}`);
  const todayTask = (await todayLearning.json() as { task: { id: string; title: string; completed: boolean } | null }).task;
  assert(todayTask, "匹配用户标签且当天有内容时应返回今日学习任务");
  assert.equal(todayTask.id, learningPlan.id, "应返回当前用户标签对应的学习计划");
  assert.equal(todayTask.title, `【每日学习】${todayParts.year}-${String(todayParts.month).padStart(2, "0")}-${String(todayParts.day).padStart(2, "0")}`);
  assert.equal(todayTask.completed, false, "新建的今日学习任务应为未完成");
  for (const [endpoint, sessionCookie] of [["/api/lead-h5/daily-learning/pending", cookie], ["/api/store-h5/daily-learning/pending", storeCookie]] as const) {
    const pending = await request(endpoint, undefined, sessionCookie);
    assert.equal(pending.status, 200, `${endpoint} 返回 ${pending.status}`);
    assert.equal((await pending.json() as { pending: boolean }).pending, true, "当天学习任务未完成时应展示提醒红点");
  }
  const todayDetail = await request(`/api/lead-h5/daily-learning/${learningPlan.id}`, undefined, cookie);
  assert.equal(todayDetail.status, 200, `今日学习录音详情接口返回 ${todayDetail.status}`);
  const detail = (await todayDetail.json() as { detail: { content: string; title: string } }).detail;
  assert.equal(detail.content, todayContent, "录音页应只展示当天学习正文");
  assert.equal(detail.title, todayTask.title, "录音页标题应为每日学习加今日日期");
  const invalidAudio = await request(`/api/lead-h5/daily-learning/${learningPlan.id}/recording/sign`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "recording.webm", type: "audio/webm", size: 1024, durationSeconds: 3 }) }, cookie);
  assert.equal(invalidAudio.status, 400, "运营H5录音上传仅接受MP3格式");
  const mp3Sign = await request(`/api/lead-h5/daily-learning/${learningPlan.id}/recording/sign`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "recording.mp3", type: "audio/mpeg", size: 1024, durationSeconds: 3 }) }, cookie);
  assert.equal(mp3Sign.status, 200, `MP3录音上传签名接口返回 ${mp3Sign.status}`);
  assert.equal((await mp3Sign.json() as { headers: Record<string, string> }).headers["Content-Type"], "audio/mpeg", "R2直传内容类型应为MP3");

  await db.dailyLearningProgress.create({ data: {
    planId: learningPlan.id,
    userId: user.id,
    learningDate: new Date(`${todayParts.year}-${String(todayParts.month).padStart(2, "0")}-${String(todayParts.day).padStart(2, "0")}T00:00:00+08:00`),
    weekDay: currentWeek.weekDay,
    contentSnapshot: todayContent,
    status: "COMPLETED",
  } });
  for (const [endpoint, sessionCookie] of [["/api/lead-h5/daily-learning/pending", cookie], ["/api/store-h5/daily-learning/pending", storeCookie]] as const) {
    const pending = await request(endpoint, undefined, sessionCookie);
    assert.equal(pending.status, 200, `${endpoint} 返回 ${pending.status}`);
    assert.equal((await pending.json() as { pending: boolean }).pending, false, "当天学习任务完成后应隐藏提醒红点");
  }
  await db.dailyLearningProgress.deleteMany({ where: { planId: learningPlan.id, userId: user.id } });

  const month = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit" }).format(new Date());
  const verifiedTypes: string[] = [];
  for (const reviewType of [FRONT_HALL_REVIEW_TYPE, BACK_KITCHEN_REVIEW_TYPE, STORE_CREDIT_REVIEW_TYPE]) {
    const storesResponse = await request(`/api/lead-h5/reviews/available-stores?scoreMonth=${month}&scoreType=${reviewType}`, undefined, cookie);
    assert.equal(storesResponse.status, 200, `${reviewType}待评分门店接口返回 ${storesResponse.status}`);
    const stores = (await storesResponse.json() as { stores: Array<{ id: string }> }).stores;
    if (!stores.length) continue;
    const template = await request(`/api/lead-h5/reviews/template?scoreMonth=${month}&scoreType=${reviewType}&storeId=${stores[0].id}`, undefined, cookie);
    assert.equal(template.status, 200, `${reviewType}评分模板接口返回 ${template.status}`);
    verifiedTypes.push(reviewType);
    if (process.env.LEAD_H5_VERIFY_SUBMIT === "1") {
      const payload = await template.json() as {
        assessment: { id: string; configVersion: number };
        config: { detailFormat?: string; sections: Array<{ children: Array<{ items: Array<{ id: string; breachAmount?: string }> }> }> };
      };
      if (reviewType === STORE_CREDIT_REVIEW_TYPE) {
        assert.equal(payload.config.detailFormat, "CREDIT", "门店信用评分应加载信用表格布局");
        assert(payload.config.sections.some(section => section.children.some(subsection => subsection.items.some(item => Boolean(item.breachAmount)))), "门店信用评分应包含违约金额");
      }
      const items = payload.config.sections.flatMap(section => section.children.flatMap(subsection => subsection.items.map(item => ({ itemId: item.id, result: "PASS" }))));
      const submissionBody = { scoreMonth: month, scoreType: reviewType, storeId: stores[0].id, reviewTemplateId: payload.assessment.id, reviewTemplateVersion: payload.assessment.configVersion, items };
      const submission = await request("/api/lead-h5/reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(submissionBody) }, cookie);
      assert.equal(submission.status, 201, `正式提交接口返回 ${submission.status}`);
      const submitted = await submission.json() as { recordNo: string; assessmentSupervisor: string; assessmentDate: string };
      assert.match(submitted.recordNo, /^[0-9]{12}$/, "评分记录编号应为8位日期加4位流水号");
      assert.equal(submitted.assessmentSupervisor, "H5自动验证", "接口应返回当前操作人员真实姓名");
      assert.match(submitted.assessmentDate, /^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}$/, "接口应返回标准考核日期");
      const savedReview = await db.leadH5Review.findUnique({
        where: { recordNo: submitted.recordNo },
        select: { id: true, assessmentSupervisor: true, assessmentDate: true, responsiblePersonUserId: true, responsiblePersonNameSnapshot: true, responsiblePersonType: true },
      });
      assert(savedReview, "正式评分应写入数据库");
      assert.equal(savedReview.assessmentSupervisor, "H5自动验证", "数据库应保存当前操作人员真实姓名");
      assert.equal(savedReview.assessmentDate.getMilliseconds(), 0, "数据库考核日期应精确到秒");
      const sourceStore = await db.store.findUnique({ where: { id: stores[0].id }, select: { managerUserId: true, managerName: true, chefName: true } });
      const expectedResponsibleName = (reviewType === BACK_KITCHEN_REVIEW_TYPE ? sourceStore?.chefName : sourceStore?.managerName)?.trim() || "-";
      assert.equal(savedReview.responsiblePersonNameSnapshot, expectedResponsibleName, "数据库应保存评分发生时的负责人姓名快照");
      assert.equal(savedReview.responsiblePersonType, reviewType === BACK_KITCHEN_REVIEW_TYPE ? "HEAD_CHEF" : "STORE_MANAGER", "数据库应保存负责人类型");
      assert.equal(savedReview.responsiblePersonUserId, reviewType === BACK_KITCHEN_REVIEW_TYPE ? null : sourceStore?.managerUserId || null, "数据库应保存评分发生时的店长用户ID快照");
      reviewIds.push(savedReview.id);
      const duplicate = await request("/api/lead-h5/reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(submissionBody) }, cookie);
      assert.equal(duplicate.status, 409, "同店同月同类型重复提交应被拒绝");
    }
  }
  assert(verifiedTypes.includes(FRONT_HALL_REVIEW_TYPE), "前厅稽核评分模板应可匹配");
  assert(verifiedTypes.includes(BACK_KITCHEN_REVIEW_TYPE), "后厨稽核评分模板应可匹配");
  assert(verifiedTypes.includes(STORE_CREDIT_REVIEW_TYPE), "门店信用评分模板应可匹配");

  const researchStoresResponse = await request(`/api/lead-h5/research/available-stores?researchMonth=${month}`, undefined, cookie);
  assert.equal(researchStoresResponse.status, 200, `待调研门店接口返回 ${researchStoresResponse.status}`);
  const researchStores = (await researchStoresResponse.json() as { stores: Array<{ id: string }> }).stores;
  assert(researchStores.length, "当前权限下应存在待调研门店");
  const researchStoreId = researchStores[0].id;
  const researchTemplateResponse = await request(`/api/lead-h5/research/template?researchMonth=${month}&storeId=${researchStoreId}`, undefined, cookie);
  assert.equal(researchTemplateResponse.status, 200, `调研模版接口返回 ${researchTemplateResponse.status}`);
  const researchPayload = await researchTemplateResponse.json() as {
    template: { id: string; templateType: string; configVersion: number };
    config: { items: Array<{ id: string; required: boolean }> };
  };
  assert.equal(researchPayload.template.templateType, STORE_RESEARCH_TYPE, "应匹配督导巡店调研模版");
  if (process.env.LEAD_H5_VERIFY_SUBMIT === "1") {
    const emptyItems = researchPayload.config.items.map(item => ({ itemId: item.id, value: "" }));
    const researchSubmissionBody = {
      researchMonth: month,
      storeId: researchStoreId,
      researchTemplateId: researchPayload.template.id,
      researchTemplateVersion: researchPayload.template.configVersion,
      items: researchPayload.config.items.map(item => ({ itemId: item.id, value: item.required ? "自动验证必填内容" : "" })),
    };
    const invalidSubmission = await request("/api/lead-h5/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...researchSubmissionBody, items: emptyItems }) }, cookie);
    assert.equal(invalidSubmission.status, 400, "缺少必填内容的调研表应被拒绝");
    const researchSubmission = await request("/api/lead-h5/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(researchSubmissionBody) }, cookie);
    assert.equal(researchSubmission.status, 201, `调研表正式提交接口返回 ${researchSubmission.status}`);
    const researchSubmitted = await researchSubmission.json() as { recordNo: string; status: string; supervisorRealName: string; submittedAt: string };
    assert.match(researchSubmitted.recordNo, /^[0-9]{12}$/, "调研记录编号应为8位日期加4位流水号");
    assert.equal(researchSubmitted.status, "SUBMITTED", "调研记录状态应为已提交");
    assert.equal(researchSubmitted.supervisorRealName, "H5自动验证", "调研记录应保存当前督导真实姓名");
    assert.match(researchSubmitted.submittedAt, /^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}$/, "调研提交时间格式应正确");
    const savedResearch = await db.researchTemplateRecord.findUnique({ where: { recordNo: researchSubmitted.recordNo } });
    assert(savedResearch, "正式调研内容应写入数据库");
    assert.equal(savedResearch.storeId, researchStoreId, "数据库应保存所选店铺");
    assert.equal(savedResearch.researchMonth, month, "数据库应保存所选月份");
    assert.equal(savedResearch.supervisorRealName, "H5自动验证", "数据库应保存当前督导真实姓名");
    assert.equal(savedResearch.submittedAt.getMilliseconds(), 0, "数据库调研日期应精确到秒");
    researchRecordIds.push(savedResearch.id);
    const storesAfterSubmit = await request(`/api/lead-h5/research/available-stores?researchMonth=${month}`, undefined, cookie);
    const remainingStoreIds = (await storesAfterSubmit.json() as { stores: Array<{ id: string }> }).stores.map(store => store.id);
    assert(!remainingStoreIds.includes(researchStoreId), "已提交调研的店铺不应继续出现在当前月份待调研列表");
    const duplicateResearch = await request("/api/lead-h5/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(researchSubmissionBody) }, cookie);
    assert.equal(duplicateResearch.status, 409, "同店同月督导巡店调研重复提交应被拒绝");
  }
  await db.role.update({ where: { id: role.id }, data: { permissions: ["lead-h5:home:view"] } });
  const leadSessionAfterRevocation = await request("/api/lead-h5/me", undefined, cookie);
  assert.equal(leadSessionAfterRevocation.status, 200, "保留运营H5端口权限后会话应继续有效");
  const deniedReviewAfterRevocation = await request(`/api/lead-h5/reviews/available-stores?scoreMonth=${month}&scoreType=${FRONT_HALL_REVIEW_TYPE}`, undefined, cookie);
  assert.equal(deniedReviewAfterRevocation.status, 401, "移除评分页面权限后原会话不应继续访问评分接口");
  const storeSessionAfterRevocation = await request("/api/store-h5/me", undefined, storeCookie);
  assert.equal(storeSessionAfterRevocation.status, 401, "移除门店H5端口权限后原会话应立即失效");
  console.log(`运营H5验证通过：角色端口、页面、操作权限及动态撤权均正常。`);
}

main().finally(async () => {
  if (researchRecordIds.length) {
    await db.researchTemplateRecord.deleteMany({ where: { id: { in: researchRecordIds } } });
    const dateKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()).replaceAll("-", "");
    const remainingForDate = await db.researchTemplateRecord.count({ where: { recordNo: { startsWith: dateKey } } });
    if (!remainingForDate) await db.leadH5ResearchSequence.deleteMany({ where: { dateKey } });
  }
  if (reviewIds.length) await db.leadH5Review.deleteMany({ where: { id: { in: reviewIds } } });
  if (learningPlanId) {
    await db.dailyLearningProgress.deleteMany({ where: { planId: learningPlanId } });
    await db.dailyLearningPlan.deleteMany({ where: { id: learningPlanId } });
  }
  if (userId) {
    await db.operationLog.deleteMany({ where: { userId } });
    await db.user.deleteMany({ where: { id: userId } });
  }
  if (roleId) await db.role.deleteMany({ where: { id: roleId } });
  await db.$disconnect();
});

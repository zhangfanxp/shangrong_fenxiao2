import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { db } from "../lib/db";
import { getPlatformConfig } from "../lib/platform-config";
import { STORE_RESEARCH_TYPE } from "../lib/lead-h5-research";
import { BACK_KITCHEN_REVIEW_TYPE, FRONT_HALL_REVIEW_TYPE, scoreReview } from "../lib/lead-h5-reviews";

const baseUrl = process.env.LEAD_H5_VERIFY_URL || "http://127.0.0.1:3001";
const username = `h5_verify_${Date.now()}`;
const password = "TemporaryVerify2026";
let userId: string | undefined;
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

  const role = await db.role.findFirst({ where: { status: "ENABLED" }, orderBy: { code: "asc" } });
  assert(role, "需要至少一个已启用角色才能进行H5验证");
  const platform = await getPlatformConfig();
  const loginTag = platform.leadH5LoginTags.split("｜").find(Boolean) || "H5验证";
  const user = await db.user.create({ data: { username, passwordHash: await bcrypt.hash(password, 10), realName: "H5自动验证", tags: loginTag, roleId: role.id, status: "ENABLED" } });
  userId = user.id;

  const login = await request("/api/lead-h5/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
  assert.equal(login.status, 200, `登录接口返回 ${login.status}`);
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  assert(cookie, "登录成功后应设置H5会话Cookie");

  const me = await request("/api/lead-h5/me", undefined, cookie);
  assert.equal(me.status, 200, `当前用户接口返回 ${me.status}`);
  assert.equal((await me.json() as { username: string }).username, username);

  const month = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit" }).format(new Date());
  const verifiedTypes: string[] = [];
  for (const reviewType of [FRONT_HALL_REVIEW_TYPE, BACK_KITCHEN_REVIEW_TYPE]) {
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
        config: { sections: Array<{ children: Array<{ items: Array<{ id: string }> }> }> };
      };
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
        select: { id: true, assessmentSupervisor: true, assessmentDate: true, responsiblePersonNameSnapshot: true, responsiblePersonType: true },
      });
      assert(savedReview, "正式评分应写入数据库");
      assert.equal(savedReview.assessmentSupervisor, "H5自动验证", "数据库应保存当前操作人员真实姓名");
      assert.equal(savedReview.assessmentDate.getMilliseconds(), 0, "数据库考核日期应精确到秒");
      const sourceStore = await db.store.findUnique({ where: { id: stores[0].id }, select: { managerName: true, chefName: true } });
      const expectedResponsibleName = (reviewType === FRONT_HALL_REVIEW_TYPE ? sourceStore?.managerName : sourceStore?.chefName)?.trim() || "-";
      assert.equal(savedReview.responsiblePersonNameSnapshot, expectedResponsibleName, "数据库应保存评分发生时的负责人姓名快照");
      assert.equal(savedReview.responsiblePersonType, reviewType === FRONT_HALL_REVIEW_TYPE ? "STORE_MANAGER" : "HEAD_CHEF", "数据库应保存负责人类型");
      reviewIds.push(savedReview.id);
      const duplicate = await request("/api/lead-h5/reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(submissionBody) }, cookie);
      assert.equal(duplicate.status, 409, "同店同月同类型重复提交应被拒绝");
    }
  }
  assert(verifiedTypes.includes(FRONT_HALL_REVIEW_TYPE), "前厅稽核评分模板应可匹配");
  assert(verifiedTypes.includes(BACK_KITCHEN_REVIEW_TYPE), "后厨稽核评分模板应可匹配");

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
  console.log(`运营H5验证通过：前厅、后厨评分及门店调研的登录、权限门店、模版匹配、必填校验${reviewIds.length || researchRecordIds.length ? "、正式提交、状态过滤及数据库防重" : ""}均正常。`);
}

main().finally(async () => {
  if (researchRecordIds.length) {
    await db.researchTemplateRecord.deleteMany({ where: { id: { in: researchRecordIds } } });
    const dateKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()).replaceAll("-", "");
    const remainingForDate = await db.researchTemplateRecord.count({ where: { recordNo: { startsWith: dateKey } } });
    if (!remainingForDate) await db.leadH5ResearchSequence.deleteMany({ where: { dateKey } });
  }
  if (reviewIds.length) await db.leadH5Review.deleteMany({ where: { id: { in: reviewIds } } });
  if (userId) {
    await db.operationLog.deleteMany({ where: { userId } });
    await db.user.deleteMany({ where: { id: userId } });
  }
  await db.$disconnect();
});

import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { db } from "../lib/db";
import { getPlatformConfig } from "../lib/platform-config";
import { BACK_KITCHEN_REVIEW_TYPE, FRONT_HALL_REVIEW_TYPE, scoreReview } from "../lib/lead-h5-reviews";

const baseUrl = process.env.LEAD_H5_VERIFY_URL || "http://127.0.0.1:3001";
const username = `h5_verify_${Date.now()}`;
const password = "TemporaryVerify2026";
let userId: string | undefined;
const reviewIds: string[] = [];

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
  console.log(`运营H5验证通过：前厅及后厨的登录、会话、待评分门店、模板匹配${reviewIds.length ? "、正式提交及数据库防重" : ""}与计分规则正常。`);
}

main().finally(async () => {
  if (reviewIds.length) await db.leadH5Review.deleteMany({ where: { id: { in: reviewIds } } });
  if (userId) {
    await db.operationLog.deleteMany({ where: { userId } });
    await db.user.deleteMany({ where: { id: userId } });
  }
  await db.$disconnect();
});

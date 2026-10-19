import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import bcrypt from "bcryptjs";
import type { LeadH5Review } from "@prisma/client";

// Against a running QA copy of the app. All accounts, messages, objects and business
// records created by this test belong to its own fixtures and are removed afterward.
const baseUrl = process.env.RECTIFICATION_VERIFY_URL || "http://127.0.0.1:3002";
const stamp = Date.now().toString();
const prefix = `rectqa_${stamp}`;
const password = `RectQa_${crypto.randomUUID()}`;
const objects = new Map<string, { body: Buffer; type: string; etag: string }>();
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aVCEAAAAASUVORK5CYII=", "base64");
const storage = createServer(async (request, response) => {
  const key = decodeURIComponent(new URL(request.url!, "http://localhost").pathname);
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,HEAD,PUT,POST,DELETE,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "*");
  response.setHeader("Access-Control-Expose-Headers", "ETag");
  if (request.method === "OPTIONS") { response.end(); return; }
  if (request.method === "PUT") {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks); const etag = createHash("md5").update(body).digest("hex");
    objects.set(key, { body, type: String(request.headers["content-type"]), etag });
    response.setHeader("ETag", `"${etag}"`); response.end(); return;
  }
  if (request.method === "POST") { response.setHeader("Content-Type", "application/xml"); response.end('<DeleteResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"/>'); return; }
  if (request.method === "DELETE") { objects.delete(key); response.statusCode = 204; response.end(); return; }
  const object = objects.get(key);
  if (!object) { response.statusCode = 404; response.end(); return; }
  response.setHeader("Content-Type", object.type); response.setHeader("Content-Length", object.body.length); response.setHeader("ETag", `"${object.etag}"`);
  response.end(request.method === "HEAD" ? undefined : object.body);
});

async function main() {
  loadEnvConfig(process.cwd());
  const { db } = await import("../lib/db");
  const { createR2Config, deleteR2Config } = await import("../lib/r2-config-service");
  const { createSession } = await import("../lib/auth");
  const { expireOverdueTaskInstances, countPendingStoreTaskInstances } = await import("../lib/store-h5-tasks");
  const { rectificationDeadline, rectificationIsOverdue, rectificationDateTime, RECTIFICATION_TASK_ID } = await import("../lib/inspection-rectification-shared");
  const server = await new Promise<ReturnType<typeof storage.listen>>(resolve => storage.listen(0, "127.0.0.1", () => resolve(storage)));
  const storagePort = (server.address() as { port: number }).port;
  const userIds: string[] = []; const assessmentIds: string[] = []; const files: string[] = [];
  let roleId: string | undefined; let brandId: string | undefined; let storeId: string | undefined; let r2Id: string | undefined;
  let operatorCookie = ""; let chefCookie = ""; let managerCookie = ""; let strangerCookie = "";
  const api = async (route: string, method = "GET", body?: unknown, cookie = operatorCookie, expected = 200) => {
    const response = await fetch(`${baseUrl}${route}`, { method, headers: { cookie, ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const data = await response.json();
    assert.equal(response.status, expected, `${method} ${route}: ${response.status}, ${data.message || ""}`);
    return data;
  };
  const login = async (username: string, channel: "lead-h5" | "store-h5") => {
    const response = await fetch(`${baseUrl}/api/${channel}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
    assert.equal(response.status, 200, `${channel} login`); return response.headers.get("set-cookie")!.split(";")[0];
  };
  const upload = async (signPath: string, confirmPath: string, payload: object, cookie: string) => {
    const grant = await api(signPath, "POST", { name: "整改对比.png", type: "image/png", size: png.length, ...payload }, cookie);
    const sent = await fetch(grant.uploadUrl, { method: "PUT", headers: grant.headers, body: png });
    assert.equal(sent.status, 200, "photo PUT");
    return api(confirmPath, "POST", { uploadToken: grant.uploadToken, etag: sent.headers.get("etag") }, cookie);
  };
  try {
    const now = new Date("2026-10-16T10:30:00+08:00");
    assert.equal(rectificationDateTime(now), "2026-10-16 10:30:00");
    for (const hours of [24, 72, 168]) assert.equal(rectificationDeadline(now, hours).getTime() - now.getTime(), hours * 3_600_000);
    assert(!rectificationIsOverdue(now, now)); assert(rectificationIsOverdue(now, new Date(now.getTime() + 1)));
    assert(!rectificationIsOverdue(now, new Date(now.getTime() - 1), new Date("2030-01-01")), "submission fixes the overtime result");
    const role = await db.role.create({ data: { code: prefix, name: prefix, permissions: ["*"] } }); roleId = role.id;
    const users = [];
    for (const [suffix, name] of [["op", "测试巡检员"], ["manager", "测试店长"], ["chef", "测试厨师长"], ["other", "测试其他员工"], ["stranger", "测试无关用户"]]) {
      const user = await db.user.create({ data: { username: `${prefix}_${suffix}`, realName: name, passwordHash: await bcrypt.hash(password, 4), roleId } }); userIds.push(user.id); users.push(user);
    }
    const [operator, manager, chef, other, stranger] = users;
    operatorCookie = await login(operator.username, "lead-h5"); managerCookie = await login(manager.username, "store-h5"); chefCookie = await login(chef.username, "store-h5"); strangerCookie = await login(stranger.username, "lead-h5");
    const pcCookie = `canyin_session=${await createSession({ userId: operator.id })}`;
    const brand = await db.brand.create({ data: { code: prefix, name: "巡检整改测试品牌" } }); brandId = brand.id;
    const store = await db.store.create({ data: { recordNo: prefix, name: "整改流程测试门店", brandId, cooperationType: "DIRECT", operationStatus: "OPENING", managerUserId: manager.id, managerName: manager.realName, chefUserId: chef.id, chefName: chef.realName } }); storeId = store.id;
    await db.personnel.create({ data: { recordNo: stamp.slice(-12), name: "其他员工", phone: "19900000000", idNumber: `${stamp}00000`.slice(0, 18), hireDate: new Date(), positionLevel: "员工", organization: "门店", storeId,
      contractSignDate: new Date(), contractExpiryDate: new Date("2030-01-01"), homeAddress: "测试", currentAddress: "测试", baseSalary: 0, socialSecurity: "AGREEMENT", platformUserId: other.id } });
    const r2 = await createR2Config({ name: "整改流程测试存储", accountId: prefix, accessKeyId: "qa-local-access", secretAccessKey: "qa-local-secret", bucketName: "rectification-qa", endpoint: `http://127.0.0.1:${storagePort}`, signedUrlExpireSeconds: 300, status: "ENABLED" }, operator.id); r2Id = r2.id;
    const scoreMonth = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit" }).format(new Date());
    const reviewTypes = ["FRONT_HALL_AUDIT", "BACK_KITCHEN_AUDIT", "STORE_CREDIT_SCORE"];
    const names = ["前厅稽核评分", "后厨稽核评分", "门店信用评分"];
    await mkdir(path.join(process.cwd(), "data", "review-configs"), { recursive: true });
    const reviews: LeadH5Review[] = [];
    for (let i = 0; i < reviewTypes.length; i++) {
      const fileName = `rq${stamp}_${i}.json`; const configPath = path.join(process.cwd(), "data", "review-configs", fileName); files.push(configPath);
      const config = { reviewName: names[i], scoreMode: "CUSTOM_SCORE", configVersion: 1, totalScore: 6, photoAttachmentLimit: 5, failRequiresProblemDescription: true, partialRequiresProblemDescription: true,
        sections: [{ name: "环境卫生", children: [{ name: "日常规范", items: [
          { id: "pass", description: "合格检查项", maxScore: 2 },
          { id: "fail", description: `不合格明细${"，检查卫生情况".repeat(70)}`, maxScore: 2, supportsPhoto: true },
          { id: "partial", description: "部分合格检查项", maxScore: 2 },
        ] }] }] };
      await writeFile(configPath, JSON.stringify(config));
      const assessment = await db.assessment.create({ data: { recordNo: `${prefix}_${i}`, name: names[i], scoreMode: "CUSTOM_SCORE", configFileName: fileName, applicableBrands: [brandId], r2StorageId: r2Id, detailText: "测试", sectionCount: 1, subsectionCount: 1, itemCount: 3, totalScore: 6, failRequiresProblemDescription: true, partialRequiresProblemDescription: true } }); assessmentIds.push(assessment.id);
      const payload = { scoreMonth, scoreType: reviewTypes[i], storeId, reviewTemplateId: assessment.id, reviewTemplateVersion: 1 };
      const photo = await upload("/api/lead-h5/reviews/photos/sign", "/api/lead-h5/reviews/photos/confirm", { ...payload, itemId: "fail" }, operatorCookie);
      const result = await api("/api/lead-h5/reviews", "POST", { ...payload, items: [{ itemId: "pass", result: "PASS" }, { itemId: "fail", result: "FAIL", problemDescription: "地面清洁不到位", photoIds: [photo.id] }, { itemId: "partial", result: "PARTIAL", score: 1, problemDescription: "需要进一步改善" }] }, operatorCookie, 201);
      const review = await db.leadH5Review.findUniqueOrThrow({ where: { recordNo: result.recordNo } }); reviews.push(review);
      const issues = await db.inspectionRectification.findMany({ where: { reviewItem: { reviewId: review.id } }, orderBy: { recordNo: "asc" } });
      assert.deepEqual(issues.map(row => row.recordNo), [`${result.recordNo}_001`, `${result.recordNo}_002`]);
      const options = await api(`/api/lead-h5/rectifications/${issues[0].id}/options`);
      assert.equal(options.fixedResponsibleId, i === 1 ? chef.id : manager.id, "type-specific fixed assignee");
    }
    const legacy = await db.leadH5Review.create({ data: { recordNo: stamp.slice(-12), reviewType: "FRONT_HALL_AUDIT", reviewMonth: "2020-01", storeId, storeNameSnapshot: store.name, brandId, brandNameSnapshot: brand.name,
      reviewerUserId: operator.id, reviewerUsername: operator.username, reviewerRealName: operator.realName, assessmentSupervisor: operator.realName, assessmentDate: new Date("2020-01-01"), assessmentId: assessmentIds[0], assessmentName: names[0], assessmentVersion: 1, configSnapshot: {}, maxScore: 2, actualScore: 0,
      items: { create: { itemKey: "legacy", sectionName: "历史", subsectionName: "历史", itemDescription: "历史不回填", maxScore: 2, actualScore: 0, result: "FAIL", sortOrder: 1 } } } });
    assert.equal(await db.inspectionRectification.count({ where: { reviewItem: { reviewId: legacy.id } } }), 0);
    let list = await api("/api/lead-h5/rectifications"); assert.equal(list.total, 6);
    assert.equal((await api("/api/lead-h5/rectifications", "GET", undefined, strangerCookie)).total, 0);
    const issue = list.rows.find((row: { recordNo: string }) => row.recordNo === `${reviews[0].recordNo}_001`);
    await api(`/api/lead-h5/rectifications/${issue.id}`, "GET", undefined, strangerCookie, 404);
    await api(`/api/lead-h5/rectifications/${issue.id}/options`, "GET", undefined, strangerCookie, 404);
    await db.role.update({ where: { id: roleId }, data: { permissions: ["lead-h5:rectifications:view"] } });
    await api(`/api/lead-h5/rectifications/${issue.id}`, "POST", { action: "no-action", reason: "" }, operatorCookie, 403);
    await db.role.update({ where: { id: roleId }, data: { permissions: ["*"] } });
    const input = { deadlineHours: 24, responsibleUserId: manager.id, requirement: "请抓紧时间整改", ccUserIds: [other.id] };
    await api(`/api/lead-h5/rectifications/${issue.id}`, "POST", { action: "start", round: { ...input, responsibleUserId: chef.id } }, operatorCookie, 400);
    await api(`/api/lead-h5/rectifications/${issue.id}`, "POST", { action: "start", round: { ...input, requirement: "字".repeat(101) } }, operatorCookie, 400);
    await api(`/api/lead-h5/rectifications/${issue.id}`, "POST", { action: "start", round: { ...input, ccUserIds: Array(11).fill(other.id) } }, operatorCookie, 400);
    const concurrent = await Promise.all([1, 2].map(() => fetch(`${baseUrl}/api/lead-h5/rectifications/${issue.id}`, { method: "POST", headers: { cookie: operatorCookie, "Content-Type": "application/json" }, body: JSON.stringify({ action: "start", round: input }) })));
    assert.deepEqual(concurrent.map(response => response.status).sort(), [200, 409], "double tap creates only one round");
    let round = await db.inspectionRectificationRound.findFirstOrThrow({ where: { rectificationId: issue.id } });
    assert.equal(await db.inspectionRectificationRound.count({ where: { rectificationId: issue.id } }), 1);
    assert.equal(await db.notification.count({ where: { clientRequestId: { startsWith: `rectification:${round.id}:` } } }), 1);
    const notice = await db.notification.findFirstOrThrow({ where: { clientRequestId: `rectification:${round.id}:GENERATED` }, include: { recipients: true } });
    assert(notice.content.length > 500, "full notification text is not truncated"); assert.deepEqual(notice.recipients.map(row => row.userId), [other.id]);
    await api(`/api/store-reviews/${reviews[0].id}`, "DELETE", undefined, pcCookie, 409);
    const dueAt = new Date(Date.now() - 3_600_000);
    await db.inspectionRectificationRound.update({ where: { id: round.id }, data: { dueAt, generatedAt: new Date(dueAt.getTime() - 24 * 3_600_000) } });
    await db.taskRecord.update({ where: { id: round.taskRecordId }, data: { dueDate: dueAt } });
    await expireOverdueTaskInstances(); assert.equal((await db.taskRecord.findUniqueOrThrow({ where: { id: round.taskRecordId } })).status, "PENDING");
    assert.equal(await countPendingStoreTaskInstances(manager.id), 1);
    assert((await api("/api/store-h5/tasks?status=pending", "GET", undefined, managerCookie)).rows.some((row: { id: string }) => row.id === round.taskRecordId));
    const taskPath = `/api/store-h5/tasks/${round.taskRecordId}`;
    const task = await api(taskPath, "GET", undefined, managerCookie); assert.equal(task.rectification.inspection.photos.length, 1);
    await api(`${taskPath}/draft`, "POST", { items: [{ index: 1, value: "正在处理" }], fallbackItemIndexes: [] }, managerCookie);
    await api(`${taskPath}/submit`, "POST", { items: [{ index: 0, attachmentIds: [] }, { index: 1, value: "" }] }, managerCookie, 400);
    const attachments: Array<{ id: string }> = [];
    for (let i = 0; i < 5; i++) attachments.push(await upload(`${taskPath}/attachments/sign`, `${taskPath}/attachments/confirm`, { itemIndex: 0 }, managerCookie));
    const removedPhoto = attachments.pop()!;
    await api(`${taskPath}/attachments`, "DELETE", { attachmentId: removedPhoto.id }, managerCookie);
    const fallbackForm = new FormData(); fallbackForm.set("itemIndex", "0"); fallbackForm.set("file", new Blob([new Uint8Array(png)], { type: "image/png" }), "备用上传.png");
    const fallbackResponse = await fetch(`${baseUrl}${taskPath}/attachments`, { method: "POST", headers: { cookie: managerCookie }, body: fallbackForm });
    assert.equal(fallbackResponse.status, 201, "overdue server-proxied upload fallback"); attachments.push(await fallbackResponse.json());
    await api(`${taskPath}/attachments/sign`, "POST", { itemIndex: 0, name: "six.png", type: "image/png", size: png.length }, managerCookie, 409);
    const previewPath = `${taskPath}/attachments?attachmentId=${encodeURIComponent(attachments[0].id)}`;
    const preview = await fetch(`${baseUrl}${previewPath}`, { headers: { cookie: managerCookie }, redirect: "manual" });
    assert.equal(preview.status, 307, "uploaded photo can be previewed before submission");
    assert.match(preview.headers.get("cache-control") || "", /no-store/);
    assert.deepEqual(Buffer.from(await (await fetch(preview.headers.get("location")!)).arrayBuffer()), png);
    const restoredTask = await api(taskPath, "GET", undefined, managerCookie);
    assert(restoredTask.draftAttachments.some((attachment: { id: string }) => attachment.id === attachments[0].id), "reopening a draft restores previewable photo IDs");
    await api(previewPath, "GET", undefined, "", 401);
    const unrelatedStoreCookie = await login(stranger.username, "store-h5");
    await api(previewPath, "GET", undefined, unrelatedStoreCookie, 404);
    const managerLeadCookie = await login(manager.username, "lead-h5");
    const leadPreview = await fetch(`${baseUrl}${previewPath.replace("/store-h5/", "/lead-h5/")}`, { headers: { cookie: managerLeadCookie }, redirect: "manual" });
    assert.equal(leadPreview.status, 307, "shared operations-H5 photo preview uses the same ownership rules");
    await api(`${taskPath}/submit`, "POST", { items: [{ index: 0, attachmentIds: attachments.map(row => row.id) }, { index: 1, value: "已清理地面" }] }, managerCookie);
    let detail = await api(`/api/lead-h5/rectifications/${issue.id}`); assert.equal(detail.status, "PENDING_ACCEPTANCE"); assert.equal(detail.rounds[0].photos.length, 5); assert(detail.rounds[0].overdue);
    assert.equal(await db.notification.count({ where: { clientRequestId: { startsWith: `rectification:${round.id}:` } } }), 1, "submission sends no notice");
    await api(`/api/lead-h5/rectifications/${issue.id}`, "POST", { action: "reject", roundNumber: 1, reason: "仍有卫生死角", round: { ...input, deadlineHours: 72, responsibleUserId: chef.id } });
    detail = await api(`/api/lead-h5/rectifications/${issue.id}`); assert.equal(detail.status, "IN_PROGRESS"); assert.equal(detail.rounds.length, 2); assert.equal(detail.rounds[1].acceptanceResult, "REJECTED"); assert.equal(detail.rounds[1].photos.length, 5);
    round = await db.inspectionRectificationRound.findFirstOrThrow({ where: { rectificationId: issue.id, roundNumber: 2 } }); assert.equal(round.deadlineHours, 72); assert.equal(round.responsibleUserId, chef.id);
    const secondPath = `/api/store-h5/tasks/${round.taskRecordId}`; const secondPhoto = await upload(`${secondPath}/attachments/sign`, `${secondPath}/attachments/confirm`, { itemIndex: 0 }, chefCookie);
    await api(`${secondPath}/submit`, "POST", { items: [{ index: 0, attachmentIds: [secondPhoto.id] }, { index: 1, value: "复查后已完成整改" }] }, chefCookie);
    await api(`/api/lead-h5/rectifications/${issue.id}`, "POST", { action: "accept", roundNumber: 1 }, operatorCookie, 409);
    await api(`/api/lead-h5/rectifications/${issue.id}`, "POST", { action: "accept", roundNumber: 2 });
    detail = await api(`/api/lead-h5/rectifications/${issue.id}`); assert.equal(detail.status, "QUALIFIED"); assert.equal(detail.rounds[0].overdue, false); assert.equal(detail.rounds[0].acceptedByName, operator.realName);
    assert.equal(Number((await db.leadH5Review.findUniqueOrThrow({ where: { id: reviews[0].id } })).actualScore), 3, "original score stays unchanged");
    await api(`/api/store-reviews/${reviews[0].id}`, "DELETE", undefined, pcCookie, 409);
    await api(`/api/task-records/${round.taskRecordId}`, "DELETE", undefined, pcCookie, 409);
    assert.equal((await api(`/api/task-records/${round.taskRecordId}`, "GET", undefined, pcCookie)).editable, false);
    const skipped = list.rows.find((row: { recordNo: string }) => row.recordNo === `${reviews[0].recordNo}_002`);
    await api(`/api/lead-h5/rectifications/${skipped.id}`, "POST", { action: "no-action", reason: "现场已处理，无需另行整改" });
    await api(`/api/lead-h5/rectifications/${skipped.id}`, "POST", { action: "start", round: input }, operatorCookie, 409);
    assert.equal((await api(`/api/lead-h5/rectifications/${skipped.id}`)).noActionReason, "现场已处理，无需另行整改");
    await db.store.update({ where: { id: store.id }, data: { managerUserId: null, managerName: null } });
    const creditIssue = list.rows.find((row: { recordNo: string }) => row.recordNo === `${reviews[2].recordNo}_001`);
    const fallback = await api(`/api/lead-h5/rectifications/${creditIssue.id}/options`); assert.equal(fallback.fixedResponsibleId, null); assert(fallback.responsibleOptions.some((person: { id: string }) => person.id === other.id));
    const tenCcIds = [other.id];
    for (let i = 0; i < 9; i++) {
      const cc = await db.user.create({ data: { username: `${prefix}_cc${i}`, realName: `测试抄送${i}`, passwordHash: other.passwordHash, roleId } });
      userIds.push(cc.id); tenCcIds.push(cc.id);
    }
    await api(`/api/lead-h5/rectifications/${creditIssue.id}`, "POST", { action: "start", round: { ...input, responsibleUserId: other.id, ccUserIds: tenCcIds } });
    const tenCcRound = await db.inspectionRectificationRound.findFirstOrThrow({ where: { rectificationId: creditIssue.id } });
    assert.equal(await db.notificationRecipient.count({ where: { notification: { clientRequestId: `rectification:${tenCcRound.id}:GENERATED` } } }), 10);

    await api(`/api/store-credit-scores/${reviews[2].id}`, "DELETE", undefined, pcCookie, 409);
    for (const status of ["PENDING", "IN_PROGRESS", "PENDING_ACCEPTANCE", "QUALIFIED", "NO_ACTION"]) {
      assert.equal((await api(`/api/lead-h5/rectifications?status=${status}`, "GET", undefined, strangerCookie)).total, 0);
    }
    const notices = await db.notification.findMany({ where: { createdByUserId: operator.id }, include: { recipients: true } });
    assert.equal(notices.length, 4, "only generation and acceptance send notices");
    assert(notices.every(notice => notice.recipients.every(recipient => recipient.userId && userIds.includes(recipient.userId))), "only fixture users receive test notifications");
    // Ordinary overdue tasks remain closed.
    const ordinary = await db.taskRecord.create({ data: { taskId: RECTIFICATION_TASK_ID, assignedUserId: manager.id, storeId, dueDate: new Date(Date.now() - 1000), status: "PENDING", targetPersonnelKey: prefix } });
    await expireOverdueTaskInstances(); assert.equal((await db.taskRecord.findUniqueOrThrow({ where: { id: ordinary.id } })).status, "OVERDUE");
    await api(`/api/store-h5/tasks/${ordinary.id}`, "GET", undefined, managerCookie, 404);
    process.stdout.write("PASS: numbering, future records only, ownership, assignees, concurrency, photos 1–5, photo preview access, overdue submissions, round history, notices, immutable scores and deletion guards\n");
    if (process.env.RECTIFICATION_VERIFY_HOLD === "1") {
      await writeFile(path.join(process.cwd(), ".rectification-qa-session.json"), JSON.stringify({ username: operator.username, password, managerUsername: other.username, detailId: issue.id, pendingId: creditIssue.id, storeId }), { mode: 0o600 });
      process.stdout.write("UI QA fixtures ready. Send a newline to clean up.\n");
      await new Promise<void>(resolve => {
        process.stdin.once("data", () => resolve());
        process.once("SIGTERM", () => resolve());
      });
    }
  } finally {
    if (userIds.length) {
      const rounds = await db.inspectionRectificationRound.findMany({ where: { responsibleUserId: { in: userIds } }, select: { id: true } });
      await db.r2StorageReference.deleteMany({ where: { businessType: "INSPECTION_RECTIFICATION", businessId: { in: rounds.map(row => row.id) } } });
      await db.inspectionRectificationRound.deleteMany({ where: { responsibleUserId: { in: userIds } } });
      const records = await db.taskRecord.findMany({ where: { assignedUserId: { in: userIds } }, select: { id: true } });
      const recordIds = records.map(row => row.id);
      await db.taskSubmissionItem.deleteMany({ where: { submission: { taskRecordId: { in: recordIds } } } });
      await db.taskSubmission.deleteMany({ where: { taskRecordId: { in: recordIds } } });
      await db.taskAttachment.deleteMany({ where: { taskRecordId: { in: recordIds } } });
      await db.taskRecord.deleteMany({ where: { id: { in: recordIds } } });
      await db.notificationRecipient.deleteMany({ where: { notification: { createdByUserId: { in: userIds } } } });
      await db.notification.deleteMany({ where: { createdByUserId: { in: userIds } } });
      if (storeId) {
        await db.inspectionRectification.deleteMany({ where: { reviewItem: { review: { storeId } } } });
        await db.leadH5ReviewPhoto.deleteMany({ where: { storeId } }); await db.leadH5ReviewItem.deleteMany({ where: { review: { storeId } } }); await db.leadH5Review.deleteMany({ where: { storeId } });
        await db.personnel.deleteMany({ where: { storeId } }); await db.store.delete({ where: { id: storeId } });
      }
      await db.operationLog.deleteMany({ where: { userId: { in: userIds } } });
      await db.assessment.deleteMany({ where: { id: { in: assessmentIds } } });
      if (r2Id) {
        await db.r2StorageReference.deleteMany({ where: { r2ConfigId: r2Id } });
        const current = await db.r2StorageConfig.findUnique({ where: { id: r2Id } });
        if (current) { await deleteR2Config(r2Id, current.updatedAt.toISOString()); await db.r2StorageConfig.delete({ where: { id: r2Id } }); }
      }
      if (brandId) await db.brand.delete({ where: { id: brandId } });
      await db.user.deleteMany({ where: { id: { in: userIds } } });
    }
    if (roleId) await db.role.delete({ where: { id: roleId } });
    if (await db.taskRecord.count({ where: { taskId: RECTIFICATION_TASK_ID } }) === 0) await db.task.deleteMany({ where: { id: RECTIFICATION_TASK_ID } });
    for (const file of files) await rm(file, { force: true });
    await rm(path.join(process.cwd(), ".rectification-qa-session.json"), { force: true });
    await new Promise<void>(resolve => storage.close(() => resolve())); await db.$disconnect();
  }
}

main().catch(error => { process.stderr.write(`${error instanceof Error ? error.message : "整改验证失败"}\n`); process.exitCode = 1; });

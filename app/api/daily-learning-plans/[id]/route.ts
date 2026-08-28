import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import {
  dailyLearningCan, dailyLearningInputSchema, dailyLearningTags, matchingAssigneeData,
  normalizeDailyLearningInput, safeDailyLearningError, serializeDailyLearningPlan,
} from "@/lib/daily-learning";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!dailyLearningCan(session, "view")) return NextResponse.json({ message: "暂无每日学习查看权限" }, { status: 403 });
  const { id } = await context.params;
  const plan = await db.dailyLearningPlan.findFirst({ where: { id, deletedAt: null }, include: { _count: { select: { assignees: true, progress: true } } } });
  if (!plan) return NextResponse.json({ message: "每日学习计划不存在" }, { status: 404 });
  void writeOperationLog({ userId: session.userId, username: session.username, page: "每日学习", action: "查看", result: "成功", detail: `查看计划：${plan.recordNo}`, request }).catch(() => undefined);
  return NextResponse.json({ ...serializeDailyLearningPlan(plan, plan._count.progress), assigneeCount: plan._count.assignees });
}

export async function PUT(request: Request, context: Context) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!dailyLearningCan(session, "edit")) return NextResponse.json({ message: "暂无每日学习编辑权限" }, { status: 403 });
  const parsed = dailyLearningInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message }, { status: 400 });
  if (!parsed.data.version) return NextResponse.json({ message: "缺少计划版本，请刷新后重试" }, { status: 400 });
  const { id } = await context.params;
  try {
    const existing = await db.dailyLearningPlan.findFirst({ where: { id, deletedAt: null } });
    if (!existing) return NextResponse.json({ message: "每日学习计划不存在" }, { status: 404 });
    if (new Date() >= existing.weekStartAt) return NextResponse.json({ message: "当前学习计划已进入执行周期，不允许编辑" }, { status: 409 });
    const normalized = normalizeDailyLearningInput({ ...parsed.data, isoYear: existing.isoYear, isoWeek: existing.isoWeek });
    const tags = await dailyLearningTags();
    if (!tags.includes(normalized.studentTag)) return NextResponse.json({ message: "所选学员标签不存在或已失效，请重新选择" }, { status: 400 });
    const assignees = await matchingAssigneeData(normalized.studentTag);
    const plan = await db.$transaction(async tx => {
      const progressCount = await tx.dailyLearningProgress.count({ where: { planId: id } });
      if (progressCount) throw new Error("当前学习计划已有学习记录，不允许编辑");
      const updated = await tx.dailyLearningPlan.updateMany({ where: { id, deletedAt: null, version: parsed.data.version }, data: { ...normalized, version: { increment: 1 } } });
      if (!updated.count) throw new Error("当前学习计划已被其他用户修改，请刷新后重新操作");
      await tx.dailyLearningAssignee.deleteMany({ where: { planId: id } });
      if (assignees.length) await tx.dailyLearningAssignee.createMany({ data: assignees.map(item => ({ ...item, planId: id })) });
      return tx.dailyLearningPlan.findUniqueOrThrow({ where: { id } });
    });
    await writeOperationLog({ userId: session.userId, username: session.username, page: "每日学习", action: "编辑", result: "成功", detail: `编辑计划：${plan.recordNo}，标签：${plan.studentTag}，应学习人数：${assignees.length}`, request });
    return NextResponse.json(serializeDailyLearningPlan(plan));
  } catch (error) {
    const message = safeDailyLearningError(error, "每日学习计划编辑失败，请稍后重试");
    await writeOperationLog({ userId: session.userId, username: session.username, page: "每日学习", action: "编辑", result: "失败", detail: message, request }).catch(() => undefined);
    return NextResponse.json({ message }, { status: message.includes("其他用户") || message.includes("执行周期") ? 409 : 400 });
  }
}

export async function DELETE(request: Request, context: Context) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!dailyLearningCan(session, "delete")) return NextResponse.json({ message: "暂无每日学习删除权限" }, { status: 403 });
  const { id } = await context.params;
  try {
    const plan = await db.$transaction(async tx => {
      const existing = await tx.dailyLearningPlan.findFirst({ where: { id, deletedAt: null } });
      if (!existing) throw new Error("每日学习计划不存在");
      if (await tx.dailyLearningProgress.count({ where: { planId: id } })) throw new Error("已有用户产生学习记录，不支持删除");
      await tx.dailyLearningAssignee.deleteMany({ where: { planId: id } });
      return tx.dailyLearningPlan.update({ where: { id }, data: { deletedAt: new Date(), activeKey: null, version: { increment: 1 } } });
    });
    await writeOperationLog({ userId: session.userId, username: session.username, page: "每日学习", action: "删除", result: "成功", detail: `删除计划：${plan.recordNo}，${plan.isoYear}年第${plan.isoWeek}周，标签：${plan.studentTag}`, request });
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = safeDailyLearningError(error, "每日学习计划删除失败，请稍后重试");
    await writeOperationLog({ userId: session.userId, username: session.username, page: "每日学习", action: "删除", result: "失败", detail: message, request }).catch(() => undefined);
    return NextResponse.json({ message }, { status: message.includes("学习记录") ? 409 : 400 });
  }
}

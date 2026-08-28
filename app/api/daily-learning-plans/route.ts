import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import {
  currentIsoWeek, dailyLearningCan, dailyLearningInputSchema, dailyLearningTags, matchingAssigneeData,
  nextDailyLearningRecordNo, normalizeDailyLearningInput, safeDailyLearningError, serializeDailyLearningPlan,
} from "@/lib/daily-learning";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!dailyLearningCan(session, "query")) return NextResponse.json({ message: "暂无每日学习查询权限" }, { status: 403 });
  const url = new URL(request.url);
  const year = Number(url.searchParams.get("year")) || undefined;
  const week = Number(url.searchParams.get("week")) || undefined;
  const studentTag = (url.searchParams.get("studentTag") || "").trim();
  const creatorKeyword = (url.searchParams.get("creatorKeyword") || "").trim();
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(20, Number(url.searchParams.get("pageSize")) || 20));
  const where: Prisma.DailyLearningPlanWhereInput = {
    deletedAt: null, ...(year ? { isoYear: year } : {}), ...(week ? { isoWeek: week } : {}),
    ...(studentTag ? { studentTag } : {}), ...(creatorKeyword ? { createdByName: { contains: creatorKeyword } } : {}),
  };
  try {
    const [total, rows] = await db.$transaction([
      db.dailyLearningPlan.count({ where }),
      db.dailyLearningPlan.findMany({ where, include: { _count: { select: { progress: true } } }, orderBy: [{ isoYear: "desc" }, { isoWeek: "desc" }, { createdAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    void writeOperationLog({ userId: session.userId, username: session.username, page: "每日学习", action: "筛选", result: "成功", detail: `年份：${year || "全部"}；周次：${week || "全部"}；学员标签：${studentTag || "全部"}；创建人：${creatorKeyword || "全部"}`, request }).catch(() => undefined);
    return NextResponse.json({ rows: rows.map(row => serializeDailyLearningPlan(row, row._count.progress)), total, page, pageSize });
  } catch {
    return NextResponse.json({ message: "每日学习计划加载失败，请稍后重试" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!dailyLearningCan(session, "create")) return NextResponse.json({ message: "暂无每日学习新增权限" }, { status: 403 });
  const parsed = dailyLearningInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message }, { status: 400 });
  try {
    const normalized = normalizeDailyLearningInput(parsed.data);
    const current = currentIsoWeek();
    if (normalized.isoYear < current.isoYear || (normalized.isoYear === current.isoYear && normalized.isoWeek < current.isoWeek)) {
      return NextResponse.json({ message: "只能新增本周或未来的每日学习计划" }, { status: 400 });
    }
    const tags = await dailyLearningTags();
    if (!tags.includes(normalized.studentTag)) return NextResponse.json({ message: "所选学员标签不存在或已失效，请重新选择" }, { status: 400 });
    const assignees = await matchingAssigneeData(normalized.studentTag);
    const plan = await db.$transaction(async tx => {
      const recordNo = await nextDailyLearningRecordNo(tx);
      return tx.dailyLearningPlan.create({ data: {
        ...normalized, recordNo, createdByUserId: session.userId, createdByName: session.realName,
        assignees: { createMany: { data: assignees } },
      } });
    });
    await writeOperationLog({ userId: session.userId, username: session.username, page: "每日学习", action: "新增", result: "成功", detail: `新增计划：${plan.recordNo}，${plan.isoYear}年第${plan.isoWeek}周，标签：${plan.studentTag}，应学习人数：${assignees.length}`, request });
    return NextResponse.json(serializeDailyLearningPlan(plan), { status: 201 });
  } catch (error) {
    const message = safeDailyLearningError(error, "每日学习计划新增失败，请稍后重试");
    await writeOperationLog({ userId: session.userId, username: session.username, page: "每日学习", action: "新增", result: "失败", detail: message, request }).catch(() => undefined);
    return NextResponse.json({ message }, { status: message.includes("已存在") ? 409 : 400 });
  }
}

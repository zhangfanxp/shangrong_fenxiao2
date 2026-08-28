import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { currentIsoWeek, dailyLearningCan, dailyLearningTags, nextIsoWeeks, weekRangeText, weeksInIsoYear } from "@/lib/daily-learning";
import { db } from "@/lib/db";

export async function GET() {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!dailyLearningCan(session, "query") && !dailyLearningCan(session, "create")) return NextResponse.json({ message: "暂无每日学习访问权限" }, { status: 403 });
  try {
    const [tags, years] = await Promise.all([
      dailyLearningTags(),
      db.dailyLearningPlan.findMany({ where: { deletedAt: null }, distinct: ["isoYear"], select: { isoYear: true }, orderBy: { isoYear: "desc" } }),
    ]);
    const current = currentIsoWeek();
    return NextResponse.json({
      tags, years: [...new Set([current.isoYear, ...years.map(item => item.isoYear)])].sort((a, b) => b - a),
      currentWeek: { ...current, rangeText: weekRangeText(current.isoYear, current.isoWeek) },
      nextWeeks: nextIsoWeeks(), currentUserName: session.realName,
      weeksByYear: Object.fromEntries([...new Set([current.isoYear, ...years.map(item => item.isoYear), ...nextIsoWeeks().map(item => item.isoYear)])].map(year => [year, weeksInIsoYear(year)])),
    });
  } catch {
    return NextResponse.json({ message: "学员标签加载失败，请稍后重试" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";
import { calendarMonthOptions, canTaskCalendarTemplate, dateKeyToDbDate, dateKeysForMonth, isEditableCalendarDate, shiftMonth } from "@/lib/task-calendar";

const dateSchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式不正确"), hasTask: z.boolean(), content: z.string().optional().default(""), remark: z.string().optional().default("") });
const bodySchema = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/, "月份格式不正确"), dates: z.array(dateSchema).min(1) });

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canTaskCalendarTemplate(session.permissions, "view")) return NextResponse.json({ message: "暂无查看日历任务模版权限" }, { status: 403 });
  const { id } = await params;
  const month = new URL(request.url).searchParams.get("month") || "";
  if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ message: "月份格式不正确" }, { status: 400 });
  const monthStart = dateKeyToDbDate(`${month}-01`);
  const nextMonthStart = dateKeyToDbDate(`${shiftMonth(month, 1)}-01`);
  const existingMonth = await db.taskCalendarDate.count({ where: { templateId: id, calendarDate: { gte: monthStart, lt: nextMonthStart } } });
  if (!calendarMonthOptions().includes(month) && !existingMonth) return NextResponse.json({ message: "只能查看当前月及未来两个月，或模版中已经存在的历史月份" }, { status: 400 });
  const rows = await db.taskCalendarDate.findMany({ where: { templateId: id, calendarDate: { gte: monthStart, lt: nextMonthStart } }, orderBy: { calendarDate: "asc" } });
  return NextResponse.json({ month, rows: rows.map(row => ({ date: row.calendarDate.toISOString().slice(0, 10), hasTask: row.hasTask, content: row.content || "", remark: row.remark || "" })) });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canTaskCalendarTemplate(session.permissions, "calendar-edit")) return NextResponse.json({ message: "暂无维护日历任务模版权限" }, { status: 403 });
  const { id } = await params;
  if (!await db.taskCalendarTemplate.findUnique({ where: { id }, select: { id: true } })) return NextResponse.json({ message: "日历任务模版不存在" }, { status: 404 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message }, { status: 400 });
  const allowedDates = new Set(dateKeysForMonth(parsed.data.month));
  if (!calendarMonthOptions().includes(parsed.data.month) || parsed.data.dates.some(item => !allowedDates.has(item.date))) return NextResponse.json({ message: "只能维护当前月及未来两个月的日历" }, { status: 400 });
  if (parsed.data.dates.some(item => item.hasTask && !item.content.trim())) return NextResponse.json({ message: "已勾选任务的日期必须填写内容" }, { status: 400 });
  if (parsed.data.dates.some(item => !item.hasTask && (item.content || "").trim())) return NextResponse.json({ message: "未勾选任务的日期内容必须为空" }, { status: 400 });
  const editable = parsed.data.dates.filter(item => isEditableCalendarDate(item.date));
  await db.$transaction(async tx => {
    for (const item of editable) {
      await tx.taskCalendarDate.upsert({ where: { templateId_calendarDate: { templateId: id, calendarDate: dateKeyToDbDate(item.date) } }, create: { templateId: id, calendarDate: dateKeyToDbDate(item.date), hasTask: item.hasTask, content: item.hasTask ? item.content.trim() : null, remark: item.remark.trim() || null }, update: { hasTask: item.hasTask, content: item.hasTask ? item.content.trim() : null, remark: item.remark.trim() || null } });
    }
  });
  await writeOperationLog({ userId: session.userId, username: session.username, page: "日历任务模版", action: "编辑日历", result: "成功", detail: `维护日历模版：${id}；月份：${parsed.data.month}`, request });
  return NextResponse.json({ message: "日历保存成功" });
}

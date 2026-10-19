import { RecordStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";
import { canTaskCalendarTemplate, dbDateToKey } from "@/lib/task-calendar";

const templateSchema = z.object({
  name: z.string().trim().min(1, "请输入日历任务模版名称").refine(value => Array.from(value).length <= 20, "模版名称不能超过20个汉字"),
  remark: z.string().max(100, "备注不能超过100个字符").optional().default(""),
  status: z.nativeEnum(RecordStatus),
});

async function getTemplate(id: string) {
  return db.taskCalendarTemplate.findUnique({ where: { id }, include: { task: { select: { id: true, recordNo: true, title: true } }, createdBy: { select: { realName: true } }, dates: { orderBy: { calendarDate: "asc" } } } });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canTaskCalendarTemplate(session.permissions, "view")) return NextResponse.json({ message: "暂无查看日历任务模版权限" }, { status: 403 });
  const { id } = await params;
  const row = await getTemplate(id);
  if (!row) return NextResponse.json({ message: "日历任务模版不存在" }, { status: 404 });
  return NextResponse.json({ ...row, dates: row.dates.map(item => ({ ...item, date: dbDateToKey(item.calendarDate) })) });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canTaskCalendarTemplate(session.permissions, "edit")) return NextResponse.json({ message: "暂无编辑日历任务模版权限" }, { status: 403 });
  const { id } = await params;
  if (!await getTemplate(id)) return NextResponse.json({ message: "日历任务模版不存在" }, { status: 404 });
  const parsed = templateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message }, { status: 400 });
  const row = await db.taskCalendarTemplate.update({ where: { id }, data: { name: parsed.data.name, remark: parsed.data.remark || null, status: parsed.data.status } });
  await writeOperationLog({ userId: session.userId, username: session.username, page: "日历任务模版", action: "编辑", result: "成功", detail: `编辑日历任务模版：${row.recordNo}`, request });
  return NextResponse.json(row);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canTaskCalendarTemplate(session.permissions, "delete")) return NextResponse.json({ message: "暂无删除日历任务模版权限" }, { status: 403 });
  const { id } = await params;
  const row = await getTemplate(id);
  if (!row) return NextResponse.json({ message: "日历任务模版不存在" }, { status: 404 });
  if (row.task) return NextResponse.json({ message: `该模版已被任务${row.task.recordNo || row.task.title}调用，不支持删除。` }, { status: 400 });
  await db.taskCalendarTemplate.delete({ where: { id } });
  await writeOperationLog({ userId: session.userId, username: session.username, page: "日历任务模版", action: "删除", result: "成功", detail: `删除日历任务模版：${row.recordNo}`, request });
  return NextResponse.json({ message: "日历任务模版删除成功" });
}

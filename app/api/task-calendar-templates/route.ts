import { RecordStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";
import { canTaskCalendarTemplate } from "@/lib/task-calendar";

const templateSchema = z.object({
  name: z.string().trim().min(1, "请输入日历任务模版名称").refine(value => Array.from(value).length <= 20, "模版名称不能超过20个汉字"),
  remark: z.string().max(100, "备注不能超过100个字符").optional().default(""),
  status: z.nativeEnum(RecordStatus).default(RecordStatus.ENABLED),
});

async function nextRecordNo() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: string) => parts.find(item => item.type === type)?.value || "";
  const prefix = `${part("year")}${part("month")}${part("day")}`;
  const existing = await db.taskCalendarTemplate.findMany({ where: { recordNo: { startsWith: prefix } }, select: { recordNo: true } });
  const next = existing.reduce((max, item) => Math.max(max, Number(item.recordNo.slice(-4)) || 0), 0) + 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canTaskCalendarTemplate(session.permissions, "query") && !canTaskCalendarTemplate(session.permissions, "view")) return NextResponse.json({ message: "暂无日历任务模版查询权限" }, { status: 403 });
  const url = new URL(request.url);
  const keyword = (url.searchParams.get("keyword") || "").trim();
  const status = url.searchParams.get("status") || "";
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(10, Number(url.searchParams.get("pageSize")) || 10));
  const where = { ...(keyword ? { name: { contains: keyword } } : {}), ...(status === "ENABLED" || status === "DISABLED" ? { status: status as RecordStatus } : {}) };
  const [total, rows] = await db.$transaction([
    db.taskCalendarTemplate.count({ where }),
    db.taskCalendarTemplate.findMany({ where, include: { task: { select: { id: true, recordNo: true, title: true } }, createdBy: { select: { realName: true } }, dates: { select: { calendarDate: true } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  return NextResponse.json({ rows: rows.map(row => { const calendarMonths = [...new Set(row.dates.map(item => item.calendarDate.toISOString().slice(0, 7)))].sort(); return { ...row, calendarMonthCount: calendarMonths.length, calendarMonths, dates: undefined }; }), total, page, pageSize });
}

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canTaskCalendarTemplate(session.permissions, "create")) return NextResponse.json({ message: "暂无新增日历任务模版权限" }, { status: 403 });
  const parsed = templateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message }, { status: 400 });
  try {
    const recordNo = await nextRecordNo();
    const row = await db.taskCalendarTemplate.create({ data: { recordNo, name: parsed.data.name, remark: parsed.data.remark || null, status: parsed.data.status, createdByUserId: session.userId } });
    await writeOperationLog({ userId: session.userId, username: session.username, page: "日历任务模版", action: "新增", result: "成功", detail: `新增日历任务模版：${row.recordNo}`, request });
    return NextResponse.json(row, { status: 201 });
  } catch {
    return NextResponse.json({ message: "日历任务模版创建失败，请稍后重试" }, { status: 400 });
  }
}

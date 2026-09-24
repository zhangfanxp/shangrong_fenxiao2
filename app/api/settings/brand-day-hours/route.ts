import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession, sessionHasPermission } from "@/lib/auth";
import { addAttendanceParameter, BrandDayHourConfigError, getAttendanceParameterEntries, updateAttendanceParameter } from "@/lib/brand-day-hour-config";
import { getBusinessDictionaryOptions } from "@/lib/business-dictionaries";
import { DictionaryConfigError } from "@/lib/dictionary-config";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";

const inputSchema = z.object({
  brand: z.string().trim().min(1, "请选择品牌"),
  workdayHours: z.number({ message: "请输入工作日小时" }).positive("工作日小时必须大于0").max(24, "工作日小时不能超过24小时").refine(value => Math.abs(value * 10 - Math.round(value * 10)) < 1e-8, "工作日小时最多支持小数点后一位"),
  attendanceStartDayOffset: z.union([z.literal(0), z.literal(1)], { message: "请选择考勤开始日期" }),
  attendanceStartTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "请选择正确的考勤开始时间"),
  attendanceDeadlineDayOffset: z.union([z.literal(0), z.literal(1)], { message: "请选择考勤截止日期" }),
  attendanceDeadlineTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "请选择正确的考勤截止时间"),
}).superRefine((value, context) => {
  const minutes = (dayOffset: 0 | 1, time: string) => dayOffset * 24 * 60 + Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  if (minutes(value.attendanceStartDayOffset, value.attendanceStartTime) >= minutes(value.attendanceDeadlineDayOffset, value.attendanceDeadlineTime)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["attendanceDeadlineTime"], message: "考勤截止时间必须晚于考勤开始时间" });
  }
});

function forbidden() { return NextResponse.json({ message: "暂无系统参数维护权限" }, { status: 403 }); }

export async function GET() {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!sessionHasPermission(session, "settings:parameters")) return forbidden();
  try {
    const [rows, brandOptions] = await Promise.all([getAttendanceParameterEntries(), getBusinessDictionaryOptions("BRAND")]);
    return NextResponse.json({ rows, brandOptions });
  } catch (error) {
    const message = error instanceof Error ? error.message : "考勤参数加载失败，请稍后重试";
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!sessionHasPermission(session, "settings:parameters")) return forbidden();
  try {
    const parsed = inputSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message }, { status: 400 });
    const brandOptions = await getBusinessDictionaryOptions("BRAND");
    if (!brandOptions.some(option => option.value === parsed.data.brand)) return NextResponse.json({ message: "所选品牌不在已启用的BRAND数据字典中" }, { status: 400 });
    const saved = await addAttendanceParameter(parsed.data);
    const start = `${saved.attendanceStartDayOffset === 1 ? "次日" : "当日"} ${saved.attendanceStartTime}`;
    const deadline = `${saved.attendanceDeadlineDayOffset === 1 ? "次日" : "当日"} ${saved.attendanceDeadlineTime}`;
    await writeOperationLog({ userId: session.userId, username: session.username, page: "系统参数", action: "修改参数", result: "成功", detail: `新增考勤参数；${saved.brand}：${saved.workdayHours}小时/日，考勤时段${start}至${deadline}`, request }).catch(() => undefined);
    return NextResponse.json(saved, { status: 201 });
  } catch (error) {
    const known = error instanceof BrandDayHourConfigError || error instanceof DictionaryConfigError;
    return NextResponse.json({ message: known ? error.message : "考勤参数保存失败，请稍后重试" }, { status: known ? 400 : 500 });
  }
}

export async function PUT(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!sessionHasPermission(session, "settings:parameters")) return forbidden();
  try {
    const parsed = inputSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message }, { status: 400 });
    const saved = await updateAttendanceParameter(parsed.data);
    const start = `${saved.attendanceStartDayOffset === 1 ? "次日" : "当日"} ${saved.attendanceStartTime}`;
    const deadline = `${saved.attendanceDeadlineDayOffset === 1 ? "次日" : "当日"} ${saved.attendanceDeadlineTime}`;
    await writeOperationLog({ userId: session.userId, username: session.username, page: "系统参数", action: "修改参数", result: "成功", detail: `编辑考勤参数；${saved.brand}：${saved.workdayHours}小时/日，考勤时段${start}至${deadline}`, request }).catch(() => undefined);
    return NextResponse.json(saved);
  } catch (error) {
    const known = error instanceof BrandDayHourConfigError;
    return NextResponse.json({ message: known ? error.message : "考勤参数保存失败，请稍后重试" }, { status: known ? 400 : 500 });
  }
}

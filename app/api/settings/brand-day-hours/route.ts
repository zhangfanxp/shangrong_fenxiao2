import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession, sessionHasPermission } from "@/lib/auth";
import { addBrandDayHour, BrandDayHourConfigError, getBrandDayHourEntries } from "@/lib/brand-day-hour-config";
import { getBusinessDictionaryOptions } from "@/lib/business-dictionaries";
import { DictionaryConfigError } from "@/lib/dictionary-config";
import { db } from "@/lib/db";

const inputSchema = z.object({
  brand: z.string().trim().min(1, "请选择品牌"),
  workdayHours: z.number({ message: "请输入工作日小时" }).positive("工作日小时必须大于0").max(24, "工作日小时不能超过24小时").refine(value => Math.abs(value * 10 - Math.round(value * 10)) < 1e-8, "工作日小时最多支持小数点后一位"),
});

function forbidden() { return NextResponse.json({ message: "暂无系统参数维护权限" }, { status: 403 }); }

export async function GET() {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!sessionHasPermission(session, "settings:parameters")) return forbidden();
  try {
    const [rows, brandOptions] = await Promise.all([getBrandDayHourEntries(), getBusinessDictionaryOptions("BRAND")]);
    return NextResponse.json({ rows, brandOptions });
  } catch (error) {
    const message = error instanceof Error ? error.message : "品牌工作日小时加载失败，请稍后重试";
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
    const saved = await addBrandDayHour(parsed.data.brand, parsed.data.workdayHours);
    await db.operationLog.create({ data: { userId: session.userId, page: "系统参数", action: "新增品牌工作日小时", result: "成功", detail: `${saved.brand}：${saved.workdayHours}小时/日` } }).catch(() => undefined);
    return NextResponse.json(saved, { status: 201 });
  } catch (error) {
    const known = error instanceof BrandDayHourConfigError || error instanceof DictionaryConfigError;
    return NextResponse.json({ message: known ? error.message : "品牌工作日小时保存失败，请稍后重试" }, { status: known ? 400 : 500 });
  }
}

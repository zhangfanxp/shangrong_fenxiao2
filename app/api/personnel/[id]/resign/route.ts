import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { checkPersonnelResignation, OutstandingReturnsError, personnelResignationSchema, resignPersonnel } from "@/lib/personnel-resignation";
import { canPersonnel, personnelLog } from "@/lib/personnel-service";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canPersonnel(session, "resign")) return NextResponse.json({ message: "无人员离职权限" }, { status: 403 });
  const { id } = await params;

  try {
    const result = await checkPersonnelResignation(id);
    if (!result) return NextResponse.json({ message: "人员档案不存在或已删除" }, { status: 404 });
    await personnelLog(session.userId, "离职返还检查", "成功", `人员：${result.personnel.recordNo} ${result.personnel.name}；待返还${result.rows.length}项`);
    return NextResponse.json({ rows: result.rows, canResign: result.rows.length === 0 });
  } catch {
    await personnelLog(session.userId, "离职返还检查", "失败", `人员ID：${id}；检查失败`);
    return NextResponse.json({ message: "离职物品返还情况检查失败，请稍后重试" }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canPersonnel(session, "resign")) return NextResponse.json({ message: "无人员离职权限" }, { status: 403 });
  const parsed = personnelResignationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message || "离职参数不正确" }, { status: 400 });
  const { id } = await params;

  try {
    const result = await resignPersonnel({ personnelId: id, ...parsed.data });

    await personnelLog(session.userId, "离职", "成功", `人员：${result.row.recordNo}；离职需返还物品已全部返还；平台账号${result.platformUserDisabled ? "已禁用" : "未变更"}`);
    return NextResponse.json(result.row);
  } catch (error) {
    if (error instanceof OutstandingReturnsError) {
      await personnelLog(session.userId, "离职", "失败", `人员ID：${id}；存在${error.rows.length}项离职待返还物品`);
      return NextResponse.json({ message: error.message, outstandingReturns: error.rows }, { status: 409 });
    }
    const message = error instanceof Error && [
      "人员档案不存在或已删除", "该员工已经离职，不能重复操作", "离职日期不能早于入职日期",
    ].includes(error.message) ? error.message : "员工离职办理失败，请稍后重试";
    await personnelLog(session.userId, "离职", "失败", `人员ID：${id}；${message}`);
    return NextResponse.json({ message }, { status: message.includes("不存在") ? 404 : 400 });
  }
}

import { NextResponse } from "next/server";
import { writeOperationLog } from "@/lib/operation-log";
import { checkPersonnelResignation, OutstandingReturnsError, personnelResignationSchema, resignPersonnel } from "@/lib/personnel-resignation";
import { getStoreH5Session } from "@/lib/store-h5-auth";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getStoreH5Session("store-h5:my-store:employees:resign");
  if (!session) return NextResponse.json({ message: "登录状态已失效或暂无员工离职权限" }, { status: 401 });
  if (!session.storeId) return NextResponse.json({ message: "当前账号尚未关联门店" }, { status: 409 });
  const { id } = await params;
  try {
    const result = await checkPersonnelResignation(id, session.storeId);
    if (!result) return NextResponse.json({ message: "员工记录不存在或不属于当前门店" }, { status: 404 });
    await writeOperationLog({
      userId: session.userId, username: session.username, client: "门店员工移动端", page: "我的门店-员工", action: "离职返还检查", result: "成功",
      detail: `员工：${result.personnel.recordNo} ${result.personnel.name}；待返还${result.rows.length}项`, request,
    }).catch(() => undefined);
    return NextResponse.json({ rows: result.rows, canResign: result.canResign }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch {
    await writeOperationLog({ userId: session.userId, username: session.username, client: "门店员工移动端", page: "我的门店-员工", action: "离职返还检查", result: "失败", detail: `员工ID：${id}；检查失败`, request }).catch(() => undefined);
    return NextResponse.json({ message: "离职物品返还情况检查失败，请稍后重试" }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getStoreH5Session("store-h5:my-store:employees:resign");
  if (!session) return NextResponse.json({ message: "登录状态已失效或暂无员工离职权限" }, { status: 401 });
  if (!session.storeId) return NextResponse.json({ message: "当前账号尚未关联门店" }, { status: 409 });
  const parsed = personnelResignationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message || "离职参数不正确" }, { status: 400 });
  const { id } = await params;
  try {
    const result = await resignPersonnel({ personnelId: id, storeId: session.storeId, ...parsed.data });
    await writeOperationLog({
      userId: session.userId, username: session.username, client: "门店员工移动端", page: "我的门店-员工", action: "离职", result: "成功",
      detail: `员工：${result.row.recordNo}；离职需返还物品已全部返还；平台账号${result.platformUserDisabled ? "已禁用" : "未变更"}`, request,
    }).catch(() => undefined);
    return NextResponse.json(result.row);
  } catch (error) {
    if (error instanceof OutstandingReturnsError) {
      await writeOperationLog({ userId: session.userId, username: session.username, client: "门店员工移动端", page: "我的门店-员工", action: "离职", result: "失败", detail: `员工ID：${id}；存在${error.rows.length}项离职待返还物品`, request }).catch(() => undefined);
      return NextResponse.json({ message: error.message, outstandingReturns: error.rows }, { status: 409 });
    }
    const message = error instanceof Error && [
      "人员档案不存在或已删除", "该员工已经离职，不能重复操作", "离职日期不能早于入职日期",
    ].includes(error.message) ? error.message : "员工离职办理失败，请稍后重试";
    await writeOperationLog({ userId: session.userId, username: session.username, client: "门店员工移动端", page: "我的门店-员工", action: "离职", result: "失败", detail: `员工ID：${id}；${message}`, request }).catch(() => undefined);
    return NextResponse.json({ message }, { status: message.includes("不存在") ? 404 : 400 });
  }
}

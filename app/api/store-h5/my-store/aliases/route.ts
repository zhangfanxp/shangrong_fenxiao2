import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";
import { getStoreH5Session } from "@/lib/store-h5-auth";

const aliasValue = (label: string) => z.string().trim().refine(value => Array.from(value).length <= 50, `${label}不能超过50个字符`).transform(value => value || null);
const schema = z.object({
  douyinLaikeName: aliasValue("抖音来客"),
  kuaishouName: aliasValue("快手"),
  meituanManagerName: aliasValue("美团管家"),
  meituanBusinessName: aliasValue("美团经营宝"),
});
const select = { id: true, name: true, recordNo: true, douyinLaikeName: true, kuaishouName: true, meituanManagerName: true, meituanBusinessName: true } satisfies Prisma.StoreSelect;

export async function GET(request: Request) {
  const session = await getStoreH5Session("store-h5:my-store:aliases:view");
  if (!session) return NextResponse.json({ message: "登录状态已失效或暂无别名查看权限" }, { status: 401 });
  if (!session.storeId) return NextResponse.json({ message: "当前账号尚未关联门店" }, { status: 409 });
  try {
    const store = await db.store.findUnique({ where: { id: session.storeId }, select });
    if (!store) return NextResponse.json({ message: "当前门店不存在或已删除" }, { status: 404 });
    await writeOperationLog({ userId: session.userId, username: session.username, client: "门店员工移动端", page: "我的门店-别名", action: "查看", result: "成功", detail: `门店：${store.recordNo}（${store.name}）`, request }).catch(() => undefined);
    return NextResponse.json(store, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch {
    return NextResponse.json({ message: "门店别名加载失败，请稍后重试" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = await getStoreH5Session("store-h5:my-store:aliases:edit");
  if (!session) return NextResponse.json({ message: "登录状态已失效或暂无别名编辑权限" }, { status: 401 });
  if (!session.storeId) return NextResponse.json({ message: "当前账号尚未关联门店" }, { status: 409 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message || "别名数据格式不正确" }, { status: 400 });
  try {
    const store = await db.store.update({ where: { id: session.storeId }, data: parsed.data, select });
    await writeOperationLog({ userId: session.userId, username: session.username, client: "门店员工移动端", page: "我的门店-别名", action: "编辑", result: "成功", detail: `保存门店别名：${store.recordNo}（${store.name}）`, request }).catch(() => undefined);
    return NextResponse.json(store);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return NextResponse.json({ message: "当前门店不存在或已删除" }, { status: 404 });
    return NextResponse.json({ message: "门店别名保存失败，请稍后重试" }, { status: 500 });
  }
}

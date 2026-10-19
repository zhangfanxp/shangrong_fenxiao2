import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession, sessionHasPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";
import { canStoreListAction } from "@/lib/store-permissions";

const aliasValue = (label: string) => z.string().trim().refine(
  value => Array.from(value).length <= 50,
  `${label}不能超过50个字符`,
).transform(value => value || null);

const storeAliasSchema = z.object({
  douyinLaikeName: aliasValue("抖音来客（店名）"),
  kuaishouName: aliasValue("快手（店名）"),
  meituanManagerName: aliasValue("美团管家（店名）"),
  meituanBusinessName: aliasValue("美团经营宝（店名）"),
});

const storeAliasSelect = {
  id: true,
  name: true,
  recordNo: true,
  douyinLaikeName: true,
  kuaishouName: true,
  meituanManagerName: true,
  meituanBusinessName: true,
} satisfies Prisma.StoreSelect;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canStoreListAction(session.permissions, "view") && !sessionHasPermission(session, "stores:aliases:edit")) return NextResponse.json({ message: "暂无门店别名查看权限" }, { status: 403 });

  const store = await db.store.findUnique({ where: { id: (await params).id }, select: storeAliasSelect });
  if (!store) return NextResponse.json({ message: "门店不存在或已删除" }, { status: 404 });
  await writeOperationLog({ userId: session.userId, username: session.username, page: "门店列表", action: "查看别名", result: "成功", detail: `查看门店别名：${store.recordNo}（${store.name}）`, request }).catch(() => undefined);
  return NextResponse.json(store);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!sessionHasPermission(session, "stores:aliases:edit")) return NextResponse.json({ message: "暂无门店别名编辑权限" }, { status: 403 });

  const parsed = storeAliasSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message }, { status: 400 });
  try {
    const store = await db.store.update({ where: { id: (await params).id }, data: parsed.data, select: storeAliasSelect });
    await writeOperationLog({ userId: session.userId, username: session.username, page: "门店列表", action: "编辑别名", result: "成功", detail: `保存门店别名：${store.recordNo}（${store.name}）`, request }).catch(() => undefined);
    return NextResponse.json(store);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return NextResponse.json({ message: "门店不存在或已删除" }, { status: 404 });
    throw error;
  }
}

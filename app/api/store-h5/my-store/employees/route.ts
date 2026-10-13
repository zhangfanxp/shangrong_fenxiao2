import { PersonnelStatus, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";
import { nextPersonnelRecordNo, personnelData, personnelInclude, validatePersonnelRelations } from "@/lib/personnel-service";
import { personnelInputSchema } from "@/lib/personnel-validation";
import { getStoreH5Session } from "@/lib/store-h5-auth";

export async function GET(request: Request) {
  const session = await getStoreH5Session("store-h5:my-store:employees:query");
  if (!session) return NextResponse.json({ message: "登录状态已失效或暂无员工查询权限" }, { status: 401 });
  if (!session.storeId) return NextResponse.json({ message: "当前账号尚未关联门店" }, { status: 409 });
  try {
    const rows = await db.personnel.findMany({
      where: { storeId: session.storeId, deletedAt: null },
      select: { id: true, recordNo: true, name: true, phone: true, positionLevel: true, baseSalary: true, status: true },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }, { id: "desc" }],
    });
    await writeOperationLog({ userId: session.userId, username: session.username, client: "门店员工移动端", page: "我的门店-员工", action: "查询", result: "成功", detail: `门店：${session.storeName || session.storeId}；员工：${rows.length}人`, request }).catch(() => undefined);
    return NextResponse.json({ storeName: session.storeName, rows }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch {
    return NextResponse.json({ message: "员工记录加载失败，请稍后重试" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getStoreH5Session("store-h5:my-store:employees:create");
  if (!session) return NextResponse.json({ message: "登录状态已失效或暂无新增员工权限" }, { status: 401 });
  if (!session.storeId) return NextResponse.json({ message: "当前账号尚未关联门店" }, { status: 409 });
  try {
    const [body, store] = await Promise.all([
      request.json(),
      db.store.findFirst({
        where: { id: session.storeId, operationStatus: { not: "CLOSED" } },
        select: { id: true, name: true, brand: { select: { name: true } } },
      }),
    ]);
    if (!store) return NextResponse.json({ message: "当前关联门店不存在或已关闭" }, { status: 409 });
    const parsed = personnelInputSchema.safeParse({
      ...body,
      status: PersonnelStatus.ACTIVE,
      organization: store.brand.name,
      department: null,
      storeId: store.id,
      laborCost: null,
      workdayHours: null,
    });
    if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message }, { status: 400 });
    const relation = await validatePersonnelRelations(parsed.data);
    const row = await db.$transaction(async tx => {
      const recordNo = await nextPersonnelRecordNo(tx);
      return tx.personnel.create({
        data: {
          ...personnelData(parsed.data, relation.positionLevel, relation.workdayHours, relation.laborCost),
          recordNo,
          createdByUserId: session.userId,
        },
        include: personnelInclude,
      });
    });
    await writeOperationLog({
      userId: session.userId,
      username: session.username,
      client: "门店员工移动端",
      page: "我的门店-员工",
      action: "新增",
      result: "成功",
      detail: `门店：${store.name}；员工：${row.recordNo} ${row.name}`,
      request,
    }).catch(() => undefined);
    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    const message = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
      ? "该身份证号码已存在人员档案"
      : error instanceof Error ? error.message : "员工新增失败，请稍后重试";
    await writeOperationLog({ userId: session.userId, username: session.username, client: "门店员工移动端", page: "我的门店-员工", action: "新增", result: "失败", detail: message, request }).catch(() => undefined);
    return NextResponse.json({ message }, { status: 400 });
  }
}

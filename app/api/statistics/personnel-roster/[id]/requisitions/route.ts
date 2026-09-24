import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { shanghaiDateTime, writeOperationLog } from "@/lib/operation-log";
import { canPersonnelRoster, personnelRosterDataScope } from "@/lib/personnel-roster";

function dateTimeText(value: Date) {
  const result = shanghaiDateTime(value);
  return `${result.operationDate} ${result.operationTime}`;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canPersonnelRoster(session, "query")) return NextResponse.json({ message: "暂无花名册查询权限" }, { status: 403 });
  const { id } = await params;
  try {
    const personnel = await db.personnel.findFirst({
      where: { AND: [await personnelRosterDataScope(session), { id }] },
      select: {
        id: true,
        name: true,
        organization: true,
        department: true,
        positionLevel: true,
        store: { select: { name: true } },
      },
    });
    if (!personnel) return NextResponse.json({ message: "人员档案不存在或无权查看" }, { status: 404 });
    const rows = await db.itemRequisition.findMany({
      where: { personnelId: personnel.id },
      select: {
        id: true,
        requisitionNo: true,
        itemNameSnapshot: true,
        itemTypeNameSnapshot: true,
        specificationSnapshot: true,
        unitSnapshot: true,
        quantity: true,
        manageStockSnapshot: true,
        createdByNameSnapshot: true,
        createdAt: true,
      },
      orderBy: [{ requisitionedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    });
    await writeOperationLog({
      userId: session.userId,
      username: session.username,
      client: "运营PC端",
      page: "花名册一览表",
      action: "查看领用记录",
      result: "成功",
      detail: `领用人：${personnel.name}；共 ${rows.length} 条`,
      request,
    }).catch(() => undefined);
    return NextResponse.json({
      personnel: {
        personnelId: personnel.id,
        name: personnel.name,
        departmentStore: personnel.organization === "总部" ? personnel.department : personnel.store?.name || null,
        positionLevel: personnel.positionLevel,
      },
      rows: rows.map(row => ({
        id: row.id,
        requisitionNo: row.requisitionNo,
        itemName: row.itemNameSnapshot,
        itemType: row.itemTypeNameSnapshot,
        specification: row.specificationSnapshot,
        unit: row.unitSnapshot,
        quantity: row.quantity,
        manageStock: row.manageStockSnapshot,
        createdByName: row.createdByNameSnapshot,
        createdAt: dateTimeText(row.createdAt),
      })),
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch {
    await writeOperationLog({ userId: session.userId, username: session.username, client: "运营PC端", page: "花名册一览表", action: "查看领用记录", result: "失败", detail: `人员ID：${id}；领用记录加载失败`, request }).catch(() => undefined);
    return NextResponse.json({ message: "领用记录加载失败，请稍后重试" }, { status: 500 });
  }
}


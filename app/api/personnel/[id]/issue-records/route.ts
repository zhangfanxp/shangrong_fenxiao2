import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { shanghaiDate } from "@/lib/item-requisitions";
import { canPersonnel, personnelLog } from "@/lib/personnel-service";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canPersonnel(session, "issues")) return NextResponse.json({ message: "无人员领用记录查看权限" }, { status: 403 });

  const { id } = await params;
  try {
    const personnel = await db.personnel.findFirst({
      where: { id, deletedAt: null },
      select: { recordNo: true, name: true },
    });
    if (!personnel) return NextResponse.json({ message: "人员档案不存在或已删除" }, { status: 404 });

    const rows = await db.itemRequisition.findMany({
      where: { personnelId: id },
      select: {
        id: true,
        requisitionNo: true,
        requisitionedAt: true,
        itemNameSnapshot: true,
        specificationSnapshot: true,
        unitSnapshot: true,
        quantity: true,
        status: true,
        manageStockSnapshot: true,
        personnelNameSnapshot: true,
        createdByNameSnapshot: true,
        createdAt: true,
      },
      orderBy: [{ requisitionedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    });
    const returnTotals = rows.length ? await db.itemRequisitionReturn.groupBy({
      by: ["requisitionId"],
      where: { requisitionId: { in: rows.map(row => row.id) } },
      _sum: { quantity: true },
    }) : [];
    const returnedByRequisition = new Map(returnTotals.map(row => [row.requisitionId, row._sum.quantity || 0]));

    await personnelLog(session.userId, "查看领用记录", "成功", `人员：${personnel.recordNo} ${personnel.name}；共${rows.length}条`);
    return NextResponse.json({
      rows: rows.map(row => {
        const returnedQuantity = returnedByRequisition.get(row.id) || 0;
        return {
          id: row.id,
          requisitionNo: row.requisitionNo,
          requisitionDate: shanghaiDate(row.requisitionedAt),
          personnelName: row.personnelNameSnapshot,
          itemName: row.itemNameSnapshot,
          specification: row.specificationSnapshot,
          unit: row.unitSnapshot,
          quantity: row.quantity,
          returnedQuantity,
          returnableQuantity: Math.max(0, row.quantity - returnedQuantity),
          manageStock: row.manageStockSnapshot,
          status: row.status,
          operatorName: row.createdByNameSnapshot,
          operatedAt: row.createdAt.toISOString(),
        };
      }),
    });
  } catch {
    await personnelLog(session.userId, "查看领用记录", "失败", `人员ID：${id}；领用记录加载失败`);
    return NextResponse.json({ message: "领用记录加载失败，请稍后重试" }, { status: 500 });
  }
}

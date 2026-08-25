import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { canPublishNotification, notificationUserWhere } from "@/lib/notifications";

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canPublishNotification(session, "select-users")) return NextResponse.json({ message: "暂无接收用户选择权限" }, { status: 403 });
  const url = new URL(request.url);
  const realName = (url.searchParams.get("realName") || "").trim().slice(0, 30);
  const roleIds = [...new Set(url.searchParams.getAll("roleIds").filter(Boolean))];
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const requestedPageSize = Number(url.searchParams.get("pageSize")) || 20;
  const pageSize = [20, 50, 100].includes(requestedPageSize) ? requestedPageSize : 20;
  const baseWhere = await notificationUserWhere(session);
  const where: Prisma.UserWhereInput = { AND: [baseWhere, {
    ...(realName ? { realName: { contains: realName } } : {}),
    ...(roleIds.length ? { roleId: { in: roleIds } } : {}),
  }] };
  const [total, rows] = await db.$transaction([
    db.user.count({ where }),
    db.user.findMany({
      where,
      orderBy: [{ realName: "asc" }, { username: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { id: true, username: true, realName: true, phone: true, role: { select: { id: true, name: true } } },
    }),
  ]);
  const canViewPhone = session.permissions.includes("*") || session.permissions.includes("personnel:sensitive");
  return NextResponse.json({
    rows: rows.map(user => ({
      userId: user.id,
      username: user.username,
      realName: user.realName,
      roleId: user.role.id,
      roleName: user.role.name,
      phoneMasked: canViewPhone ? (user.phone || "未配置") : user.phone && user.phone.length >= 7 ? `${user.phone.slice(0, 3)}****${user.phone.slice(-4)}` : "未配置",
    })),
    total,
    page,
    pageSize,
  }, { headers: { "Cache-Control": "no-store" } });
}

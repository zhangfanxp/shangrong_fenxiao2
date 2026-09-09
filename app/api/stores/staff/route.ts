import { RecordStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiSession, sessionHasPermission } from "@/lib/auth";

// 门店表单仅保留负责督导的手工选择；店长、厨师长由用户权限自动同步。
const roleTags = { supervisor: "督导" } as const;

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!sessionHasPermission(session, "stores:list:view")) return NextResponse.json({ message: "暂无门店列表权限" }, { status: 403 });

  const role = new URL(request.url).searchParams.get("role") as keyof typeof roleTags;
  const tag = roleTags[role];
  if (!tag) return NextResponse.json({ message: "人员类型不正确" }, { status: 400 });

  const rows = await db.user.findMany({
    where: { status: RecordStatus.ENABLED, tags: { contains: tag } },
    select: { id: true, realName: true, phone: true, tags: true },
    orderBy: { realName: "asc" },
    take: 500,
  });
  return NextResponse.json(rows);
}

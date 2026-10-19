import { RecordStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiSession } from "@/lib/auth";
import { canStoreListAction } from "@/lib/store-permissions";

// 兼容旧调用；门店表单中的区域负责人现已改为按区域管理权限自动匹配。
const roleTags = { supervisor: "督导" } as const;

function hasExactTag(tags: string | null, expected: string) {
  return (tags || "").split(/[|｜]/).some(tag => tag.trim() === expected);
}

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!["query", "create", "edit", "view"].some(action => canStoreListAction(session.permissions, action as "query" | "create" | "edit" | "view"))) return NextResponse.json({ message: "暂无门店人员查看权限" }, { status: 403 });

  const role = new URL(request.url).searchParams.get("role") as keyof typeof roleTags;
  const tag = roleTags[role];
  if (!tag) return NextResponse.json({ message: "人员类型不正确" }, { status: 400 });

  const rows = await db.user.findMany({
    where: {
      status: RecordStatus.ENABLED,
      role: { status: RecordStatus.ENABLED },
      OR: [{ role: { name: tag } }, { tags: { contains: tag } }],
    },
    select: { id: true, realName: true, phone: true, tags: true, role: { select: { name: true } } },
    orderBy: { realName: "asc" },
    take: 500,
  });
  return NextResponse.json(rows.filter(user => user.role.name === tag || hasExactTag(user.tags, tag)));
}

import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { courseCan } from "@/lib/course-management";
import { db } from "@/lib/db";

export async function POST() {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!courseCan(session, "create")) return NextResponse.json({ message: "暂无课程新增权限" }, { status: 403 });
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const draft = await db.courseDraft.create({ data: { createdByUserId: session.userId, createdByName: session.realName, expiresAt } });
  return NextResponse.json({ courseDraftId: draft.id, expiresAt: expiresAt.toISOString() }, { status: 201, headers: { "Cache-Control": "no-store" } });
}

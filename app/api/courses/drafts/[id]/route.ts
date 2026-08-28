import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { courseCan, ownedDraft } from "@/lib/course-management";
import { db } from "@/lib/db";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!courseCan(session, "create")) return NextResponse.json({ message: "暂无课程新增权限" }, { status: 403 });
  const id = (await params).id;
  if (await ownedDraft(id, session.userId)) await db.courseDraft.delete({ where: { id } });
  return NextResponse.json({ success: true });
}

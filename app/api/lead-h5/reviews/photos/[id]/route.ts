import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getLeadH5Session, leadH5ReviewPermission, leadH5SessionHasPermission } from "@/lib/lead-h5-auth";
import { deleteTaskDraftFiles } from "@/lib/task-r2-upload";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getLeadH5Session(["lead-h5:front-hall:submit", "lead-h5:back-kitchen:submit", "lead-h5:store-credit:submit"]);
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  const { id } = await params;
  const photo = await db.leadH5ReviewPhoto.findFirst({ where: { id, uploaderUserId: session.userId, consumedAt: null }, select: { id: true, reviewType: true, r2StorageId: true, objectKey: true } });
  if (!photo) return NextResponse.json({ message: "照片不存在或已随评分提交" }, { status: 404 });
  const requiredPermission = leadH5ReviewPermission(photo.reviewType, "submit");
  if (!requiredPermission || !leadH5SessionHasPermission(session, requiredPermission)) return NextResponse.json({ message: "暂无该评分照片维护权限" }, { status: 403 });
  try {
    await deleteTaskDraftFiles([photo]);
    await db.leadH5ReviewPhoto.deleteMany({ where: { id: photo.id, uploaderUserId: session.userId, consumedAt: null } });
    return NextResponse.json({ message: "照片已删除" });
  } catch { return NextResponse.json({ message: "照片删除失败，请稍后重试" }, { status: 500 }); }
}

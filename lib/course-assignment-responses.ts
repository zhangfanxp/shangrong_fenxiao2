import { after, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireApiSession, type Session } from "@/lib/auth";
import { canCourseAssignment, type AssignmentAction } from "@/lib/course-assignment-rules";
import { AssignmentError, changeAssignmentStatus, changeAssignmentStatuses } from "@/lib/course-assignments";
import { writeOperationLog } from "@/lib/operation-log";

export function assignmentAudit(session: Session, request: Request, action: string, detail: string, result: "成功" | "失败" = "成功") {
  after(() => writeOperationLog({ userId: session.userId, username: session.username, page: "课程分配记录", action, result, detail, request }).catch(() => undefined));
}

export function assignmentErrorResponse(error: unknown, fallback: string) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2021", "P2022"].includes(error.code)) {
    return NextResponse.json({ message: "课程分配功能的数据库尚未完成升级，请联系管理员完成升级后重试" }, { status: 503 });
  }
  return NextResponse.json({ message: error instanceof AssignmentError ? error.message : fallback }, { status: error instanceof AssignmentError ? error.status : 500 });
}

export async function assignmentApiSession(action: AssignmentAction) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canCourseAssignment(session.permissions, action)) return NextResponse.json({ message: "暂无课程分配记录操作权限" }, { status: 403 });
  return session;
}

const versionSchema = z.object({ version: z.number().int().positive() });
const batchSchema = z.object({ assignmentIds: z.array(z.string().min(1)).min(1).max(100), versions: z.record(z.number().int().positive()) });

export async function assignmentStatusResponse(request: Request, action: "enable" | "disable", id?: string) {
  const permission = id ? action : `batch-${action}` as const;
  const session = await assignmentApiSession(permission);
  if (session instanceof NextResponse) return session;
  const label = `${id ? "" : "批量"}${action === "enable" ? "启用" : "停用"}`;
  const target = action === "enable" ? "ENABLED" : "DISABLED";
  try {
    const body: unknown = await request.json().catch(() => null);
    if (id) {
      const parsed = versionSchema.safeParse(body);
      if (!parsed.success) throw new AssignmentError("操作参数不正确，请刷新后重试");
      const result = await changeAssignmentStatus(id, parsed.data.version, target, session, label, request);
      return NextResponse.json({ success: true, ...result });
    }
    const parsed = batchSchema.safeParse(body);
    if (!parsed.success) throw new AssignmentError("请选中1至100条记录并提供当前版本");
    const ids = [...new Set(parsed.data.assignmentIds)];
    if (ids.some(key => !Object.hasOwn(parsed.data.versions, key))) throw new AssignmentError("缺少记录版本，请刷新后重试");
    const summary = await changeAssignmentStatuses(ids.map(batchId => ({ id: batchId, version: parsed.data.versions[batchId] })), target, session, label, request);
    assignmentAudit(session, request, label, `成功：${summary.changed}；跳过：${summary.skipped}；失败：${summary.failed}`, summary.failed ? "失败" : "成功");
    return NextResponse.json(summary);
  } catch (error) {
    assignmentAudit(session, request, label, error instanceof AssignmentError ? error.message : "操作失败", "失败");
    return assignmentErrorResponse(error, `课程分配${action === "enable" ? "启用" : "停用"}失败，请稍后重试`);
  }
}

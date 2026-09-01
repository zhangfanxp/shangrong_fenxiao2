import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { courseCan } from "@/lib/course-management";
import { db } from "@/lib/db";
import { assignmentAccess, assignmentBatchScope } from "@/lib/course-assignment-scope";
import { assignmentApiSession, assignmentAudit, assignmentErrorResponse } from "@/lib/course-assignment-responses";
import { assignmentFilterWhere, assignmentPagination, createAssignmentBatch, serializeAssignment } from "@/lib/course-assignments";

const schema = z.object({
  courseIds: z.array(z.string().min(1)).min(1, "请至少选择一门课程").max(100, "单次最多分配100门课程"),
  userIds: z.array(z.string().min(1)).min(1, "请至少选择一名用户").max(100, "单次最多选择100名用户"),
  clientRequestId: z.string().uuid("分配请求无效，请重新打开分配窗口"),
});

export async function GET(request: Request) {
  const session = await assignmentApiSession("query");
  if (session instanceof NextResponse) return session;
  try {
    const search = new URL(request.url).searchParams;
    const { page, pageSize, skip, take } = assignmentPagination(search);
    const where = { AND: [assignmentBatchScope(await assignmentAccess(session)), assignmentFilterWhere(search)] };
    const [rows, total] = await db.$transaction([
      db.courseAssignmentBatch.findMany({ where, orderBy: [{ assignedAt: "desc" }, { id: "desc" }], skip, take }),
      db.courseAssignmentBatch.count({ where }),
    ]);
    assignmentAudit(session, request, "筛选", JSON.stringify(Object.fromEntries(search)));
    return NextResponse.json({ rows: rows.map(serializeAssignment), total, page, pageSize }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return assignmentErrorResponse(error, "课程分配记录加载失败，请稍后重试"); }
}

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!courseCan(session, "edit")) return NextResponse.json({ message: "暂无课程分配权限" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message }, { status: 400 });
  try { return NextResponse.json({ success: true, ...await createAssignmentBatch(parsed.data, session, request) }); }
  catch (error) { return assignmentErrorResponse(error, "课程分配失败，请稍后重试"); }
}

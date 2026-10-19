import { NextResponse } from "next/server";
import { z } from "zod";
import { getLeadH5Session } from "@/lib/lead-h5-auth";
import { hasRolePermission } from "@/lib/role-permissions";
import { actOnRectification, ownedRectification, rectificationDetail, RectificationError } from "@/lib/inspection-rectifications";

const roundSchema = z.object({
  deadlineHours: z.union([z.literal(24), z.literal(72), z.literal(168)]),
  responsibleUserId: z.string().min(1, "请选择责任人"),
  requirement: z.string().refine(value => Array.from(value).length <= 100, "整改要求不能超过100个字符"),
  ccUserIds: z.array(z.string().min(1)).max(10, "抄送人不能超过10人"),
});
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), round: roundSchema }),
  z.object({ action: z.literal("no-action"), reason: z.string().max(1000, "原因不能超过1000个字符").default("") }),
  z.object({ action: z.literal("accept"), roundNumber: z.number().int().positive() }),
  z.object({ action: z.literal("reject"), roundNumber: z.number().int().positive(), reason: z.string().max(1000).default(""), round: roundSchema }),
]);

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getLeadH5Session("lead-h5:rectifications:view");
  if (!session) return NextResponse.json({ message: "登录状态已失效或暂无巡检整改查看权限" }, { status: 401 });
  try {
    return NextResponse.json(await rectificationDetail(await ownedRectification((await params).id, session.userId)), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return NextResponse.json({ message: error instanceof RectificationError ? error.message : "整改详情加载失败，请稍后重试" }, { status: error instanceof RectificationError ? error.status : 500 }); }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getLeadH5Session("lead-h5:rectifications:view");
  if (!session) return NextResponse.json({ message: "登录状态已失效或暂无巡检整改查看权限" }, { status: 401 });
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message }, { status: 400 });
  const permission = parsed.data.action === "start" ? "start" : parsed.data.action === "no-action" ? "no-action" : "accept";
  if (!hasRolePermission(session.permissions, `lead-h5:rectifications:${permission}`)) return NextResponse.json({ message: "暂无该整改操作权限" }, { status: 403 });
  try { return NextResponse.json(await actOnRectification((await params).id, session, parsed.data, request)); }
  catch (error) { return NextResponse.json({ message: error instanceof RectificationError ? error.message : "整改操作失败，请稍后重试" }, { status: error instanceof RectificationError ? error.status : 500 }); }
}

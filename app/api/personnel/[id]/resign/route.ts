import { PersonnelStatus, RecordStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { canPersonnel, personnelInclude, personnelLog, toDate } from "@/lib/personnel-service";

const schema = z.object({ resignationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "请选择离职日期"), reason: z.string().trim().min(1, "请输入离职原因").max(200), disablePlatformUser: z.boolean().default(true) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession(); if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canPersonnel(session, "resign")) return NextResponse.json({ message: "无人员离职权限" }, { status: 403 });
  const parsed = schema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message }, { status: 400 }); const { id } = await params;
  const current = await db.personnel.findFirst({ where: { id, deletedAt: null } }); if (!current) return NextResponse.json({ message: "人员档案不存在或已删除" }, { status: 404 });
  if (current.status === PersonnelStatus.RESIGNED) return NextResponse.json({ message: "该员工已经离职，不能重复操作" }, { status: 400 });
  if (toDate(parsed.data.resignationDate) < current.hireDate) return NextResponse.json({ message: "离职日期不能早于入职日期" }, { status: 400 });
  await db.$transaction(async tx => { await tx.personnel.update({ where: { id }, data: { status: PersonnelStatus.RESIGNED, resignationDate: toDate(parsed.data.resignationDate), resignationReason: parsed.data.reason, version: { increment: 1 } } }); if (parsed.data.disablePlatformUser && current.platformUserId) await tx.user.update({ where: { id: current.platformUserId }, data: { status: RecordStatus.DISABLED } }); });
  const row = await db.personnel.findUniqueOrThrow({ where: { id }, include: personnelInclude }); await personnelLog(session.userId, "离职", "成功", `人员：${row.recordNo}；平台账号${parsed.data.disablePlatformUser && current.platformUserId ? "已禁用" : "未变更"}`); return NextResponse.json(row);
}

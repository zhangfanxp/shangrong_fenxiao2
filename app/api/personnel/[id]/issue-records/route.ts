import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { canPersonnel, personnelLog } from "@/lib/personnel-service";
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) { const session = await requireApiSession(); if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 }); if (!canPersonnel(session, "issues")) return NextResponse.json({ message: "无人员领用记录查看权限" }, { status: 403 }); const { id } = await params; await personnelLog(session.userId, "查看领用记录", "成功", `人员ID：${id}`); return NextResponse.json({ rows: [] }); }

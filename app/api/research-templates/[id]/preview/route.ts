import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";
import { readResearchConfig, ResearchTemplateConfigError } from "@/lib/research-template-config";
import { canResearchTemplate } from "@/lib/research-template-permissions";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canResearchTemplate(session, "preview")) return NextResponse.json({ message: "暂无此操作权限" }, { status: 403 });
  const template = await db.researchTemplate.findFirst({ where: { id: (await params).id, deletedAt: null } });
  if (!template) return NextResponse.json({ message: "调研模版不存在或已删除" }, { status: 404 });
  try {
    const config = await readResearchConfig(template.configFileName);
    await writeOperationLog({ userId: session.userId, username: session.username, page: "调研模版", action: "预览", result: "成功", detail: `预览调研模版：${template.recordNo}`, request }).catch(() => undefined);
    return NextResponse.json({ config });
  } catch (error) {
    const message = error instanceof ResearchTemplateConfigError ? error.message : "调研配置文件加载失败，请联系系统管理员";
    await writeOperationLog({ userId: session.userId, username: session.username, page: "调研模版", action: "预览", result: "失败", detail: `调研模版：${template.recordNo}；${message}`, request }).catch(() => undefined);
    return NextResponse.json({ message }, { status: 500 });
  }
}

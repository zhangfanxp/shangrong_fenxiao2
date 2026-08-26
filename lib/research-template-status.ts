import { RecordStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";
import { readResearchConfig, ResearchTemplateConfigError, writeResearchConfig } from "@/lib/research-template-config";
import { canResearchTemplate } from "@/lib/research-template-permissions";
import { sameTimestamp } from "@/lib/research-template-service";

const schema = z.object({ updatedAt: z.string().datetime({ offset: true }) });

export async function updateResearchTemplateStatus(request: Request, params: Promise<{ id: string }>, status: RecordStatus) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  const enabling = status === RecordStatus.ENABLED;
  const action = enabling ? "启用" : "禁用";
  if (!canResearchTemplate(session, enabling ? "enable" : "disable")) return NextResponse.json({ message: "暂无此操作权限" }, { status: 403 });
  const body = schema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ message: body.error.issues[0].message }, { status: 400 });
  const template = await db.researchTemplate.findFirst({ where: { id: (await params).id, deletedAt: null } });
  if (!template) return NextResponse.json({ message: "调研模版不存在或已删除" }, { status: 404 });
  if (!sameTimestamp(template.updatedAt, body.data.updatedAt)) return NextResponse.json({ message: "当前调研模版已被其他用户修改，请刷新后重新操作。" }, { status: 409 });
  try {
    const oldConfig = await readResearchConfig(template.configFileName);
    const nextConfig = { ...oldConfig, status: enabling ? "已启用" as const : "已禁用" as const, statusCode: status };
    await writeResearchConfig(template.configFileName, nextConfig);
    try {
      const result = await db.researchTemplate.updateMany({ where: { id: template.id, updatedAt: template.updatedAt }, data: { status } });
      if (!result.count) throw new ResearchTemplateConfigError("当前调研模版已被其他用户修改，请刷新后重新操作。");
    } catch (error) { await writeResearchConfig(template.configFileName, oldConfig); throw error; }
    await writeOperationLog({ userId: session.userId, username: session.username, page: "调研模版", action, result: "成功", detail: `${action}调研模版：${template.recordNo}`, request }).catch(() => undefined);
    return NextResponse.json({ message: `调研模版${action}成功` });
  } catch (error) {
    const message = error instanceof ResearchTemplateConfigError ? error.message : `调研模版${action}失败，请稍后重试`;
    await writeOperationLog({ userId: session.userId, username: session.username, page: "调研模版", action, result: "失败", detail: `${action}调研模版：${template.recordNo}；${message}`, request }).catch(() => undefined);
    return NextResponse.json({ message }, { status: message.includes("其他用户") ? 409 : 400 });
  }
}

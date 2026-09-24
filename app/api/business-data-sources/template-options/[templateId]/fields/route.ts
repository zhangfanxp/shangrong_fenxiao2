import { BusinessDataSourceType } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { canBusinessDataSource, findTemplateOption, getTemplateFields } from "@/lib/business-data-sources";

export async function GET(request: Request, { params }: { params: Promise<{ templateId: string }> }) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canBusinessDataSource(session, "query") && !canBusinessDataSource(session, "create") && !canBusinessDataSource(session, "edit")) return NextResponse.json({ message: "暂无业务数据源操作权限" }, { status: 403 });
  const rawType = new URL(request.url).searchParams.get("sourceType");
  if (!Object.values(BusinessDataSourceType).includes(rawType as BusinessDataSourceType)) return NextResponse.json({ message: "请选择正确的来源类型" }, { status: 400 });
  const sourceType = rawType as BusinessDataSourceType;
  const { templateId } = await params;
  try {
    const template = await findTemplateOption(sourceType, templateId);
    if (!template) return NextResponse.json({ message: "模版记录不存在或已删除" }, { status: 404 });
    const fields = await getTemplateFields(sourceType, templateId);
    return NextResponse.json({ template, fields: fields.filter(field => field.isSelectable) });
  } catch {
    return NextResponse.json({ message: "模版字段数据加载失败，请稍后重试" }, { status: 500 });
  }
}

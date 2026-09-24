import { NextResponse } from "next/server";
import { getLeadH5Session } from "@/lib/lead-h5-auth";
import {
  loadLeadH5ResearchConfig,
  researchTemplateMatchesBrand,
  STORE_RESEARCH_TYPE,
  validResearchMonth,
} from "@/lib/lead-h5-research";
import { leadH5StoreDataScope } from "@/lib/lead-h5-store-scope";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";

export async function GET(request: Request) {
  const session = await getLeadH5Session("lead-h5:store-research:view");
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  const url = new URL(request.url);
  const storeId = url.searchParams.get("storeId") || "";
  const researchMonth = url.searchParams.get("researchMonth") || "";
  if (!storeId || !validResearchMonth(researchMonth)) return NextResponse.json({ message: "调研参数无效" }, { status: 400 });
  try {
    const store = await db.store.findFirst({
      where: { id: storeId, ...leadH5StoreDataScope(session), operationStatus: { not: "CLOSED" }, brand: { status: "ENABLED" } },
      include: { brand: true },
    });
    if (!store) return NextResponse.json({ message: "当前账号无权访问该店铺" }, { status: 403 });
    const duplicate = await db.researchTemplateRecord.findUnique({
      where: { storeId_researchMonth_templateType: { storeId, researchMonth, templateType: STORE_RESEARCH_TYPE } },
      select: { id: true },
    });
    if (duplicate) return NextResponse.json({ message: "该店铺当前月份的门店调研表已提交，请勿重复提交。" }, { status: 409 });
    const candidates = await db.researchTemplate.findMany({
      where: { templateType: STORE_RESEARCH_TYPE, status: "ENABLED", deletedAt: null },
      include: { brandScopes: true },
    });
    const matches = candidates.filter(template => researchTemplateMatchesBrand(template.brandScopes.map(scope => scope.brandValue), store.brand));
    if (!matches.length) return NextResponse.json({ message: "当前店铺暂未配置可用的督导巡店调研表，请联系系统管理员。" }, { status: 404 });
    if (matches.length > 1) {
      await writeOperationLog({ userId: session.userId, username: session.username, client: "运营移动端", page: "门店调研表", action: "加载调研表", result: "失败", detail: `店铺：${store.name}；匹配到${matches.length}份启用模版`, request }).catch(() => undefined);
      return NextResponse.json({ message: "当前调研配置存在异常，请联系系统管理员。" }, { status: 409 });
    }
    const template = matches[0];
    const config = await loadLeadH5ResearchConfig(template.configFileName);
    if (config.configVersion !== template.configVersion) return NextResponse.json({ message: "调研表配置版本异常，请联系系统管理员。" }, { status: 409 });
    await writeOperationLog({ userId: session.userId, username: session.username, client: "运营移动端", page: "门店调研表", action: "选择门店", result: "成功", detail: `调研月份：${researchMonth}；门店：${store.name}`, request }).catch(() => undefined);
    return NextResponse.json({
      store: { id: store.id, name: store.name, brandId: store.brand.id, brandName: store.brand.name },
      supervisor: { realName: session.realName },
      template: { id: template.id, recordNo: template.recordNo, templateType: template.templateType, configVersion: template.configVersion },
      config,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "调研表加载失败，请稍后重试";
    return NextResponse.json({ message }, { status: 500 });
  }
}

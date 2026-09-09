import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession, sessionHasPermission } from "@/lib/auth";
import { testAiAnalysisApi } from "@/lib/ai-api-test";
import { getBusinessDictionaryOptions } from "@/lib/business-dictionaries";
import { writeOperationLog } from "@/lib/operation-log";

export const maxDuration = 1800;

const endpointSchema = z.string().trim().min(1, "请填写全部Ai服务接口").max(500, "接口地址不能超过500个字符").refine(value => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}, "请输入以http://或https://开头的有效接口地址");

const inputSchema = z.object({
  endpoints: z.array(z.object({
    service: z.string().trim().min(1, "Ai服务名称不能为空").max(200, "Ai服务名称不能超过200个字符"),
    url: endpointSchema,
  })).min(1, "Ai服务字典暂无可测试的枚举值").max(100, "Ai服务接口数量不能超过100个"),
});

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!sessionHasPermission(session, "settings:parameters")) return NextResponse.json({ message: "暂无系统参数维护权限" }, { status: 403 });

  try {
    const parsed = inputSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message }, { status: 400 });

    const aiServiceOptions = await getBusinessDictionaryOptions("AI_SERVICE");
    const requestedEndpoints = new Map(parsed.data.endpoints.map(item => [item.service, item.url]));
    const activeServices = aiServiceOptions.map(option => option.value);
    if (requestedEndpoints.size !== parsed.data.endpoints.length || requestedEndpoints.size !== activeServices.length || activeServices.some(service => !requestedEndpoints.has(service))) {
      return NextResponse.json({ message: "Ai服务字典已更新，请刷新页面后重新测试" }, { status: 409 });
    }

    const results = await Promise.all(activeServices.map(service => testAiAnalysisApi(service, requestedEndpoints.get(service)!)));
    const success = results.every(result => result.ok);
    const detail = results.map(result => `${result.label}：${result.ok ? "正常" : result.message}`).join("；").slice(0, 800);
    await writeOperationLog({ userId: session.userId, username: session.username, page: "系统参数", action: "测试Ai API", result: success ? "成功" : "失败", detail, request }).catch(() => undefined);

    return NextResponse.json({
      success,
      message: success ? "全部Ai API接口均连接正常，配置有效，可正常使用。" : "部分接口测试未通过，请检查接口地址和模型服务后重试。",
      results,
    }, { status: success ? 200 : 502 });
  } catch {
    await writeOperationLog({ userId: session.userId, username: session.username, page: "系统参数", action: "测试Ai API", result: "失败", detail: "Ai API接口测试发生系统异常", request }).catch(() => undefined);
    return NextResponse.json({ message: "Ai API接口测试失败，请稍后重试" }, { status: 500 });
  }
}

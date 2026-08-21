import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession, sessionHasPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";
import { getPlatformConfig, normalizeLoginTags, savePlatformConfig } from "@/lib/platform-config";

const imagePattern = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
const inputSchema = z.object({
  platformName: z.string().trim().min(1, "请输入平台名称").max(30, "平台名称不能超过30个字符"),
  logoDataUrl: z.string().nullable().optional().refine(value => {
    if (value === undefined) return true;
    if (value === null) return true;
    const match = value.match(imagePattern);
    return Boolean(match && Math.ceil(match[2].length * 3 / 4) <= 2 * 1024 * 1024);
  }, "后台LOGO仅支持PNG、JPG或WEBP格式，且文件不能超过2MB"),
  loginBackgroundDataUrl: z.string().nullable().optional().refine(value => {
    if (value === undefined) return true;
    if (value === null) return true;
    const match = value.match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/);
    return Boolean(match && Math.ceil(match[2].length * 3 / 4) <= 5 * 1024 * 1024);
  }, "登录页背景图片仅支持PNG、JPG或JPEG格式，且文件不能超过5MB"),
  leadPcLoginTags: z.string().trim().max(200, "运营PC端登录用户标签不能超过200个字符").optional().default(""),
  leadH5LoginTags: z.string().trim().max(200, "运营H5移动端登录用户标签不能超过200个字符").optional().default(""),
  storeH5LoginTags: z.string().trim().max(200, "门店H5移动端登录用户标签不能超过200个字符").optional().default(""),
  removeLogo: z.boolean().optional().default(false),
  removeLoginBackground: z.boolean().optional().default(false),
});

export async function GET() {
  return NextResponse.json(await getPlatformConfig(), { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!sessionHasPermission(session, "settings:parameters")) return NextResponse.json({ message: "暂无系统参数维护权限" }, { status: 403 });
  try {
    const parsed = inputSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0].message }, { status: 400 });
    const current = await getPlatformConfig();
    const saved = await savePlatformConfig({
      platformName: parsed.data.platformName,
      logoDataUrl: parsed.data.removeLogo ? null : parsed.data.logoDataUrl ?? current.logoDataUrl,
      loginBackgroundDataUrl: parsed.data.removeLoginBackground ? null : parsed.data.loginBackgroundDataUrl ?? current.loginBackgroundDataUrl,
      leadPcLoginTags: normalizeLoginTags(parsed.data.leadPcLoginTags),
      leadH5LoginTags: normalizeLoginTags(parsed.data.leadH5LoginTags),
      storeH5LoginTags: normalizeLoginTags(parsed.data.storeH5LoginTags),
    });
    await writeOperationLog({ userId: session.userId, username: session.username, page: "系统参数", action: "修改参数", result: "成功", detail: `保存平台信息；平台名称：${saved.platformName}`, request }).catch(() => undefined);
    return NextResponse.json(saved);
  } catch {
    return NextResponse.json({ message: "平台信息保存失败，请稍后重试" }, { status: 500 });
  }
}

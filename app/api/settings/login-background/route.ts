import { NextResponse } from "next/server";
import { getPlatformConfig, platformAssetVersion } from "@/lib/platform-config";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const dataUrl = (await getPlatformConfig()).loginBackgroundDataUrl;
  const match = dataUrl?.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!dataUrl || !match) return NextResponse.json({ message: "登录背景图片未配置" }, { status: 404, headers: { "Cache-Control": "no-store" } });

  const version = platformAssetVersion(dataUrl);
  const requestedVersion = new URL(request.url).searchParams.get("v");
  if (requestedVersion && requestedVersion !== version) {
    const target = new URL(request.url);
    target.searchParams.set("v", version);
    return NextResponse.redirect(target, 307);
  }

  const etag = `"${version}"`;
  const headers = { "Cache-Control": "public, max-age=31536000, immutable", "Content-Type": match[1], ETag: etag };
  if (request.headers.get("if-none-match")?.split(",").map(value => value.trim()).includes(etag)) return new NextResponse(null, { status: 304, headers });
  return new NextResponse(Buffer.from(match[2], "base64"), { headers });
}

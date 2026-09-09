import { NextResponse } from "next/server";
import { getPlatformConfig, platformAssetVersion, type PlatformAssetName } from "@/lib/platform-config";

export const dynamic = "force-dynamic";

const assetFields = {
  logo: "logoDataUrl",
  "login-background": "loginBackgroundDataUrl",
  "course-cover": "courseCoverDataUrl",
  "lesson-cover": "lessonCoverDataUrl",
} as const satisfies Record<PlatformAssetName, "logoDataUrl" | "loginBackgroundDataUrl" | "courseCoverDataUrl" | "lessonCoverDataUrl">;

export async function GET(request: Request, { params }: { params: Promise<{ asset: string }> }) {
  const { asset } = await params;
  if (!(asset in assetFields)) return NextResponse.json({ message: "图片资源不存在" }, { status: 404 });

  const config = await getPlatformConfig();
  const dataUrl = config[assetFields[asset as PlatformAssetName]];
  if (!dataUrl) return NextResponse.json({ message: "图片资源尚未配置" }, { status: 404 });
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\r\n]+)$/);
  if (!match) return NextResponse.json({ message: "图片资源尚未配置" }, { status: 404 });

  const version = platformAssetVersion(dataUrl);
  const url = new URL(request.url);
  if (url.searchParams.get("v") !== version) {
    url.searchParams.set("v", version);
    return NextResponse.redirect(url, 307);
  }

  return new NextResponse(Buffer.from(match[2], "base64"), {
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type": match[1],
      ETag: `"${version}"`,
    },
  });
}

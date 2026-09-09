import { AppShell } from "@/components/app-shell";
import { requireSession } from "@/lib/auth";
import { getPlatformConfig, platformAssetUrl } from "@/lib/platform-config";

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const [session, platform] = await Promise.all([requireSession(), getPlatformConfig()]);
  return <AppShell realName={session.realName} permissions={session.permissions} platform={{ platformName: platform.platformName, logoUrl: platformAssetUrl("logo", platform.logoDataUrl) }}>{children}</AppShell>;
}

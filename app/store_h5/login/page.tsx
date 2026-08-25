import { redirect } from "next/navigation";
import { StoreH5Login } from "@/components/store-h5-login";
import { getPlatformConfig } from "@/lib/platform-config";
import { getStoreH5Session } from "@/lib/store-h5-auth";

export default async function StoreH5LoginPage() {
  if (await getStoreH5Session()) redirect("/store_h5");
  const platform = await getPlatformConfig();
  return <StoreH5Login platformName={platform.platformName} logoDataUrl={platform.logoDataUrl} />;
}

import { redirect } from "next/navigation";
import { LeadH5Login } from "@/components/lead-h5-login";
import { getLeadH5Session } from "@/lib/lead-h5-auth";
import { getPlatformConfig } from "@/lib/platform-config";

export default async function LeadH5LoginPage() {
  if (await getLeadH5Session()) redirect("/lead_h5");
  const platform = await getPlatformConfig();
  return <LeadH5Login platformName={platform.platformName} logoDataUrl={platform.logoDataUrl} />;
}


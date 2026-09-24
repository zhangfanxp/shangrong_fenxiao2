import { PageHeader } from "@/components/page-header";
import { StoreList } from "@/components/store-list";
import { requirePageAccess } from "@/lib/auth";
import { getBrandDayHourConfig } from "@/lib/brand-day-hour-config";

export default async function StoresPage() {
  const session = await requirePageAccess("/lead_pc/stores/list");
  const brandDayHours = await getBrandDayHourConfig();
  return <main className="page-wrap"><PageHeader title="门店列表" description="查看和维护直营店、加盟店的基础经营档案" /><StoreList permissions={session.permissions} brandDayHours={brandDayHours} /></main>;
}

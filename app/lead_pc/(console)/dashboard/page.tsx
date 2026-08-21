import { Dashboard } from "@/components/dashboard";
import { PageHeader } from "@/components/page-header";
import { requirePageAccess } from "@/lib/auth";
export default async function DashboardPage() { await requirePageAccess("/lead_pc/dashboard"); return <main className="page-wrap"><PageHeader title="仪表板" description="查看合同、门店与平台任务的运营概况" /><Dashboard /></main>; }

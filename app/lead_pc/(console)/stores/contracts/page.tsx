import { ContractList } from "@/components/contract-list";
import { PageHeader } from "@/components/page-header";
import { requirePageAccess } from "@/lib/auth";
export default async function ContractsPage() { const session = await requirePageAccess("/lead_pc/stores/contracts"); return <main className="page-wrap"><PageHeader title="合同管理" description="集中维护门店合作合同、费用和合同履约状态" /><ContractList permissions={session.permissions} /></main>; }

import { PageHeader } from "@/components/page-header";
import { PersonnelList } from "@/components/personnel-list";
import { requirePageAccess } from "@/lib/auth";

export default async function PersonnelPage() {
  const session = await requirePageAccess("/lead_pc/staff/0");
  return <main className="page-wrap"><PageHeader title="人员档案" description="统一维护集团员工基础资料、岗位、合同及人员状态" /><PersonnelList permissions={session.permissions} /></main>;
}

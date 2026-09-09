import { IntelligentAnalysisList } from "@/components/intelligent-analysis-list";
import { PageHeader } from "@/components/page-header";
import { requirePageAccess } from "@/lib/auth";

export default async function IntelligentAnalysisPage() {
  const session = await requirePageAccess("/lead_pc/tasks/analysis");
  return <main className="page-wrap"><PageHeader title="智能分析" description="查看任务执行结果的AI智能分析记录" /><IntelligentAnalysisList permissions={session.permissions} /></main>;
}

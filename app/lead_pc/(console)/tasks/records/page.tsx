import { PageHeader } from "@/components/page-header";
import { TaskRecordList } from "@/components/task-record-list";
import { requirePageAccess } from "@/lib/auth";

export default async function TaskRecordsPage() {
  const session = await requirePageAccess("/lead_pc/tasks/records");
  return <main className="page-wrap"><PageHeader title="任务记录" description="查询任务生成、执行及提交结果" /><TaskRecordList permissions={session.permissions} /></main>;
}

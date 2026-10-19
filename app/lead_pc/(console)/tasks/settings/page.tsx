import { PageHeader } from "@/components/page-header";
import { TaskSettingsList } from "@/components/task-settings-list";
import { requirePageAccess } from "@/lib/auth";

export default async function TaskSettingsPage() {
  const session = await requirePageAccess("/lead_pc/tasks/settings");
  return <main className="page-wrap"><PageHeader title="任务设置" description="配置平台任务模板、执行规则及提交内容" /><TaskSettingsList permissions={session.permissions} /></main>;
}

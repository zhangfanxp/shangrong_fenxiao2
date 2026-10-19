import { PageHeader } from "@/components/page-header";
import { TaskCalendarTemplateList } from "@/components/task-calendar-template-list";
import { requirePageAccess } from "@/lib/auth";

export default async function TaskCalendarTemplatesPage() {
  const session = await requirePageAccess("/lead_pc/tasks/calendar-templates");
  return <main className="page-wrap"><PageHeader title="日历任务模版" description="维护日历任务日期、当天说明及备注" /><TaskCalendarTemplateList permissions={session.permissions} /></main>;
}

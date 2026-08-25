import { NotificationManagement } from "@/components/notification-management";
import { PageHeader } from "@/components/page-header";
import { requirePageAccess } from "@/lib/auth";

export default async function NotificationManagePage() {
  const session = await requirePageAccess("/lead_pc/notifications/manage");
  return <main className="page-wrap notification-manage-page">
    <PageHeader title="通知管理" description="查询通知发布、阅读及停止情况" />
    <NotificationManagement permissions={session.permissions} />
  </main>;
}

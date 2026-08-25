import { NotificationPublishForm } from "@/components/notification-publish-form";
import { PageHeader } from "@/components/page-header";
import { requirePageAccess } from "@/lib/auth";
import { canPublishNotification, nextShanghaiDate, shanghaiDateKey } from "@/lib/notifications";

export default async function PublishNotificationPage() {
  const session = await requirePageAccess("/lead_pc/notifications/publish");
  return <main className="page-wrap notification-page">
    <PageHeader title="发布通知" description="创建定时通知，指定接收用户并在发布日期 06:00 自动发布" />
    <NotificationPublishForm
      realName={session.realName}
      today={shanghaiDateKey()}
      defaultReleaseDate={nextShanghaiDate()}
      canSave={canPublishNotification(session, "save")}
      canSelectUsers={canPublishNotification(session, "select-users")}
    />
  </main>;
}

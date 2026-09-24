import { MobileDailyLearningRecording } from "@/components/store-h5-daily-learning-detail";
import { requireLeadH5PageSession } from "@/lib/lead-h5-auth";
import { hasRolePermission } from "@/lib/role-permissions";

export default async function LeadH5DailyLearningRecordingPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireLeadH5PageSession("lead-h5:daily-learning:view");
  return <MobileDailyLearningRecording
    planId={(await params).id}
    apiBase="/api/lead-h5/daily-learning"
    homePath="/lead_h5"
    loginPath="/lead_h5/login"
    canRecord={hasRolePermission(session.permissions, "lead-h5:daily-learning:record")}
  />;
}

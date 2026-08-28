import { MobileOnlineCourseDetail } from "@/components/mobile-online-courses";
import { requireLeadH5PageSession } from "@/lib/lead-h5-auth";

export default async function LeadH5OnlineCourseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireLeadH5PageSession();
  return <MobileOnlineCourseDetail channel="lead-h5" courseId={(await params).id} />;
}


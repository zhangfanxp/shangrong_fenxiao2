import { MobileOnlineCourseList } from "@/components/mobile-online-courses";
import { requireLeadH5PageSession } from "@/lib/lead-h5-auth";

export default async function LeadH5OnlineCoursesPage() {
  await requireLeadH5PageSession();
  return <MobileOnlineCourseList channel="lead-h5" clientName="运营H5移动端" />;
}


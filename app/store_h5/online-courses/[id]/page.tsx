import { MobileOnlineCourseDetail } from "@/components/mobile-online-courses";
import { requireStoreH5PageSession } from "@/lib/store-h5-auth";

export default async function StoreH5OnlineCourseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStoreH5PageSession();
  return <MobileOnlineCourseDetail channel="store-h5" courseId={(await params).id} />;
}


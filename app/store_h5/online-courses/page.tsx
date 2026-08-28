import { MobileOnlineCourseList } from "@/components/mobile-online-courses";
import { requireStoreH5PageSession } from "@/lib/store-h5-auth";

export default async function StoreH5OnlineCoursesPage() {
  await requireStoreH5PageSession();
  return <MobileOnlineCourseList channel="store-h5" clientName="门店H5移动端" />;
}


import { Suspense } from "react";
import { LeadH5ReviewForm } from "@/components/lead-h5-review-form";
import { requireLeadH5PageSession } from "@/lib/lead-h5-auth";

export default async function FrontHallReviewPage() {
  await requireLeadH5PageSession();
  return <Suspense><LeadH5ReviewForm reviewType="FRONT_HALL_AUDIT" reviewTitle="前厅稽核评分" /></Suspense>;
}

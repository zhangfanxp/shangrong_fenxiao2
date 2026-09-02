import { Suspense } from "react";
import { LeadH5ReviewForm } from "@/components/lead-h5-review-form";
import { requireLeadH5PageSession } from "@/lib/lead-h5-auth";

export default async function StoreCreditReviewPage() {
  await requireLeadH5PageSession();
  return <Suspense><LeadH5ReviewForm reviewType="STORE_CREDIT_SCORE" reviewTitle="门店信用评分" /></Suspense>;
}

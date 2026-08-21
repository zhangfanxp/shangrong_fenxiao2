import { Suspense } from "react";
import { LeadH5ReviewForm } from "@/components/lead-h5-review-form";
import { requireLeadH5PageSession } from "@/lib/lead-h5-auth";

export default async function BackKitchenReviewPage() {
  await requireLeadH5PageSession();
  return <Suspense><LeadH5ReviewForm reviewType="BACK_KITCHEN_AUDIT" reviewTitle="后厨稽核评分" /></Suspense>;
}


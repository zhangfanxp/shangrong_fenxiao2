import { Suspense } from "react";
import { LeadH5ReviewForm } from "@/components/lead-h5-review-form";
import { requireLeadH5PageSession } from "@/lib/lead-h5-auth";
import { hasRolePermission } from "@/lib/role-permissions";

export default async function FrontHallReviewPage() {
  const session = await requireLeadH5PageSession("lead-h5:front-hall:view");
  return <Suspense><LeadH5ReviewForm reviewType="FRONT_HALL_AUDIT" reviewTitle="前厅稽核评分" canSubmit={hasRolePermission(session.permissions, "lead-h5:front-hall:submit")} /></Suspense>;
}

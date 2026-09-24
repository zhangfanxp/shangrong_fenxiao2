import { redirect } from "next/navigation";
import { mobileDailyLearningTasks } from "@/lib/daily-learning";
import { requireLeadH5PageSession } from "@/lib/lead-h5-auth";

export default async function LeadH5DailyLearningPage() {
  const session = await requireLeadH5PageSession("lead-h5:daily-learning:view");
  const task = (await mobileDailyLearningTasks(session.userId))[0];
  redirect(task ? `/lead_h5/daily-learning/${task.id}` : "/lead_h5");
}

import { RecordStatus } from "@prisma/client";
import { updateResearchTemplateStatus } from "@/lib/research-template-status";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return updateResearchTemplateStatus(request, params, RecordStatus.ENABLED);
}

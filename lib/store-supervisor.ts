import { RecordStatus } from "@prisma/client";
import { db } from "@/lib/db";

type SupervisorReference = { supervisorUserId?: string | null; supervisorName?: string | null };

function hasSupervisorIdentity(user: { role: { name: string }; tags: string | null }) {
  return user.role.name === "督导" || (user.tags || "").split(/[|｜]/).some(tag => tag.trim() === "督导");
}

/** Resolve the store archive's supervisor to one enabled platform account. */
export async function resolveStoreSupervisor(reference: SupervisorReference) {
  const requestedId = reference.supervisorUserId?.trim();
  const requestedName = reference.supervisorName?.trim();
  if (!requestedId && !requestedName) return null;

  const users = await db.user.findMany({
    where: {
      status: RecordStatus.ENABLED,
      role: { status: RecordStatus.ENABLED },
      ...(requestedId ? { id: requestedId } : { realName: requestedName }),
    },
    select: { id: true, realName: true, tags: true, role: { select: { name: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: requestedId ? 1 : 20,
  });
  return users.find(hasSupervisorIdentity) || null;
}

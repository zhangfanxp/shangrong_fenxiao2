import { RecordStatus, type PrismaClient } from "@prisma/client";
import { fixedSystemRoles } from "./system-roles";

export async function synchronizeFixedSystemRoles(db: Pick<PrismaClient, "role">) {
  const synchronized = [];

  for (const definition of fixedSystemRoles) {
    const [roleWithCode, roleWithName] = await Promise.all([
      db.role.findUnique({ where: { code: definition.code } }),
      db.role.findUnique({ where: { name: definition.name } }),
    ]);

    if (roleWithCode && roleWithName && roleWithCode.id !== roleWithName.id) {
      throw new Error(`固定角色“${definition.name}”的名称和英文名称分别被两个角色占用，请先合并冲突数据`);
    }

    const existing = roleWithCode ?? roleWithName;
    const role = existing
      ? await db.role.update({
          where: { id: existing.id },
          data: {
            code: definition.code,
            name: definition.name,
            type: "SYSTEM",
            status: RecordStatus.ENABLED,
            ...(definition.code === "SUPER_ADMIN" ? { permissions: ["*"] } : {}),
          },
        })
      : await db.role.create({
          data: {
            code: definition.code,
            name: definition.name,
            type: "SYSTEM",
            status: RecordStatus.ENABLED,
            permissions: [...definition.defaultPermissions],
          },
        });

    synchronized.push(role);
  }

  return synchronized;
}

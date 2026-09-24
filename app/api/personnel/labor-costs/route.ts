import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { getLaborCostPolicyVersions } from "@/lib/labor-cost-policy";
import { buildPersonnelLaborCostReport } from "@/lib/personnel-labor-costs";
import { canPersonnel } from "@/lib/personnel-service";
import { REST_DAY_YEAR_MAX, REST_DAY_YEAR_MIN } from "@/lib/rest-days";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional();
const draftSchema = z.object({
  name: z.string().max(8).optional(),
  phone: z.string().max(20).optional(),
  baseSalary: z.number().finite().min(0).nullable().optional(),
  positionLevel: z.string().max(50).optional(),
  organization: z.string().max(30).optional(),
  storeId: z.string().nullable().optional(),
  hireDate: date,
  resignationDate: date,
});
const schema = z.object({
  year: z.number().int().min(REST_DAY_YEAR_MIN).max(REST_DAY_YEAR_MAX),
  personnelId: z.string().optional(),
  draft: draftSchema.optional(),
}).refine(value => value.personnelId || value.draft, "缺少人员档案信息");

function canViewLaborCosts(permissions: string[]) {
  return permissions.includes("*") || ["personnel:sensitive", "personnel:salary", "personnel:edit", "personnel:create"].some(permission => permissions.includes(permission));
}

function maskedPhone(phone: string) {
  return /^1\d{10}$/.test(phone) ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : phone;
}

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canViewLaborCosts(session.permissions)) return NextResponse.json({ message: "无人员用工成本查看权限" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message || "用工成本查询条件不正确" }, { status: 400 });
  if (parsed.data.personnelId && !canPersonnel(session, "query") && !canPersonnel(session, "view") && !canPersonnel(session, "edit") && !canPersonnel(session, "salary")) return NextResponse.json({ message: "无人员档案查看权限" }, { status: 403 });
  if (!parsed.data.personnelId && !canPersonnel(session, "create") && !canPersonnel(session, "edit")) return NextResponse.json({ message: "无人员档案编辑权限" }, { status: 403 });

  const canUseDraft = canPersonnel(session, "edit") || canPersonnel(session, "create");
  const draft = canUseDraft ? parsed.data.draft : undefined;
  const personnel = parsed.data.personnelId ? await db.personnel.findFirst({
    where: { id: parsed.data.personnelId, deletedAt: null },
    select: {
      id: true, name: true, phone: true, baseSalary: true, positionLevel: true, organization: true, storeId: true, hireDate: true, resignationDate: true,
      salaryHistory: { select: { oldSalary: true, newSalary: true, effectiveDate: true, createdAt: true }, orderBy: [{ effectiveDate: "asc" }, { createdAt: "asc" }] },
      positionHistory: { select: { oldOrganization: true, newOrganization: true, effectiveDate: true, createdAt: true }, orderBy: [{ effectiveDate: "asc" }, { createdAt: "asc" }] },
    },
  }) : null;
  if (parsed.data.personnelId && !personnel) return NextResponse.json({ message: "人员档案不存在或已删除" }, { status: 404 });

  const storeId = draft && Object.prototype.hasOwnProperty.call(draft, "storeId") ? draft.storeId : personnel?.storeId;
  const [store, restDays, policyVersions] = await Promise.all([
    storeId ? db.store.findUnique({ where: { id: storeId }, select: { id: true, name: true, workdayHours: true } }) : null,
    db.restDay.findMany({ where: { year: parsed.data.year }, select: { startDate: true, endDate: true, holidayType: true } }),
    getLaborCostPolicyVersions(),
  ]);
  const baseSalary = personnel ? Number(personnel.baseSalary) : draft?.baseSalary ?? null;
  const workdayHours = store?.workdayHours === null || store?.workdayHours === undefined ? null : Number(store.workdayHours);
  const rows = buildPersonnelLaborCostReport({
    year: parsed.data.year,
    baseSalary,
    workdayHours,
    organization: draft?.organization ?? personnel?.organization,
    hireDate: draft?.hireDate ?? personnel?.hireDate,
    resignationDate: draft?.resignationDate ?? personnel?.resignationDate,
    salaryHistory: personnel?.salaryHistory || [],
    positionHistory: draft ? [] : personnel?.positionHistory || [],
    restDays,
    policyVersions,
  });
  const maySeeFullPhone = session.permissions.includes("*") || session.permissions.includes("personnel:sensitive") || canPersonnel(session, "edit") || canPersonnel(session, "create");
  const phone = draft?.phone ?? personnel?.phone ?? "";
  return NextResponse.json({
    year: parsed.data.year,
    name: draft?.name ?? personnel?.name ?? "",
    phone: maySeeFullPhone ? phone : maskedPhone(phone),
    baseSalary,
    positionLevel: draft?.positionLevel ?? personnel?.positionLevel ?? "",
    storeName: store?.name ?? null,
    workdayHours,
    rows,
  }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}

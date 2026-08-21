import { createHash } from "crypto";
import { RecordStatus } from "@prisma/client";
import { db } from "@/lib/db";

export function assessmentBrands(value: unknown) {
  return Array.isArray(value) ? Array.from(new Set(value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())))) : [];
}

export function assessmentScopeKey(brandValue: string, assessmentType: string) {
  return createHash("sha256").update(`${brandValue}\u0000${assessmentType}`, "utf8").digest("hex");
}

export function assessmentScopeRows(brandValues: string[], assessmentType: string) {
  return Array.from(new Set(brandValues)).map(brandValue => ({ brandValue, assessmentType, activeKey: assessmentScopeKey(brandValue, assessmentType) }));
}

export async function findAssessmentScopeConflict(brandValues: string[], assessmentType: string, excludeId?: string) {
  if (!brandValues.length) return null;
  const selected = new Set(brandValues);
  const rows = await db.assessment.findMany({
    where: { name: assessmentType, status: RecordStatus.ENABLED, deletedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true, recordNo: true, applicableBrands: true },
  });
  for (const row of rows) {
    const conflictingBrands = assessmentBrands(row.applicableBrands).filter(brand => selected.has(brand));
    if (conflictingBrands.length) return { assessmentId: row.id, recordNo: row.recordNo, brands: conflictingBrands };
  }
  return null;
}

export function assessmentScopeConflictMessage(brands?: string[]) {
  const prefix = brands?.length ? `品牌“${brands.join("、")}”` : "所选品牌";
  return `${prefix}已存在相同考核表类型的有效考核表，请先禁用原考核表后再保存。`;
}

export function isUniqueConflict(error: unknown) {
  return (error as { code?: string }).code === "P2002";
}

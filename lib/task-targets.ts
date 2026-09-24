import type { CooperationType, TaskTarget } from "@prisma/client";

const MAX_TARGET_COUNT = 100;
const MAX_TARGET_LENGTH = 100;

export class TaskTargetError extends Error {}

export function parseTaskSpecifiedTargets(value: string) {
  const targets = [...new Set(value.split(/[｜|\r\n]+/).map(item => item.trim()).filter(Boolean))];
  if (targets.length > MAX_TARGET_COUNT) throw new TaskTargetError(`指定对象不能超过${MAX_TARGET_COUNT}项`);
  const oversized = targets.find(item => Array.from(item).length > MAX_TARGET_LENGTH);
  if (oversized) throw new TaskTargetError(`指定对象“${oversized.slice(0, 20)}”不能超过${MAX_TARGET_LENGTH}个字符`);
  return targets;
}

export function readTaskSpecifiedTargets(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string").map(item => item.trim()).filter(Boolean))];
}

export function taskSpecifiedTargetsText(value: unknown) {
  return readTaskSpecifiedTargets(value).join("｜");
}

export function storeMatchesSpecifiedTargets(store: { name: string; cooperationType?: CooperationType }, targets: readonly string[]) {
  if (!targets.length) return true;
  const cooperationLabel = store.cooperationType === "DIRECT" ? "直营店" : store.cooperationType === "FRANCHISE" ? "加盟店" : null;
  return targets.includes(store.name) || Boolean(cooperationLabel && targets.includes(cooperationLabel));
}

export function employeeMatchesSpecifiedTargets(personnel: { name: string; positionLevel: string } | null | undefined, targets: readonly string[]) {
  if (!personnel) return false;
  return !targets.length || targets.includes(personnel.name) || targets.includes(personnel.positionLevel);
}

export function taskTargetLabel(value: TaskTarget) {
  return value === "STORE_EMPLOYEE" ? "门店员工" : "门店";
}

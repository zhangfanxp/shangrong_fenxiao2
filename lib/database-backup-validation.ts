import { z } from "zod";

export const backupFrequencyValues = ["DAILY", "WEEKLY"] as const;
export type BackupFrequency = (typeof backupFrequencyValues)[number];

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "请选择正确的执行时间");

export const databaseBackupSettingSchema = z.object({
  r2StorageId: z.string().trim().min(1, "请选择R2存储桶"),
  enabled: z.boolean(),
  frequency: z.enum(backupFrequencyValues),
  weekdays: z.array(z.number().int().min(1).max(7)).max(7).default([]),
  executionTimes: z.array(timeSchema).max(3),
}).superRefine((value, context) => {
  const uniqueTimes = new Set(value.executionTimes);
  if (uniqueTimes.size !== value.executionTimes.length) context.addIssue({ code: "custom", path: ["executionTimes"], message: "执行时间不能重复" });
  if (value.frequency === "DAILY" && (value.executionTimes.length < 1 || value.executionTimes.length > 3)) {
    context.addIssue({ code: "custom", path: ["executionTimes"], message: "每日备份至少选择一个执行时间，最多三个" });
  }
  if (value.frequency === "WEEKLY") {
    if (value.executionTimes.length !== 1) context.addIssue({ code: "custom", path: ["executionTimes"], message: "每周备份请选择一个执行时间" });
    if (new Set(value.weekdays).size < 1) context.addIssue({ code: "custom", path: ["weekdays"], message: "每周备份至少选择一个星期" });
  }
});

export const manualDatabaseBackupSchema = z.object({ r2StorageId: z.string().trim().min(1, "请选择R2存储桶") });
export const deleteDatabaseBackupsSchema = z.object({ ids: z.array(z.string().trim().min(1)).min(1, "请选择要删除的备份文件").max(100, "每次最多删除100个备份文件") });

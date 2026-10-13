import { loadEnvConfig } from "@next/env";
import { StoreLaborRecordStatus } from "@prisma/client";

function key(storeId: string, value: Date) {
  return `${storeId}:${value.toISOString().slice(0, 10)}`;
}

async function main() {
  loadEnvConfig(process.cwd());
  const [{ db }, { loadDailySalesReportSource }] = await Promise.all([
    import("../lib/db"),
    import("../lib/daily-sales-report"),
  ]);
  const source = await loadDailySalesReportSource();
  try {
    const [attendanceRows, salesRows, laborRows, policyCount] = await Promise.all([
      db.dailyAttendanceRecord.findMany({ select: { storeId: true, attendanceDate: true } }),
      db.taskSubmission.findMany({
        where: { taskIdSnapshot: source.templateId },
        select: { storeId: true, executionDate: true },
        distinct: ["storeId", "executionDate"],
      }),
      db.storeLaborRecord.findMany({
        select: {
          storeId: true,
          businessDate: true,
          policyVersionId: true,
          actualHeadcount: true,
          assessedAmount: true,
          standardHeadcountSnapshot: true,
          laborStatus: true,
          unavailableReason: true,
        },
      }),
      db.storeLaborStandardPolicyVersion.count(),
    ]);
    const sourceKeys = new Set([
      ...attendanceRows.map(row => key(row.storeId, row.attendanceDate)),
      ...salesRows.map(row => key(row.storeId, row.executionDate)),
    ]);
    const laborKeys = new Set(laborRows.map(row => key(row.storeId, row.businessDate)));
    const missing = [...sourceKeys].filter(value => !laborKeys.has(value));
    const unexpected = [...laborKeys].filter(value => !sourceKeys.has(value));
    const invalid = laborRows.filter(row => {
      if (!row.policyVersionId) return true;
      if (row.laborStatus === StoreLaborRecordStatus.UNABLE_TO_CALCULATE) return !row.unavailableReason;
      return row.actualHeadcount === null || row.assessedAmount === null || row.standardHeadcountSnapshot === null || Boolean(row.unavailableReason);
    });
    if (missing.length || unexpected.length || invalid.length) {
      throw new Error(`用工记录校验失败：缺少${missing.length}条，多余${unexpected.length}条，字段异常${invalid.length}条`);
    }
    process.stdout.write(`${JSON.stringify({ sourceDates: sourceKeys.size, laborRecords: laborRows.length, policyVersions: policyCount, valid: true })}\n`);
  } finally {
    await db.$disconnect();
  }
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : "用工记录校验失败"}\n`);
  process.exitCode = 1;
});

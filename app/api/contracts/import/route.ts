import ExcelJS from "exceljs";
import { ContractStatus, CooperationType } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { getBusinessDictionaries } from "@/lib/business-dictionaries";
import {
  contractImportFields,
  isStrictDate,
  parseContractImportSheet,
  parseNonnegativeAmount,
  validateContractImportDistrict,
  type ContractImportIssue,
  type ContractImportRow,
} from "@/lib/contract-import";
import { contractInputSchema } from "@/lib/contract-validation";
import { db } from "@/lib/db";
import { writeOperationLog } from "@/lib/operation-log";
import { canContractAction } from "@/lib/contract-permissions";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_ROWS = 500;
const limits: Partial<Record<keyof ContractImportRow, number>> = {
  storeName: 60, archiveBox: 60, ownerName: 30, ownerPhone: 30, ownerIdNumber: 30,
  contactName: 30, contactPhone: 30, address: 200, depositRecipient: 30, remark: 500,
};

type ValidRow = {
  brandId: string;
  storeName: string;
  status: ContractStatus;
  cooperationType: CooperationType;
  archiveBox: string;
  trialOpenDate?: string;
  ownerName: string;
  ownerPhone?: string;
  ownerIdNumber?: string;
  contactName: string;
  contactPhone: string;
  province?: string;
  city?: string;
  district?: string;
  address?: string;
  cooperationFee: number;
  brandFee: number;
  financeServiceFee: number;
  designFee: number;
  deposit: number;
  depositRecipient?: string;
  startDate: string;
  endDate: string;
  remark?: string;
};

function normalized(value: string) {
  return value.normalize("NFKC").trim();
}

function optionValue(options: { label: string; value: string }[], source: string) {
  const match = options.find(option => option.label === source || option.value === source);
  return match?.value;
}

function optional(value: string) {
  return value || undefined;
}

function addLengthIssues(data: ContractImportRow, messages: string[]) {
  for (const [key, limit] of Object.entries(limits) as [keyof ContractImportRow, number][]) {
    if (data[key].length > limit) {
      const field = contractImportFields.find(item => item.key === key);
      messages.push(`${field?.header || key}不能超过 ${limit} 个字符`);
    }
  }
}

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ message: "登录状态已失效，请重新登录" }, { status: 401 });
  if (!canContractAction(session.permissions, "import")) return NextResponse.json({ message: "暂无合同导入权限" }, { status: 403 });

  let fileName = "";
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ message: "请选择 .xlsx 格式的合同导入文件" }, { status: 400 });
    fileName = file.name;
    if (!file.name.toLowerCase().endsWith(".xlsx")) return NextResponse.json({ message: "仅支持 .xlsx 格式文件" }, { status: 400 });
    if (file.size > MAX_FILE_SIZE) return NextResponse.json({ message: "导入文件不能超过 10MB" }, { status: 400 });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(await file.arrayBuffer()) as never);
    const sheet = workbook.worksheets[0];
    if (!sheet) return NextResponse.json({ message: "导入文件没有工作表" }, { status: 400 });
    const rows = parseContractImportSheet(sheet);
    if (rows.length > MAX_ROWS) return NextResponse.json({ message: `单次最多导入 ${MAX_ROWS} 条合同记录` }, { status: 400 });

    const [brands, dictionaries] = await Promise.all([
      db.brand.findMany({ select: { id: true, name: true } }),
      getBusinessDictionaries(["BRAND", "CONTRACT_STATUS", "COOPERATION_TYPE"]),
    ]);
    const brandsByName = new Map(brands.map(brand => [brand.name, brand]));
    const validRows: ValidRow[] = [];
    const issues: ContractImportIssue[] = [];

    for (const row of rows) {
      const data = Object.fromEntries(Object.entries(row.data).map(([key, value]) => [key, normalized(value)])) as ContractImportRow;
      const messages: string[] = [];
      for (const field of contractImportFields.filter(item => item.required)) {
        if (!data[field.key]) messages.push(`${field.header}为必填项`);
      }
      addLengthIssues(data, messages);
      if (data.trialOpenDate && !isStrictDate(data.trialOpenDate)) messages.push("试营业日期格式须为 YYYY-MM-DD");
      if (data.startDate && !isStrictDate(data.startDate)) messages.push("合同开始日期格式须为 YYYY-MM-DD");
      if (data.endDate && !isStrictDate(data.endDate)) messages.push("合同截止日期格式须为 YYYY-MM-DD");
      if (isStrictDate(data.startDate) && isStrictDate(data.endDate) && data.endDate < data.startDate) messages.push("合同截止日期不能早于合同开始日期");
      const districtIssue = validateContractImportDistrict(data);
      if (districtIssue) messages.push(districtIssue);

      const brand = brandsByName.get(data.brandName);
      if (!brand) messages.push(`品牌“${data.brandName || "（空）"}”不存在`);
      else if (!dictionaries.BRAND?.some(option => option.label === data.brandName || option.value === data.brandName)) messages.push(`品牌“${data.brandName}”不在已启用的数据字典中`);
      const cooperationType = optionValue(dictionaries.COOPERATION_TYPE || [], data.cooperationType);
      if (!cooperationType) messages.push(`合作类型“${data.cooperationType || "（空）"}”不在已启用的数据字典中`);
      const status = optionValue(dictionaries.CONTRACT_STATUS || [], data.status);
      if (!status) messages.push(`合同状态“${data.status || "（空）"}”不在已启用的数据字典中`);
      else if (status === ContractStatus.TERMINATED) messages.push("新增合同不能直接设为已解约");
      else if (status === ContractStatus.EXPIRED) messages.push("新增合同不能直接设为已过期，系统会根据合同截止日期自动更新");

      const monetaryFields = [
        ["cooperationFee", "合作费"], ["brandFee", "品牌使用费"], ["financeServiceFee", "财务服务费"], ["designFee", "设计费"], ["deposit", "保证金"],
      ] as const;
      const amounts = Object.fromEntries(monetaryFields.map(([key, label]) => [key, parseNonnegativeAmount(data[key], label)])) as Record<(typeof monetaryFields)[number][0], { value?: number; error?: string }>;
      for (const amount of Object.values(amounts)) if (amount.error) messages.push(amount.error);

      const candidate = {
        brandId: brand?.id || "", storeName: data.storeName, status: status || "", cooperationType: cooperationType || "", archiveBox: data.archiveBox,
        trialOpenDate: optional(data.trialOpenDate), contactName: data.contactName, contactPhone: data.contactPhone, ownerName: data.ownerName,
        ownerPhone: optional(data.ownerPhone), ownerIdNumber: optional(data.ownerIdNumber), province: optional(data.province), city: optional(data.city), district: optional(data.district), address: optional(data.address),
        cooperationFee: amounts.cooperationFee.value ?? 0, brandFee: amounts.brandFee.value ?? 0, financeServiceFee: amounts.financeServiceFee.value ?? 0, designFee: amounts.designFee.value ?? 0, deposit: amounts.deposit.value ?? 0,
        depositRecipient: optional(data.depositRecipient), startDate: data.startDate, endDate: data.endDate, remark: optional(data.remark),
      };
      const schemaResult = contractInputSchema.safeParse(candidate);
      if (!schemaResult.success) messages.push(...schemaResult.error.issues.map(issue => issue.message));
      if (messages.length) {
        issues.push({ row: row.row, excelRow: row.excelRow, messages: [...new Set(messages)] });
        continue;
      }
      if (!schemaResult.success) continue;
      const { rebates: _rebates, ...validRow } = schemaResult.data;
      validRows.push(validRow);
    }

    if (issues.length) {
      await writeOperationLog({ userId: session.userId, username: session.username, page: "合同管理", action: "批量导入", result: "失败", detail: `源文件：${fileName}；共 ${rows.length} 条；校验不通过 ${issues.length} 条；未导入任何数据`, request }).catch(() => undefined);
      return NextResponse.json({ message: "导入数据校验未通过，未导入任何合同记录", total: rows.length, issues }, { status: 400 });
    }

    const year = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric" }).format(new Date());
    const prefix = `HT${year}`;
    await db.$transaction(async tx => {
      const records = await tx.contract.findMany({ where: { recordNo: { startsWith: prefix } }, select: { recordNo: true } });
      const maxSequence = records.reduce((max, record) => {
        const suffix = Number(record.recordNo.slice(prefix.length));
        return Number.isSafeInteger(suffix) ? Math.max(max, suffix) : max;
      }, 0);
      await Promise.all(validRows.map((row, index) => tx.contract.create({ data: {
        recordNo: `${prefix}${String(maxSequence + index + 1).padStart(6, "0")}`,
        brandId: row.brandId,
        storeName: row.storeName,
        status: row.status,
        cooperationType: row.cooperationType,
        archiveBox: row.archiveBox,
        trialOpenDate: row.trialOpenDate ? new Date(`${row.trialOpenDate}T00:00:00.000Z`) : undefined,
        ownerName: row.ownerName,
        ownerPhone: row.ownerPhone,
        ownerIdNumber: row.ownerIdNumber,
        contactName: row.contactName,
        contactPhone: row.contactPhone,
        province: row.province,
        city: row.city,
        district: row.district,
        address: row.address,
        cooperationFee: row.cooperationFee,
        brandFee: row.brandFee,
        financeServiceFee: row.financeServiceFee,
        designFee: row.designFee,
        deposit: row.deposit,
        depositRecipient: row.depositRecipient,
        startDate: new Date(`${row.startDate}T00:00:00.000Z`),
        endDate: new Date(`${row.endDate}T00:00:00.000Z`),
        remark: row.remark,
      } })));
    });
    await writeOperationLog({ userId: session.userId, username: session.username, page: "合同管理", action: "批量导入", result: "成功", detail: `源文件：${fileName}；导入 ${validRows.length} 条合同记录`, request }).catch(() => undefined);
    return NextResponse.json({ total: validRows.length, success: validRows.length });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "合同批量导入失败，请稍后重试";
    const isDatabaseError = error instanceof Error && error.name.startsWith("PrismaClient");
    const message = isDatabaseError ? "合同数据写入失败，本次未导入任何记录，请稍后重试" : detail;
    await writeOperationLog({ userId: session.userId, username: session.username, page: "合同管理", action: "批量导入", result: "失败", detail: `${fileName ? `源文件：${fileName}；` : ""}${detail}`, request }).catch(() => undefined);
    return NextResponse.json({ message }, { status: isDatabaseError ? 500 : 400 });
  }
}

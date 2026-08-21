import { ContractStatus, CooperationType } from "@prisma/client";
import { z } from "zod";

const optionalText = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed || undefined;
}, z.string().optional());
const optionalDate = z.preprocess((value) => value || undefined, z.string().date().optional());
const amount = z.coerce.number({ invalid_type_error: "金额须为数字" }).min(0, "金额不能小于 0").default(0);
const rebateAmount = z.coerce.number({ invalid_type_error: "返利金额须为数字" }).min(0, "返利金额不能小于 0");
const rebateSchema = z.object({
  type: z.string().trim().min(1, "请选择返利类型"),
  person: z.string().trim().min(1, "请输入返利人"),
  amount: rebateAmount,
});

export const contractInputSchema = z.object({
  brandId: z.string().min(1, "请选择品牌"),
  storeName: z.string().trim().min(1, "请输入门店名称"),
  status: z.nativeEnum(ContractStatus),
  cooperationType: z.nativeEnum(CooperationType),
  archiveBox: z.string().trim().min(1, "请输入档案盒号"),
  trialOpenDate: optionalDate,
  contactName: z.string().trim().min(1, "请输入联系人"),
  contactPhone: z.string().trim().min(1, "请输入联系电话"),
  ownerName: z.string().trim().min(1, "请输入业主姓名"),
  ownerPhone: optionalText,
  ownerIdNumber: optionalText,
  province: optionalText,
  city: optionalText,
  district: optionalText,
  address: optionalText,
  cooperationFee: amount,
  brandFee: amount,
  financeServiceFee: amount,
  designFee: amount,
  deposit: amount,
  depositRecipient: optionalText,
  rebates: z.array(rebateSchema).default([]),
  startDate: z.string().date("请选择合同开始日期"),
  endDate: z.string().date("请选择合同截止日期"),
  remark: optionalText,
}).refine((value) => new Date(value.endDate) >= new Date(value.startDate), {
  message: "合同截止日期不能早于开始日期",
  path: ["endDate"],
});

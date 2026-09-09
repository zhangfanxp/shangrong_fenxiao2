import { CooperationType, StoreOperationStatus } from "@prisma/client";
import { z } from "zod";

// 合同接口和已有门店档案会以 null 表示未填写的可选字段。
const optionalText = (max: number) => z.string().trim().max(max, `内容不能超过 ${max} 个字符`).nullish().transform((value) => value || null);
const optionalDate = z.string().trim().nullish().transform((value, context) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "日期格式不正确" });
    return z.NEVER;
  }
  return date;
});

export const storeInputSchema = z.object({
  contractId: z.string().trim().nullish().transform((value) => value || null),
  brandId: z.string().trim().min(1, "请选择品牌"),
  name: z.string().trim().min(1, "请输入门店名称").max(60, "门店名称不能超过 60 个字符"),
  cooperationType: z.nativeEnum(CooperationType),
  operationStatus: z.nativeEnum(StoreOperationStatus),
  region: optionalText(60),
  supervisorName: optionalText(30),
  province: optionalText(30),
  city: optionalText(30),
  district: optionalText(30),
  address: optionalText(200),
  startDate: optionalDate,
  endDate: optionalDate,
  businessDistrict: optionalText(60),
  locationType: optionalText(60),
  trialOpenDate: optionalDate,
  formalOpenDate: optionalDate,
  ownerName: optionalText(30),
  ownerPhone: z.string().trim().regex(/^$|^1\d{10}$/, "请输入正确的 11 位手机号码").nullish().transform((value) => value || null),
  ownerIdNumber: optionalText(30),
}).superRefine((data, context) => {
  if (data.startDate && data.endDate && data.startDate > data.endDate) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["endDate"], message: "结束日期不能早于开始日期" });
  }
  if (data.trialOpenDate && data.formalOpenDate && data.trialOpenDate > data.formalOpenDate) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["formalOpenDate"], message: "正式营业日期不能早于试营业日期" });
  }
});

export type StoreInput = z.infer<typeof storeInputSchema>;

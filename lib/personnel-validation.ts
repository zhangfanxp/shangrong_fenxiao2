import { PlatformAccess, PersonnelStatus, SocialSecurityStatus } from "@prisma/client";
import { z } from "zod";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式应为YYYY-MM-DD");

export function isValidChineseIdNumber(input: string) {
  const value = input.toUpperCase();
  if (!/^\d{17}[\dX]$/.test(value)) return false;
  const birth = value.slice(6, 14);
  const year = Number(birth.slice(0, 4)); const month = Number(birth.slice(4, 6)); const day = Number(birth.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return false;
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const checks = ["1", "0", "X", "9", "8", "7", "6", "5", "4", "3", "2"];
  const sum = weights.reduce((total, weight, index) => total + Number(value[index]) * weight, 0);
  return checks[sum % 11] === value[17];
}

export const personnelInputSchema = z.object({
  name: z.string().trim().min(1, "请输入姓名").max(8, "姓名不能超过8个汉字"),
  phone: z.string().trim().regex(/^1\d{10}$/, "请输入正确的11位手机号"),
  idNumber: z.string().trim().transform(value => value.toUpperCase()).refine(isValidChineseIdNumber, "请输入正确的身份证号码"),
  birthday: z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, "员工生日格式不正确").nullable().optional(),
  status: z.nativeEnum(PersonnelStatus).default(PersonnelStatus.ACTIVE),
  hireDate: dateString,
  positionLevel: z.string().trim().min(1, "请选择所属岗位星级").max(50),
  organization: z.string().trim().min(1, "请选择人员归属").max(30),
  storeId: z.string().min(1, "请选择部门/店面"),
  contractSignDate: dateString,
  contractYears: z.number().int().min(1, "合同年限必须大于0").max(50, "合同年限不能超过50年").nullable().optional(),
  contractExpiryDate: dateString,
  homeAddress: z.string().trim().min(1, "请输入家庭住址").max(50, "家庭住址不能超过50个字符"),
  currentAddress: z.string().trim().min(1, "请输入现住址").max(50, "现住址不能超过50个字符"),
  supplementaryMaterial: z.string().trim().max(50, "需补充材料不能超过50个字符").nullable().optional(),
  baseSalary: z.number().min(0, "基本工资不能小于0").max(9999999999),
  laborCost: z.number({ message: "请输入用工成本" }).min(0, "用工成本不能小于0").max(9999999999),
  workdayHours: z.number().min(0.01, "工作日小时必须大于0").max(24, "工作日小时不能超过24小时").nullable().optional(),
  socialSecurity: z.nativeEnum(SocialSecurityStatus),
  platformAccess: z.nativeEnum(PlatformAccess).nullable().optional(),
  platformUserId: z.string().nullable().optional(),
  remark: z.string().trim().max(50, "备注信息不能超过50个字符").nullable().optional(),
  version: z.number().int().positive().optional(),
}).superRefine((data, ctx) => {
  if (data.status !== PersonnelStatus.ACTIVE) ctx.addIssue({ code: "custom", path: ["status"], message: "离职状态只能通过员工离职操作设置" });
  if (new Date(data.contractExpiryDate) < new Date(data.contractSignDate)) ctx.addIssue({ code: "custom", path: ["contractExpiryDate"], message: "合同到期日不能早于合同签署日期" });
  if (data.platformAccess === PlatformAccess.YES && !data.platformUserId) ctx.addIssue({ code: "custom", path: ["platformUserId"], message: "请选择平台用户" });
});

export type PersonnelInput = z.infer<typeof personnelInputSchema>;

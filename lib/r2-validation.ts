import { RecordStatus } from "@prisma/client";
import { z } from "zod";

const shortText = (emptyMessage: string, lengthMessage: string, max: number) => z.string().trim().min(1, emptyMessage).refine(value => Array.from(value).length <= max, lengthMessage);
const endpoint = z.string().trim().min(1, "请输入endpoint").max(150, "endpoint不能超过150个字符").url("请输入正确的endpoint地址").refine(value => ["http:", "https:"].includes(new URL(value).protocol), "请输入正确的endpoint地址").transform(value => value.replace(/\/+$/, ""));
const expiry = z.number({ invalid_type_error: "请输入Signed URL有效时间" }).int("Signed URL有效时间必须为正整数").min(1, "Signed URL有效时间必须为正整数").max(604800, "Signed URL有效时间不能超过604800秒");

const common = {
  name: shortText("请输入R2存储空间名称", "R2存储空间名称不能超过20个汉字", 20),
  accountId: z.string().trim().min(1, "请输入accountID").max(50, "accountID不能超过50个字符"),
  bucketName: z.string().trim().min(1, "请输入bucketName").max(50, "bucketName不能超过50个字符"),
  endpoint,
  signedUrlExpireSeconds: expiry,
  status: z.nativeEnum(RecordStatus, { message: "请选择状态" }),
};

const credential = (emptyMessage: string, lengthMessage: string, max: number) => z.string().min(1, emptyMessage).max(max, lengthMessage);
const optionalCredential = (lengthMessage: string, max: number) => z.preprocess(value => typeof value === "string" && value.length === 0 ? undefined : value, z.string().max(max, lengthMessage).optional());

export const createR2Schema = z.object({
  ...common,
  accessKeyId: credential("请输入accessKeyId", "accessKeyId不能超过50个字符", 50),
  secretAccessKey: credential("请输入secretAccessKey", "secretAccessKey不能超过100个字符", 100),
});

export const editR2Schema = z.object({
  ...common,
  accessKeyId: optionalCredential("accessKeyId不能超过50个字符", 50),
  secretAccessKey: optionalCredential("secretAccessKey不能超过100个字符", 100),
  updatedAt: z.string().datetime({ offset: true }),
});

export const versionedActionSchema = z.object({ updatedAt: z.string().datetime({ offset: true }) });

export type CreateR2Input = z.infer<typeof createR2Schema>;
export type EditR2Input = z.infer<typeof editR2Schema>;

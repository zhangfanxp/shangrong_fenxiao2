import { z } from "zod";
import deploymentManifest from "@/deployment/manifest.json";

export const SETUP_HOST = "127.0.0.1";
export const SETUP_PORT = 3210;
export const DEPLOYMENT_BASELINE_ID = "baseline-20260903";
export const DEPLOYMENT_SCHEMA_VERSION = deploymentManifest.deploymentVersion;
export const DATABASE_SCHEMA_VERSION = deploymentManifest.databaseSchemaVersion;
export const CONFIG_SCHEMA_VERSION = deploymentManifest.configSchemaVersion;
export const WEB_AGENT_LABEL = "com.canyin.web";
export const SCHEDULER_AGENT_LABEL = "com.canyin.scheduler";

export const SYSTEM_DICTIONARIES = [
  { recordNo: "202608200001", name: "品牌", code: "BRAND", fileName: "Band.json" },
  { recordNo: "202608200002", name: "合同状态", code: "CONTRACT_STATUS", fileName: "Contract_Status.json" },
  { recordNo: "202608200003", name: "合作类型", code: "COOPERATION_TYPE", fileName: "Cooperation_Type.json" },
  { recordNo: "202608200004", name: "返点类型", code: "REBATE_TYPE", fileName: "Rebate_Type.json" },
  { recordNo: "202608200005", name: "运营状态", code: "STORE_OPERATION_STATUS", fileName: "Operating_Status.json" },
  { recordNo: "202608200006", name: "门店所属区域", code: "STORE_AREA", fileName: "Area.json" },
  { recordNo: "202608200007", name: "门店位置类型", code: "LOCATION_TYPE", fileName: "Location_Type.json" },
  { recordNo: "202608200008", name: "岗位星级", code: "POSITION_LEVEL", fileName: "Position_Level.json" },
  { recordNo: "202608200009", name: "人员状态", code: "PERSONNELSTATUS", fileName: "Personnel_Status.json" },
  { recordNo: "202608200010", name: "社保情况", code: "SOCIAL_SECURITY_STATUS", fileName: "Social_Security_Status.json" },
  { recordNo: "202608210001", name: "考核表类型", code: "Assessment_Type", fileName: "Assessment_Type.json" },
  { recordNo: "202608250001", name: "调研模版类型", code: "Research_Template_Type", fileName: "Research_Template_Type.json" },
] as const;

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "备份时间格式不正确");
const endpointSchema = z.string().trim().url("请输入正确的R2 endpoint").refine(value => new URL(value).protocol === "https:", "R2 endpoint必须使用HTTPS").transform(value => value.replace(/\/+$/, ""));
const dbNameSchema = z.string().trim().regex(/^[A-Za-z0-9_]{1,64}$/, "数据库名称只能包含字母、数字和下划线");

export const setupInputSchema = z.object({
  platformName: z.string().trim().min(1, "请输入系统名称").max(50, "系统名称不能超过50个字符"),
  appPort: z.number().int().min(1024, "应用端口不能小于1024").max(65535, "应用端口不能大于65535").refine(value => value !== SETUP_PORT, `应用端口不能使用setup端口${SETUP_PORT}`),
  database: z.object({
    host: z.string().trim().min(1, "请输入数据库地址").max(255),
    port: z.number().int().min(1).max(65535),
    name: dbNameSchema,
    user: z.string().trim().min(1, "请输入数据库账号").max(64),
    password: z.string().max(256),
    adminUser: z.string().trim().max(64).optional(),
    adminPassword: z.string().max(256).optional(),
  }),
  administrator: z.object({
    username: z.string().trim().regex(/^[A-Za-z][A-Za-z0-9_.-]{2,29}$/, "管理员账号须为3-30位并以字母开头"),
    realName: z.string().trim().min(1, "请输入管理员姓名").max(30),
    phone: z.string().trim().max(30).optional(),
    password: z.string().min(10, "管理员密码至少需要10位").max(128).refine(value => /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value), "管理员密码须同时包含大小写字母、数字和特殊字符"),
  }),
  r2: z.object({
    name: z.string().trim().min(1, "请输入R2存储空间名称").max(20),
    accountId: z.string().trim().min(1, "请输入R2 account ID").max(50),
    accessKeyId: z.string().min(1, "请输入R2 access key ID").max(50),
    secretAccessKey: z.string().min(1, "请输入R2 secret access key").max(100),
    bucketName: z.string().trim().min(1, "请输入R2 bucket名称").max(50),
    endpoint: endpointSchema,
    signedUrlExpireSeconds: z.number().int().min(60).max(604800),
    usages: z.object({
      dailyLearning: z.boolean(),
      trainingVideo: z.boolean(),
      trainingAudio: z.boolean(),
      trainingDocument: z.boolean(),
    }),
  }),
  backup: z.object({
    frequency: z.enum(["DAILY", "WEEKLY"]),
    weekdays: z.array(z.number().int().min(1).max(7)).max(7),
    executionTimes: z.array(timeSchema).min(1, "请至少设置一个备份时间").max(3, "每天最多设置三个备份时间"),
    mysqldumpBin: z.string().trim().max(500).optional(),
  }),
}).superRefine((value, context) => {
  if (new Set(value.backup.executionTimes).size !== value.backup.executionTimes.length) context.addIssue({ code: "custom", path: ["backup", "executionTimes"], message: "备份时间不能重复" });
  if (value.backup.frequency === "WEEKLY" && !value.backup.weekdays.length) context.addIssue({ code: "custom", path: ["backup", "weekdays"], message: "每周备份至少选择一个星期" });
  if (value.backup.frequency === "WEEKLY" && value.backup.executionTimes.length !== 1) context.addIssue({ code: "custom", path: ["backup", "executionTimes"], message: "每周备份只能设置一个执行时间" });
});

export type SetupInput = z.infer<typeof setupInputSchema>;

export type DeploymentState = {
  schemaVersion: number;
  databaseSchemaVersion: number;
  configSchemaVersion: number;
  installId: string;
  appVersion: string;
  databaseName: string;
  appHost: typeof SETUP_HOST;
  appPort: number;
  appUrl: string;
  installedAt: string;
  lastRepairedAt?: string;
  status: "installed" | "needs-attention";
  webAgentLabel: typeof WEB_AGENT_LABEL;
  schedulerAgentLabel: typeof SCHEDULER_AGENT_LABEL;
  lastVerification?: { database: boolean; r2: boolean; backup: boolean; web: boolean; scheduler: boolean };
};

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { RecordStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { decryptR2Credential, encryptR2Credential } from "@/lib/r2-crypto";
import { createR2Config } from "@/lib/r2-config-service";
import { getPlatformConfig, savePlatformConfig, type PlatformConfig } from "@/lib/platform-config";
import { readDictionaryValues } from "@/lib/dictionary-config";
import { readTaskConfig } from "@/lib/task-config";
import { ASSESSMENT_CONFIG_DIRECTORY } from "@/lib/assessment-config";
import { RESEARCH_CONFIG_DIRECTORY } from "@/lib/research-template-config";
import { DEPLOYMENT_SCHEMA_VERSION } from "@/lib/deployment";
import packageJson from "../package.json";

const FORMAT = "canyin-system-reference-data";
const PACKAGE_VERSION = 1;
const MAX_PACKAGE_BYTES = 50 * 1024 * 1024;
const DICTIONARY_DIR = path.join(process.cwd(), "Data_Dictionary");
const TASK_CONFIG_DIR = path.join(process.cwd(), "data", "task-configs");
const PLATFORM_CONFIG_PATH = path.join(process.cwd(), "config", "platform.config.json");
const DAY_HOUR_CONFIG_PATH = path.join(process.cwd(), "config", "band_day_hour.config.json");

type AnyRecord = Record<string, any>;
type PackageData = {
  roles: AnyRecord[];
  brands: AnyRecord[];
  dataDictionaries: AnyRecord[];
  dictionaryItems: AnyRecord[];
  dictionaryFiles: AnyRecord[];
  taskCalendarTemplates: AnyRecord[];
  tasks: AnyRecord[];
  assessments: AnyRecord[];
  researchTemplates: AnyRecord[];
  businessDataSources: AnyRecord[];
  restDays: AnyRecord[];
  storeLaborStandards: AnyRecord[];
  laborPolicyVersions: AnyRecord[];
  r2StorageConfigs: AnyRecord[];
  platformSettings: AnyRecord;
  bandDayHourConfig: unknown;
};
type DeploymentDataPackage = { format: string; packageVersion: number; source: AnyRecord; data: PackageData };

function jsonCopy<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function isRecord(value: unknown): value is AnyRecord { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function safeFileName(value: unknown, max = 30) {
  if (typeof value !== "string" || !new RegExp(`^[A-Za-z0-9_]{1,${max}}\\.json$`).test(value) || path.basename(value) !== value) throw new Error("资料包中包含不合法的配置文件名");
  return value;
}
function packageCounts(data: PackageData) {
  return {
    roles: data.roles.length,
    brands: data.brands.length,
    dataDictionaries: data.dataDictionaries.length,
    dictionaryItems: data.dictionaryItems.length,
    dictionaryValues: data.dictionaryFiles.reduce((sum, file) => sum + (Array.isArray(file.contents?.values) ? file.contents.values.length : 0), 0),
    taskCalendarTemplates: data.taskCalendarTemplates.length,
    tasks: data.tasks.length,
    assessments: data.assessments.length,
    researchTemplates: data.researchTemplates.length,
    businessDataSources: data.businessDataSources.length,
    restDays: data.restDays.length,
    storeLaborStandards: data.storeLaborStandards.length,
    r2StorageConfigs: data.r2StorageConfigs.length,
  };
}

export async function getDeploymentDataOverview() {
  const [roles, brands, dictionaries, dictionaryItems, dictionaryFiles, calendarTemplates, tasks, assessments, researchTemplates, sources, restDays, laborStandards, r2Configs] = await Promise.all([
    db.role.findMany({ orderBy: [{ type: "asc" }, { name: "asc" }], select: { code: true, name: true, type: true, status: true } }),
    db.brand.findMany({ orderBy: { name: "asc" }, select: { code: true, name: true, status: true } }),
    db.dataDictionary.findMany({ orderBy: { name: "asc" }, select: { code: true, name: true, fileName: true, status: true } }),
    db.dictionaryItem.findMany({ orderBy: [{ type: "asc" }, { sort: "asc" }], select: { type: true, value: true, label: true, status: true } }),
    fs.readdir(DICTIONARY_DIR, { withFileTypes: true }).then(items => items.filter(item => item.isFile() && /^[A-Za-z0-9_]{1,30}\.json$/.test(item.name)).map(item => item.name)).catch(() => []),
    db.taskCalendarTemplate.findMany({ orderBy: { name: "asc" }, select: { recordNo: true, name: true, status: true } }),
    db.task.findMany({ where: { deletedAt: null, configFileName: { not: null } }, orderBy: { title: "asc" }, select: { recordNo: true, title: true, status: true, configFileName: true } }),
    db.assessment.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { recordNo: true, name: true, status: true, configFileName: true } }),
    db.researchTemplate.findMany({ where: { deletedAt: null }, orderBy: [{ templateType: "asc" }, { recordNo: "asc" }], select: { recordNo: true, templateType: true, status: true, configFileName: true } }),
    db.businessDataSource.findMany({ orderBy: { businessName: "asc" }, select: { recordNo: true, businessName: true, sourceType: true, templateNameSnapshot: true } }),
    db.restDay.findMany({ orderBy: [{ year: "desc" }, { startDate: "asc" }], select: { recordNo: true, year: true, holidayNameSnapshot: true, startDate: true, endDate: true } }),
    db.storeLaborStandard.findMany({ orderBy: [{ brandValue: "asc" }, { lowerAmount: "asc" }], select: { recordNo: true, brandValue: true, assessmentMetric: true, lowerAmount: true, upperAmount: true, standardHeadcount: true } }),
    db.r2StorageConfig.findMany({ orderBy: { name: "asc" }, select: { recordNo: true, name: true, accountId: true, bucketName: true, status: true, deletedAt: true } }),
  ]);
  const values = await Promise.all(dictionaries.map(async dictionary => {
    try { return [dictionary.fileName, await readDictionaryValues(dictionary.fileName)] as const; } catch { return [dictionary.fileName, [] as string[]] as const; }
  }));
  const valueMap = new Map(values);
  const categories = [
    { key: "roles", title: "角色", count: roles.length, entries: roles.map(row => `${row.name}（${row.type === "SYSTEM" ? "系统" : "自定义"}）`) },
    { key: "brands", title: "品牌基础资料", count: brands.length, entries: brands.map(row => row.name) },
    { key: "dictionaries", title: "数据字典及字典项", count: dictionaries.length + dictionaryItems.length, entries: [...dictionaries.map(row => `${row.name}：${(valueMap.get(row.fileName) || []).join("、") || "暂无字典项"}`), ...dictionaryItems.map(row => `${row.type}：${row.label}（${row.value}${row.status === "DISABLED" ? "，已停用" : ""}）`)] },
    { key: "taskCalendarTemplates", title: "日历任务模板", count: calendarTemplates.length, entries: calendarTemplates.map(row => row.name) },
    { key: "tasks", title: "任务模板", count: tasks.length, entries: tasks.map(row => row.title) },
    { key: "assessments", title: "巡店/考核模板", count: assessments.length, entries: assessments.map(row => row.name) },
    { key: "researchTemplates", title: "调研模板", count: researchTemplates.length, entries: researchTemplates.map(row => row.templateType) },
    { key: "businessDataSources", title: "业务数据源", count: sources.length, entries: sources.map(row => `${row.businessName} → ${row.templateNameSnapshot}`) },
    { key: "restDays", title: "休息日管理", count: restDays.length, entries: restDays.map(row => `${row.year} ${row.holidayNameSnapshot}（${row.startDate.toISOString().slice(0, 10)} 至 ${row.endDate.toISOString().slice(0, 10)}）`) },
    { key: "storeLaborStandards", title: "门店用工标准", count: laborStandards.length, entries: laborStandards.map(row => `${row.brandValue} · ${row.assessmentMetric} · ${row.lowerAmount ?? "起始"}–${row.upperAmount ?? "以上"}：${row.standardHeadcount}人`) },
    { key: "r2StorageConfigs", title: "R2 存储空间配置", count: r2Configs.filter(row => !row.deletedAt).length, entries: r2Configs.filter(row => !row.deletedAt).map(row => `${row.name}（${row.bucketName}）`) },
    { key: "systemSettings", title: "系统参数与考勤配置", count: 1, entries: ["平台名称、外观资源、提醒/任务参数、模型端点及品牌考勤时段"] },
  ];
  return { packageVersion: PACKAGE_VERSION, generatedAt: new Date().toISOString(), categories };
}

async function readJsonConfig(filePath: string) {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
}

async function buildPackageData(): Promise<PackageData> {
  const [roles, brands, dataDictionaries, dictionaryItems, taskCalendarTemplates, taskRows, assessmentRows, researchRows, sourceRows, restDays, laborRows, policyRows, r2Rows, platform] = await Promise.all([
    db.role.findMany({ orderBy: { code: "asc" } }),
    db.brand.findMany({ orderBy: { code: "asc" } }),
    db.dataDictionary.findMany({ orderBy: { code: "asc" } }),
    db.dictionaryItem.findMany({ orderBy: [{ type: "asc" }, { sort: "asc" }] }),
    db.taskCalendarTemplate.findMany({ orderBy: { recordNo: "asc" }, include: { dates: { orderBy: { calendarDate: "asc" } } } }),
    db.task.findMany({ where: { deletedAt: null, configFileName: { not: null }, recordNo: { not: null } }, orderBy: { recordNo: "asc" }, include: { executorRoles: { include: { role: { select: { code: true } } } }, executorRole: { select: { code: true } }, brands: { include: { brand: { select: { code: true } } } }, r2Storage: { select: { recordNo: true } }, calendarTemplate: { select: { recordNo: true } } } }),
    db.assessment.findMany({ where: { deletedAt: null }, orderBy: { recordNo: "asc" }, include: { brandScopes: true, r2Storage: { select: { recordNo: true } } } }),
    db.researchTemplate.findMany({ where: { deletedAt: null }, orderBy: { recordNo: "asc" }, include: { brandScopes: true } }),
    db.businessDataSource.findMany({ orderBy: { recordNo: "asc" }, include: { fields: { orderBy: { sortOrder: "asc" } } } }),
    db.restDay.findMany({ orderBy: { recordNo: "asc" } }),
    db.storeLaborStandard.findMany({ orderBy: { recordNo: "asc" } }),
    db.storeLaborStandardPolicyVersion.findMany({ orderBy: [{ brandValue: "asc" }, { version: "asc" }] }),
    db.r2StorageConfig.findMany({ where: { deletedAt: null }, orderBy: { recordNo: "asc" } }),
    getPlatformConfig(),
  ]);
  const r2ById = new Map(r2Rows.map(row => [row.id, row.recordNo]));
  const dictionaryFileNames = [...new Set(dataDictionaries.map(row => safeFileName(row.fileName)))];
  const dictionaryFiles = await Promise.all(dictionaryFileNames.map(async fileName => ({ fileName, contents: await readJsonConfig(path.join(DICTIONARY_DIR, fileName)) })));
  const tasks = await Promise.all(taskRows.map(async row => {
    const configFileName = safeFileName(row.configFileName);
    if (!row.recordNo) throw new Error(`任务模板“${row.title}”缺少记录编号，无法安全导出`);
    return {
      recordNo: row.recordNo, title: row.title, type: row.type, targetType: row.targetType, specifiedTargets: row.specifiedTargets,
      status: row.status, description: row.description, includeCompletionRate: row.includeCompletionRate,
      singleRecordForMultipleExecutors: row.singleRecordForMultipleExecutors,
      executionDays: row.executionDays, weeklyExecutionDay: row.weeklyExecutionDay, monthlyExecutionDay: row.monthlyExecutionDay,
      deadlineDayOffset: row.deadlineDayOffset, deadlineTime: row.deadlineTime, configFileName, submitItems: row.submitItems,
      configVersion: row.configVersion, executorRoleCodes: [...new Set([...row.executorRoles.map(link => link.role.code), ...(row.executorRole ? [row.executorRole.code] : [])])],
      brandCodes: row.brands.map(link => link.brand.code), r2StorageRecordNo: row.r2Storage?.recordNo || null,
      calendarTemplateRecordNo: row.calendarTemplate?.recordNo || null, config: await readTaskConfig(configFileName),
    };
  }));
  const assessments = await Promise.all(assessmentRows.map(async row => ({
    recordNo: row.recordNo, name: row.name, scoreMode: row.scoreMode, configFileName: safeFileName(row.configFileName, 20),
    applicableBrands: row.applicableBrands, photoAttachmentLimit: row.photoAttachmentLimit,
    nonFullScoreRequiresPhoto: row.nonFullScoreRequiresPhoto, failRequiresProblemDescription: row.failRequiresProblemDescription,
    partialRequiresProblemDescription: row.partialRequiresProblemDescription, detailText: row.detailText, sectionCount: row.sectionCount,
    subsectionCount: row.subsectionCount, itemCount: row.itemCount, totalScore: row.totalScore,
    remark: row.remark, status: row.status, configVersion: row.configVersion, r2StorageRecordNo: row.r2Storage.recordNo,
    brandScopes: row.brandScopes.map(scope => ({ brandValue: scope.brandValue, assessmentType: scope.assessmentType, activeKey: scope.activeKey })),
    config: await readJsonConfig(path.join(ASSESSMENT_CONFIG_DIRECTORY, row.configFileName)),
  })));
  const researchTemplates = await Promise.all(researchRows.map(async row => ({
    recordNo: row.recordNo, templateType: row.templateType, configFileName: safeFileName(row.configFileName, 20),
    detailText: row.detailText, itemCount: row.itemCount, remark: row.remark, status: row.status, configVersion: row.configVersion,
    createdByName: row.createdByName, brandValues: row.brandScopes.map(scope => scope.brandValue),
    config: await readJsonConfig(path.join(RESEARCH_CONFIG_DIRECTORY, row.configFileName)),
  })));
  const businessDataSources = sourceRows.map(row => ({
    recordNo: row.recordNo, businessName: row.businessName, sourceType: row.sourceType,
    templateRecordNo: row.templateRecordNoSnapshot, templateNameSnapshot: row.templateNameSnapshot,
    systemSources: row.systemSources, remark: row.remark, version: row.version,
    fields: row.fields.map(field => ({ sourceFieldKey: field.sourceFieldKey, sourceFieldId: field.sourceFieldId, sourceFieldCode: field.sourceFieldCode, fieldNameSnapshot: field.fieldNameSnapshot, sourceFieldType: field.sourceFieldType, sourceFieldConfig: field.sourceFieldConfig, fieldRole: field.fieldRole, fieldType: field.fieldType, unit: field.unit, remark: field.remark, sortOrder: field.sortOrder })),
  }));
  const platformSettings = {
    platformName: platform.platformName, logoDataUrl: platform.logoDataUrl, loginBackgroundDataUrl: platform.loginBackgroundDataUrl,
    courseCoverDataUrl: platform.courseCoverDataUrl, lessonCoverDataUrl: platform.lessonCoverDataUrl,
    automaticTaskExecutionTime: platform.automaticTaskExecutionTime, defaultTaskDeadlineDayOffset: platform.defaultTaskDeadlineDayOffset,
    defaultTaskDeadlineTime: platform.defaultTaskDeadlineTime,
    dailyLearningR2StorageRecordNo: platform.dailyLearningR2StorageId ? r2ById.get(platform.dailyLearningR2StorageId) || null : null,
    trainingVideoR2StorageRecordNo: platform.trainingVideoR2StorageId ? r2ById.get(platform.trainingVideoR2StorageId) || null : null,
    trainingAudioR2StorageRecordNo: platform.trainingAudioR2StorageId ? r2ById.get(platform.trainingAudioR2StorageId) || null : null,
    trainingDocumentR2StorageRecordNo: platform.trainingDocumentR2StorageId ? r2ById.get(platform.trainingDocumentR2StorageId) || null : null,
    aiApiServices: Object.fromEntries(Object.entries(platform.aiApiServices).map(([name, config]) => [name, { selectedModel: config.selectedModel, endpoints: config.endpoints }])),
    contractExpiringWarningDays: platform.contractExpiringWarningDays, birthdayReminderDays: platform.birthdayReminderDays,
    birthdayReminderCalculationTime: platform.birthdayReminderCalculationTime,
  };
  const bandDayHourConfig = await readJsonConfig(DAY_HOUR_CONFIG_PATH).catch(() => []);
  return jsonCopy({
    roles: roles.map(({ id: _id, ...row }) => row),
    brands: brands.map(({ id: _id, createdAt: _createdAt, ...row }) => row),
    dataDictionaries: dataDictionaries.map(({ id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...row }) => row),
    dictionaryItems: dictionaryItems.map(({ id: _id, createdAt: _createdAt, ...row }) => row),
    dictionaryFiles,
    taskCalendarTemplates: taskCalendarTemplates.map(row => ({ recordNo: row.recordNo, name: row.name, remark: row.remark, status: row.status, dates: row.dates.map(date => ({ calendarDate: date.calendarDate, hasTask: date.hasTask, content: date.content, remark: date.remark })) })),
    tasks, assessments, researchTemplates, businessDataSources,
    restDays: restDays.map(({ id: _id, createdByUserId: _creator, updatedByUserId: _updater, ...row }) => row),
    storeLaborStandards: laborRows.map(({ id: _id, createdByUserId: _creator, updatedByUserId: _updater, ...row }) => row),
    laborPolicyVersions: policyRows.map(({ id: _id, createdByUserId: _creator, ...row }) => row),
    r2StorageConfigs: r2Rows.map(row => ({
      recordNo: row.recordNo, name: row.name, accountId: row.accountId,
      accessKeyId: decryptR2Credential(row.accessKeyIdEncrypted), secretAccessKey: decryptR2Credential(row.secretAccessKeyEncrypted),
      bucketName: row.bucketName, endpoint: row.endpoint, signedUrlExpireSeconds: row.signedUrlExpireSeconds,
      status: row.status, version: row.version,
    })),
    platformSettings, bandDayHourConfig,
  }) as PackageData;
}

function requirePassword(password: string) {
  if (typeof password !== "string" || password.length < 12 || password.length > 128) throw new Error("资料包口令须为12至128个字符");
}

export async function createEncryptedDeploymentPackage(password: string) {
  requirePassword(password);
  const data = await buildPackageData();
  const packageObject: DeploymentDataPackage = {
    format: FORMAT, packageVersion: PACKAGE_VERSION,
    source: { appVersion: packageJson.version, deploymentSchemaVersion: DEPLOYMENT_SCHEMA_VERSION, exportedAt: new Date().toISOString() },
    data,
  };
  const salt = randomBytes(16); const iv = randomBytes(12);
  const key = scryptSync(password, salt, 32);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(packageObject), "utf8"), cipher.final()]);
  const envelope = { format: "canyin-system-encrypted-package", packageVersion: PACKAGE_VERSION, kdf: "scrypt", salt: salt.toString("base64url"), iv: iv.toString("base64url"), tag: cipher.getAuthTag().toString("base64url"), data: encrypted.toString("base64url") };
  return Buffer.from(`${JSON.stringify(envelope)}\n`, "utf8");
}

function validatePackage(value: unknown): DeploymentDataPackage {
  if (!isRecord(value) || value.format !== FORMAT || value.packageVersion !== PACKAGE_VERSION || !isRecord(value.source) || !isRecord(value.data)) throw new Error("资料包格式不受支持或文件已损坏");
  const data = value.data as AnyRecord;
  const requiredArrays = ["roles", "brands", "dataDictionaries", "dictionaryItems", "dictionaryFiles", "taskCalendarTemplates", "tasks", "assessments", "researchTemplates", "businessDataSources", "restDays", "storeLaborStandards", "laborPolicyVersions", "r2StorageConfigs"];
  for (const key of requiredArrays) if (!Array.isArray(data[key])) throw new Error(`资料包缺少必要数据：${key}`);
  for (const collection of requiredArrays) if (data[collection].some((item: unknown) => !isRecord(item))) throw new Error(`资料包数据结构异常：${collection}`);
  if (!isRecord(data.platformSettings) || !("bandDayHourConfig" in data)) throw new Error("资料包缺少系统参数配置");
  for (const item of data.tasks) {
    safeFileName(item.configFileName, 30);
    if (!isRecord(item.config)) throw new Error("资料包中有任务模板配置内容异常");
  }
  for (const item of [...data.assessments, ...data.researchTemplates]) {
    safeFileName(item.configFileName, 20);
    if (!isRecord(item.config)) throw new Error("资料包中有模板配置内容异常");
  }
  for (const file of data.dictionaryFiles) {
    safeFileName(file.fileName);
    if (!isRecord(file.contents) || !Array.isArray(file.contents.values) || file.contents.values.some((entry: unknown) => typeof entry !== "string")) throw new Error(`数据字典文件 ${file.fileName} 格式不正确`);
  }
  for (const profile of data.r2StorageConfigs) {
    if (![profile.recordNo, profile.name, profile.accountId, profile.accessKeyId, profile.secretAccessKey, profile.bucketName, profile.endpoint].every((entry: unknown) => typeof entry === "string" && entry.length > 0)) throw new Error("资料包中的 R2 配置不完整");
  }
  return value as DeploymentDataPackage;
}

export function decryptAndValidateDeploymentPackage(buffer: Buffer, password: string) {
  requirePassword(password);
  if (buffer.byteLength > MAX_PACKAGE_BYTES) throw new Error("资料包超过50MB限制");
  let envelope: AnyRecord;
  try { envelope = JSON.parse(buffer.toString("utf8")) as AnyRecord; } catch { throw new Error("无法读取资料包，请确认上传的是导出得到的 .cspkg 文件"); }
  if (!isRecord(envelope) || envelope.format !== "canyin-system-encrypted-package" || envelope.packageVersion !== PACKAGE_VERSION || envelope.kdf !== "scrypt") throw new Error("资料包格式不受支持");
  try {
    const salt = Buffer.from(String(envelope.salt), "base64url"); const iv = Buffer.from(String(envelope.iv), "base64url");
    const tag = Buffer.from(String(envelope.tag), "base64url"); const encrypted = Buffer.from(String(envelope.data), "base64url");
    if (salt.length !== 16 || iv.length !== 12 || tag.length !== 16 || encrypted.length > MAX_PACKAGE_BYTES) throw new Error("invalid envelope");
    const decipher = createDecipheriv("aes-256-gcm", scryptSync(password, salt, 32), iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
    return validatePackage(JSON.parse(plaintext));
  } catch (error) {
    if (error instanceof Error && /资料包/.test(error.message)) throw error;
    throw new Error("资料包口令不正确，或文件校验失败");
  }
}

export function getDeploymentPackagePreview(packageObject: DeploymentDataPackage) {
  return { source: packageObject.source, counts: packageCounts(packageObject.data), excluded: ["用户账号（目标系统由 setup 创建 admin）", "人员档案", "门店及合同", "业务流水、通知、培训课件及操作日志"], includesR2Credentials: true };
}

async function writeJsonFiles(files: Array<{ target: string; value: unknown }>) {
  const snapshots: Array<{ target: string; previous: Buffer | null }> = [];
  const applied: string[] = [];
  const rollback = async () => {
    for (const item of snapshots.slice().reverse()) {
      if (!applied.includes(item.target)) continue;
      if (item.previous === null) await fs.unlink(item.target).catch(() => undefined);
      else {
        const temp = `${item.target}.${randomBytes(6).toString("hex")}.rollback`;
        await fs.writeFile(temp, item.previous, { mode: 0o600 });
        await fs.rename(temp, item.target);
      }
    }
  };
  try {
    for (const file of files) {
      await fs.mkdir(path.dirname(file.target), { recursive: true });
      let previous: Buffer | null = null;
      try { previous = await fs.readFile(file.target); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      snapshots.push({ target: file.target, previous });
      const temporary = `${file.target}.${randomBytes(6).toString("hex")}.tmp`;
      await fs.writeFile(temporary, `${JSON.stringify(file.value, null, 2)}\n`, { mode: 0o600 });
      await fs.rename(temporary, file.target);
      applied.push(file.target);
    }
  } catch (error) { await rollback(); throw error; }
  return rollback;
}

function dateValue(value: unknown) { const date = new Date(String(value)); if (Number.isNaN(date.getTime())) throw new Error("资料包中存在无效日期"); return date; }
function statusValue(value: unknown): RecordStatus { return value === RecordStatus.DISABLED ? RecordStatus.DISABLED : RecordStatus.ENABLED; }

export async function importDeploymentDataPackage(packageObject: DeploymentDataPackage, actor: { userId: string; username: string; realName: string }) {
  const data = packageObject.data;
  const r2IdBySourceRecordNo = new Map<string, string>();
  let importedR2 = 0;
  for (const profile of data.r2StorageConfigs) {
    let target = await db.r2StorageConfig.findFirst({ where: { accountId: profile.accountId, bucketName: profile.bucketName, deletedAt: null }, select: { id: true } });
    if (!target) {
      target = await createR2Config({ name: profile.name, accountId: profile.accountId, accessKeyId: profile.accessKeyId, secretAccessKey: profile.secretAccessKey, bucketName: profile.bucketName, endpoint: profile.endpoint, signedUrlExpireSeconds: Number(profile.signedUrlExpireSeconds), status: statusValue(profile.status) }, actor.userId);
      importedR2 += 1;
    }
    r2IdBySourceRecordNo.set(profile.recordNo, target.id);
  }

  const counts = packageCounts(data);
  const fileWrites: Array<{ target: string; value: unknown }> = [];
  const rollbackFiles: Array<() => Promise<void>> = [];
  try {
    const importResult = await db.$transaction(async tx => {
      const t = tx as any;
      for (const role of data.roles) {
        const existing = await t.role.findUnique({ where: { code: String(role.code) }, select: { id: true } });
        if (String(role.code) === "SUPER_ADMIN") continue;
        const roleData = { name: String(role.name), type: String(role.type || "CUSTOM"), status: statusValue(role.status), permissions: Array.isArray(role.permissions) ? role.permissions : [] };
        if (existing) await t.role.update({ where: { code: String(role.code) }, data: roleData });
        else await t.role.create({ data: { code: String(role.code), ...roleData } });
      }
      const targetRoles = await t.role.findMany({ select: { id: true, code: true, name: true } });
      const roleByCode = new Map<string, AnyRecord>(targetRoles.map((role: AnyRecord) => [role.code, role]));
      for (const role of data.roles) if (!roleByCode.has(String(role.code))) throw new Error(`目标系统缺少模板所需角色：${role.name}`);

      for (const brand of data.brands) {
        const brandData = { name: String(brand.name), status: statusValue(brand.status) };
        await t.brand.upsert({ where: { code: String(brand.code) }, create: { code: String(brand.code), ...brandData }, update: brandData });
      }
      const targetBrands = await t.brand.findMany({ select: { id: true, code: true, name: true } });
      const brandByCode = new Map<string, AnyRecord>(targetBrands.map((brand: AnyRecord) => [brand.code, brand]));

      for (const dictionary of data.dataDictionaries) {
        const dictionaryData = { recordNo: String(dictionary.recordNo), name: String(dictionary.name), fileName: safeFileName(dictionary.fileName), remark: dictionary.remark ?? null, status: statusValue(dictionary.status), version: Number(dictionary.version || 1) };
        await t.dataDictionary.upsert({ where: { code: String(dictionary.code) }, create: { code: String(dictionary.code), ...dictionaryData }, update: dictionaryData });
      }
      for (const item of data.dictionaryItems) {
        const itemData = { label: String(item.label), sort: Number(item.sort || 0), status: statusValue(item.status) };
        await t.dictionaryItem.upsert({ where: { type_value: { type: String(item.type), value: String(item.value) } }, create: { type: String(item.type), value: String(item.value), ...itemData }, update: itemData });
      }

      const calendarIdByRecordNo = new Map<string, string>();
      for (const template of data.taskCalendarTemplates) {
        const dates = (template.dates || []).map((date: AnyRecord) => ({ calendarDate: dateValue(date.calendarDate), hasTask: Boolean(date.hasTask), content: date.content ?? null, remark: date.remark ?? null }));
        const row = await t.taskCalendarTemplate.upsert({
          where: { recordNo: String(template.recordNo) },
          create: { recordNo: String(template.recordNo), name: String(template.name), remark: template.remark ?? null, status: statusValue(template.status), createdByUserId: actor.userId, dates: { create: dates } },
          update: { name: String(template.name), remark: template.remark ?? null, status: statusValue(template.status), dates: { deleteMany: {}, create: dates } },
          select: { id: true },
        });
        calendarIdByRecordNo.set(String(template.recordNo), row.id);
      }

      const taskIdByRecordNo = new Map<string, string>();
      for (const task of data.tasks) {
        const roleIds = [...new Set((task.executorRoleCodes || []).map((code: unknown) => roleByCode.get(String(code))?.id).filter(Boolean))] as string[];
        if (!roleIds.length && task.executorRoleCodes?.length) throw new Error(`任务模板 ${task.title} 引用了不存在的角色`);
        const brandIds = [...new Set((task.brandCodes || []).map((code: unknown) => brandByCode.get(String(code))?.id).filter(Boolean))] as string[];
        if (brandIds.length !== (task.brandCodes || []).length) throw new Error(`任务模板 ${task.title} 引用了不存在的品牌`);
        const r2Id = task.r2StorageRecordNo ? r2IdBySourceRecordNo.get(String(task.r2StorageRecordNo)) : null;
        if (task.r2StorageRecordNo && !r2Id) throw new Error(`任务模板 ${task.title} 引用了未导入的 R2 配置`);
        const calendarTemplateId = task.calendarTemplateRecordNo ? calendarIdByRecordNo.get(String(task.calendarTemplateRecordNo)) : null;
        if (task.calendarTemplateRecordNo && !calendarTemplateId) throw new Error(`任务模板 ${task.title} 引用了未导入的日历任务模板`);
        const scalar = { title: String(task.title), type: task.type, targetType: task.targetType, specifiedTargets: task.specifiedTargets ?? undefined, status: statusValue(task.status), description: task.description ?? null, executorRoleId: roleIds[0] || null, includeCompletionRate: Boolean(task.includeCompletionRate), singleRecordForMultipleExecutors: Boolean(task.singleRecordForMultipleExecutors), executionDays: task.executionDays ?? undefined, weeklyExecutionDay: task.weeklyExecutionDay ?? null, monthlyExecutionDay: task.monthlyExecutionDay ?? null, deadlineDayOffset: Number(task.deadlineDayOffset || 0), deadlineTime: String(task.deadlineTime || "23:59"), configFileName: safeFileName(task.configFileName), submitItems: task.submitItems ?? undefined, configVersion: Number(task.configVersion || 1), r2StorageId: r2Id, calendarTemplateId, createdByUserId: actor.userId };
        const relations = { executorRoles: { deleteMany: {}, create: roleIds.map(roleId => ({ roleId })) }, brands: { deleteMany: {}, create: brandIds.map(brandId => ({ brandId })) } };
        const row = await t.task.upsert({ where: { recordNo: String(task.recordNo) }, create: { recordNo: String(task.recordNo), ...scalar, executorRoles: { create: roleIds.map(roleId => ({ roleId })) }, brands: { create: brandIds.map(brandId => ({ brandId })) } }, update: { ...scalar, ...relations }, select: { id: true } });
        taskIdByRecordNo.set(String(task.recordNo), row.id);
        if (r2Id) await t.r2StorageReference.upsert({ where: { businessType_businessId: { businessType: "TASK", businessId: row.id } }, create: { r2ConfigId: r2Id, businessType: "TASK", businessId: row.id }, update: { r2ConfigId: r2Id } });
      }

      const assessmentIdByRecordNo = new Map<string, string>();
      for (const assessment of data.assessments) {
        const r2Id = r2IdBySourceRecordNo.get(String(assessment.r2StorageRecordNo));
        if (!r2Id) throw new Error(`考核模板 ${assessment.name} 引用了未导入的 R2 配置`);
        const scopes = (assessment.brandScopes || []).map((scope: AnyRecord) => ({ brandValue: String(scope.brandValue), assessmentType: String(scope.assessmentType), activeKey: scope.activeKey ?? null }));
        const scalar = { name: String(assessment.name), scoreMode: assessment.scoreMode, configFileName: safeFileName(assessment.configFileName, 20), applicableBrands: assessment.applicableBrands ?? undefined, r2StorageId: r2Id, photoAttachmentLimit: Number(assessment.photoAttachmentLimit || 3), nonFullScoreRequiresPhoto: Boolean(assessment.nonFullScoreRequiresPhoto), failRequiresProblemDescription: Boolean(assessment.failRequiresProblemDescription), partialRequiresProblemDescription: Boolean(assessment.partialRequiresProblemDescription), detailText: String(assessment.detailText), sectionCount: Number(assessment.sectionCount), subsectionCount: Number(assessment.subsectionCount), itemCount: Number(assessment.itemCount), totalScore: assessment.totalScore, remark: assessment.remark ?? null, status: statusValue(assessment.status), configVersion: Number(assessment.configVersion || 1), createdByUserId: actor.userId };
        const row = await t.assessment.upsert({ where: { recordNo: String(assessment.recordNo) }, create: { recordNo: String(assessment.recordNo), ...scalar, brandScopes: { create: scopes } }, update: { ...scalar, brandScopes: { deleteMany: {}, create: scopes } }, select: { id: true } });
        assessmentIdByRecordNo.set(String(assessment.recordNo), row.id);
        await t.r2StorageReference.upsert({ where: { businessType_businessId: { businessType: "ASSESSMENT_PHOTO_STORAGE", businessId: row.id } }, create: { r2ConfigId: r2Id, businessType: "ASSESSMENT_PHOTO_STORAGE", businessId: row.id }, update: { r2ConfigId: r2Id } });
      }

      const researchIdByRecordNo = new Map<string, string>();
      for (const template of data.researchTemplates) {
        const brandScopes = (template.brandValues || []).map((brandValue: unknown) => ({ brandValue: String(brandValue) }));
        const scalar = { templateType: String(template.templateType), configFileName: safeFileName(template.configFileName, 20), detailText: String(template.detailText), itemCount: Number(template.itemCount), remark: template.remark ?? null, status: statusValue(template.status), configVersion: Number(template.configVersion || 1), createdByUserId: actor.userId, createdByName: actor.realName };
        const row = await t.researchTemplate.upsert({ where: { recordNo: String(template.recordNo) }, create: { recordNo: String(template.recordNo), ...scalar, brandScopes: { create: brandScopes } }, update: { ...scalar, brandScopes: { deleteMany: {}, create: brandScopes } }, select: { id: true } });
        researchIdByRecordNo.set(String(template.recordNo), row.id);
      }

      for (const source of data.businessDataSources) {
        const templateId = source.sourceType === "TASK_TEMPLATE" ? taskIdByRecordNo.get(String(source.templateRecordNo)) : source.sourceType === "ASSESSMENT_TEMPLATE" ? assessmentIdByRecordNo.get(String(source.templateRecordNo)) : source.sourceType === "RESEARCH_TEMPLATE" ? researchIdByRecordNo.get(String(source.templateRecordNo)) : undefined;
        if (!templateId) throw new Error(`业务数据源 ${source.businessName} 引用了未导入的模板 ${source.templateNameSnapshot}`);
        const fields = (source.fields || []).map((field: AnyRecord) => ({ sourceFieldKey: String(field.sourceFieldKey), sourceFieldId: field.sourceFieldId ?? null, sourceFieldCode: field.sourceFieldCode ?? null, fieldNameSnapshot: String(field.fieldNameSnapshot), sourceFieldType: field.sourceFieldType ?? null, sourceFieldConfig: field.sourceFieldConfig ?? undefined, fieldRole: field.fieldRole, fieldType: field.fieldType, unit: field.unit ?? null, remark: field.remark ?? null, sortOrder: Number(field.sortOrder || 0), createdByUserId: actor.userId }));
        const scalar = { businessName: String(source.businessName), sourceType: source.sourceType, templateId, templateRecordNoSnapshot: String(source.templateRecordNo), templateNameSnapshot: String(source.templateNameSnapshot), systemSources: source.systemSources ?? undefined, remark: source.remark ?? null, createdByUserId: actor.userId, createdByUsername: actor.username, createdByNameSnapshot: actor.realName, updatedByUserId: actor.userId, updatedByNameSnapshot: actor.realName, version: Number(source.version || 1) };
        await t.businessDataSource.upsert({ where: { recordNo: String(source.recordNo) }, create: { recordNo: String(source.recordNo), ...scalar, fields: { create: fields } }, update: { ...scalar, fields: { deleteMany: {}, create: fields } } });
      }

      for (const restDay of data.restDays) {
        const scalar = { year: Number(restDay.year), holidayType: restDay.holidayType, holidayNameSnapshot: String(restDay.holidayNameSnapshot), startDate: dateValue(restDay.startDate), endDate: dateValue(restDay.endDate), remark: restDay.remark ?? null, createdByUserId: actor.userId, createdByUsername: actor.username, createdByNameSnapshot: actor.realName, updatedByUserId: actor.userId, updatedByNameSnapshot: actor.realName, version: Number(restDay.version || 1), createdAt: dateValue(restDay.createdAt), updatedAt: dateValue(restDay.updatedAt) };
        await t.restDay.upsert({ where: { recordNo: String(restDay.recordNo) }, create: { recordNo: String(restDay.recordNo), ...scalar }, update: scalar });
      }
      for (const standard of data.storeLaborStandards) {
        const scalar = { brandValue: String(standard.brandValue), assessmentMetric: standard.assessmentMetric, lowerAmount: standard.lowerAmount ?? null, upperAmount: standard.upperAmount ?? null, standardHeadcount: Number(standard.standardHeadcount), remark: standard.remark ?? null, createdByUserId: actor.userId, createdByUsername: actor.username, createdByNameSnapshot: actor.realName, updatedByUserId: actor.userId, updatedByNameSnapshot: actor.realName, version: Number(standard.version || 1), createdAt: dateValue(standard.createdAt), updatedAt: dateValue(standard.updatedAt) };
        await t.storeLaborStandard.upsert({ where: { recordNo: String(standard.recordNo) }, create: { recordNo: String(standard.recordNo), ...scalar }, update: scalar });
      }
      for (const version of data.laborPolicyVersions) {
        await t.storeLaborStandardPolicyVersion.upsert({ where: { brandValue_version: { brandValue: String(version.brandValue), version: Number(version.version) } }, create: { brandValue: String(version.brandValue), version: Number(version.version), assessmentMetric: version.assessmentMetric ?? null, rules: version.rules, createdByUserId: actor.userId, createdByUsername: actor.username, createdByNameSnapshot: actor.realName, createdAt: dateValue(version.createdAt) }, update: { assessmentMetric: version.assessmentMetric ?? null, rules: version.rules, createdByUserId: actor.userId, createdByUsername: actor.username, createdByNameSnapshot: actor.realName } });
      }

      await synchronizeSequences(t, data);

      for (const task of data.tasks) {
        const roleRows = (task.executorRoleCodes || []).map((code: string) => roleByCode.get(code)).filter(Boolean);
        const brandRows = (task.brandCodes || []).map((code: string) => brandByCode.get(code)).filter(Boolean);
        const storageId = task.r2StorageRecordNo ? r2IdBySourceRecordNo.get(String(task.r2StorageRecordNo)) : null;
        const calendarId = task.calendarTemplateRecordNo ? calendarIdByRecordNo.get(String(task.calendarTemplateRecordNo)) : null;
        const config = { ...task.config, recordNo: task.recordNo, executorRoles: roleRows.map((role: AnyRecord) => ({ id: role.id, name: role.name })), executorRole: roleRows[0] ? { id: roleRows[0].id, name: roleRows[0].name } : null, brands: brandRows.map((brand: AnyRecord) => ({ id: brand.id, name: brand.name })), storageSpace: storageId ? { id: storageId, name: data.r2StorageConfigs.find((row: AnyRecord) => row.recordNo === task.r2StorageRecordNo)?.name, bucketName: data.r2StorageConfigs.find((row: AnyRecord) => row.recordNo === task.r2StorageRecordNo)?.bucketName } : null, calendarTemplate: calendarId ? { id: calendarId, recordNo: task.calendarTemplateRecordNo, name: data.taskCalendarTemplates.find((row: AnyRecord) => row.recordNo === task.calendarTemplateRecordNo)?.name } : null };
        fileWrites.push({ target: path.join(TASK_CONFIG_DIR, safeFileName(task.configFileName)), value: config });
      }
      for (const assessment of data.assessments) {
        const storageId = r2IdBySourceRecordNo.get(String(assessment.r2StorageRecordNo));
        const storage = data.r2StorageConfigs.find((row: AnyRecord) => row.recordNo === assessment.r2StorageRecordNo);
        fileWrites.push({ target: path.join(ASSESSMENT_CONFIG_DIRECTORY, safeFileName(assessment.configFileName, 20)), value: { ...assessment.config, recordNo: assessment.recordNo, photoStorage: { id: storageId, name: storage?.name } } });
      }
      for (const template of data.researchTemplates) {
        fileWrites.push({ target: path.join(RESEARCH_CONFIG_DIRECTORY, safeFileName(template.configFileName, 20)), value: { ...template.config, recordNo: template.recordNo, templateType: template.templateType, brands: template.brandValues, status: template.status === "DISABLED" ? "已禁用" : "已启用", statusCode: statusValue(template.status), configVersion: template.configVersion } });
      }
      for (const file of data.dictionaryFiles) fileWrites.push({ target: path.join(DICTIONARY_DIR, safeFileName(file.fileName)), value: file.contents });
      fileWrites.push({ target: DAY_HOUR_CONFIG_PATH, value: data.bandDayHourConfig });
      return { roles: data.roles.length, brands: data.brands.length, templates: data.tasks.length + data.assessments.length + data.researchTemplates.length + data.taskCalendarTemplates.length, businessDataSources: data.businessDataSources.length, restDays: data.restDays.length, storeLaborStandards: data.storeLaborStandards.length };
    }, { maxWait: 10000, timeout: 120000 });

    const platform = data.platformSettings;
    const mappedPlatform: PlatformConfig = {
      platformName: String(platform.platformName || "餐饮运营管理"), logoDataUrl: platform.logoDataUrl ?? null,
      loginBackgroundDataUrl: platform.loginBackgroundDataUrl ?? null, courseCoverDataUrl: platform.courseCoverDataUrl ?? null,
      lessonCoverDataUrl: platform.lessonCoverDataUrl ?? null, automaticTaskExecutionTime: String(platform.automaticTaskExecutionTime || "05:30"),
      defaultTaskDeadlineDayOffset: platform.defaultTaskDeadlineDayOffset === 1 ? 1 : 0,
      defaultTaskDeadlineTime: String(platform.defaultTaskDeadlineTime || "23:59"),
      dailyLearningR2StorageId: platform.dailyLearningR2StorageRecordNo ? r2IdBySourceRecordNo.get(String(platform.dailyLearningR2StorageRecordNo)) || null : null,
      trainingVideoR2StorageId: platform.trainingVideoR2StorageRecordNo ? r2IdBySourceRecordNo.get(String(platform.trainingVideoR2StorageRecordNo)) || null : null,
      trainingAudioR2StorageId: platform.trainingAudioR2StorageRecordNo ? r2IdBySourceRecordNo.get(String(platform.trainingAudioR2StorageRecordNo)) || null : null,
      trainingDocumentR2StorageId: platform.trainingDocumentR2StorageRecordNo ? r2IdBySourceRecordNo.get(String(platform.trainingDocumentR2StorageRecordNo)) || null : null,
      aiApiServices: isRecord(platform.aiApiServices) ? platform.aiApiServices : {},
      contractExpiringWarningDays: Number(platform.contractExpiringWarningDays || 30), birthdayReminderDays: Number(platform.birthdayReminderDays || 7),
      birthdayReminderCalculationTime: String(platform.birthdayReminderCalculationTime || "23:59"),
    };
    const rollback = await writeJsonFiles(fileWrites);
    rollbackFiles.push(rollback);
    await savePlatformConfig(mappedPlatform);
    await txlessOperationLog(actor, importResult);
    return { ...importResult, r2StorageConfigs: importedR2, counts };
  } catch (error) {
    for (const rollback of rollbackFiles.reverse()) await rollback().catch(() => undefined);
    throw error;
  }
}

async function synchronizeSequences(tx: any, data: PackageData) {
  const groups = (rows: AnyRecord[]) => {
    const byDate = new Map<string, number>();
    for (const row of rows) {
      const recordNo = String(row.recordNo || "");
      if (!/^\d{12}$/.test(recordNo)) continue;
      const dateKey = recordNo.slice(0, 8); const value = Number(recordNo.slice(8));
      byDate.set(dateKey, Math.max(byDate.get(dateKey) || 0, value));
    }
    return byDate;
  };
  for (const [dateKey, max] of groups(data.restDays)) {
    const current = await tx.restDaySequence.findUnique({ where: { dateKey } });
    if (!current) await tx.restDaySequence.create({ data: { dateKey, nextValue: max + 1 } });
    else if (current.nextValue <= max) await tx.restDaySequence.update({ where: { dateKey }, data: { nextValue: max + 1 } });
  }
  for (const [dateKey, max] of groups(data.businessDataSources)) {
    const current = await tx.businessDataSourceSequence.findUnique({ where: { dateKey } });
    if (!current) await tx.businessDataSourceSequence.create({ data: { dateKey, nextValue: max + 1 } });
    else if (current.nextValue <= max) await tx.businessDataSourceSequence.update({ where: { dateKey }, data: { nextValue: max + 1 } });
  }
  for (const [dateKey, max] of groups(data.storeLaborStandards)) {
    const current = await tx.storeLaborStandardSequence.findUnique({ where: { dateKey } });
    if (!current) await tx.storeLaborStandardSequence.create({ data: { dateKey, nextValue: max + 1 } });
    else if (current.nextValue <= max) await tx.storeLaborStandardSequence.update({ where: { dateKey }, data: { nextValue: max + 1 } });
  }
}

async function txlessOperationLog(actor: { userId: string; username: string }, result: AnyRecord) {
  const { writeOperationLog } = await import("@/lib/operation-log");
  await writeOperationLog({ userId: actor.userId, username: actor.username, page: "数据导入导出", action: "导入资料包", result: "成功", detail: `角色${result.roles}、品牌${result.brands}、模板${result.templates}、业务数据源${result.businessDataSources}、休息日${result.restDays}、用工标准${result.storeLaborStandards}` }).catch(() => undefined);
}

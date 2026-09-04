import { randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { access, chmod, copyFile, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { CONFIG_SCHEMA_VERSION, DATABASE_SCHEMA_VERSION, DEPLOYMENT_SCHEMA_VERSION, SCHEDULER_AGENT_LABEL, SETUP_HOST, SETUP_PORT, setupInputSchema, type DeploymentState, type SetupInput, WEB_AGENT_LABEL } from "../lib/deployment";
import { installCanyinLaunchAgents, launchAgentStatus } from "../lib/mac-launch-agents";
import { setupPage } from "./setup-page";

const projectDirectory = path.resolve(import.meta.dirname, "..");
const deploymentDirectory = path.join(projectDirectory, "data", "deployment");
const statePath = path.join(deploymentDirectory, "install-state.json");
const pendingPath = path.join(deploymentDirectory, "pending-install.json");
const envPath = path.join(projectDirectory, ".env");
const setupToken = randomBytes(32).toString("base64url");

type PreflightItem = { key: string; label: string; status: "ok" | "warn" | "bad"; detail: string; path?: string };
type JobStep = { id: string; label: string; status: "running" | "success" | "failed"; detail?: string; at: string };
type Job = { id: string; kind: "install" | "repair"; status: "running" | "success" | "failed"; steps: JobStep[]; error?: string; result?: Record<string, unknown>; createdAt: string };

const jobs = new Map<string, Job>();
const jobSecrets = new WeakMap<Job, string[]>();
let activeJobId: string | null = null;

function now() { return new Date().toISOString(); }

async function executable(candidate: string | undefined) {
  if (!candidate) return null;
  try { await access(candidate, constants.X_OK); return candidate; } catch { return null; }
}

async function findBinary(name: "mysql" | "mysqldump", configured?: string) {
  const candidates = [
    configured?.trim(),
    path.join(path.dirname(process.execPath), name),
    `/opt/homebrew/bin/${name}`,
    `/usr/local/bin/${name}`,
    `/usr/bin/${name}`,
    ...(name === "mysqldump" ? ["/opt/homebrew/bin/mariadb-dump", "/usr/local/bin/mariadb-dump"] : []),
  ];
  for (const candidate of candidates) {
    const found = await executable(candidate);
    if (found) return found;
  }
  return null;
}

async function readPackageVersion() {
  const value = JSON.parse(await readFile(path.join(projectDirectory, "package.json"), "utf8")) as { version?: string };
  return value.version || "0.0.0";
}

async function readState(): Promise<DeploymentState | null> {
  try {
    const value = JSON.parse(await readFile(statePath, "utf8")) as DeploymentState;
    if (!value?.schemaVersion || !value?.installId || !value?.appUrl) return null;
    return { ...value, databaseSchemaVersion: value.databaseSchemaVersion || 1, configSchemaVersion: value.configSchemaVersion || 1 };
  } catch { return null; }
}

async function writeState(value: DeploymentState) {
  await mkdir(deploymentDirectory, { recursive: true, mode: 0o700 });
  const temporary = `${statePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, statePath);
  await chmod(statePath, 0o600);
}

type PendingInstall = { installId: string; databaseHost: string; databasePort: number; databaseName: string; databaseUser: string; createdAt: string; allowNonEmptyResume: boolean };

async function readPending(): Promise<PendingInstall | null> {
  try { return JSON.parse(await readFile(pendingPath, "utf8")) as PendingInstall; } catch { return null; }
}

async function writePending(value: PendingInstall) {
  await mkdir(deploymentDirectory, { recursive: true, mode: 0o700 });
  const temporary = `${pendingPath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, pendingPath);
  await chmod(pendingPath, 0o600);
}

async function preflight(): Promise<PreflightItem[]> {
  let configured: Record<string, string> = {};
  try { configured = parseEnvironment(await readFile(envPath, "utf8")); } catch { /* Not installed yet. */ }
  const [mysql, dump, webStatus, schedulerStatus] = await Promise.all([
    findBinary("mysql", process.env.MYSQL_BIN || configured.MYSQL_BIN),
    findBinary("mysqldump", process.env.MYSQLDUMP_BIN || configured.MYSQLDUMP_BIN),
    launchAgentStatus(WEB_AGENT_LABEL).catch(() => ({ loaded: false })),
    launchAgentStatus(SCHEDULER_AGENT_LABEL).catch(() => ({ loaded: false })),
  ]);
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  const protectedDirectory = /\/(Documents|Desktop|Downloads)(\/|$)/.test(projectDirectory);
  return [
    { key: "macos", label: "macOS", status: process.platform === "darwin" ? "ok" : "bad", detail: process.platform === "darwin" ? `${os.release()} · ${os.arch()}` : "只能在macOS上安装LaunchAgent" },
    { key: "node", label: "Node.js", status: nodeMajor >= 20 ? "ok" : "bad", detail: `${process.version} · ${process.execPath}` },
    { key: "build", label: "生产构建", status: existsSync(path.join(projectDirectory, ".next", "BUILD_ID")) ? "ok" : "bad", detail: existsSync(path.join(projectDirectory, ".next", "BUILD_ID")) ? "已找到.next/BUILD_ID" : "请先执行npm run build" },
    { key: "mysql", label: "MySQL客户端", status: mysql ? "ok" : "bad", detail: mysql || "未找到mysql命令", ...(mysql ? { path: mysql } : {}) },
    { key: "mysqldump", label: "数据库备份工具", status: dump ? "ok" : "bad", detail: dump || "未找到mysqldump或mariadb-dump", ...(dump ? { path: dump } : {}) },
    { key: "directory", label: "项目目录", status: protectedDirectory ? "warn" : "ok", detail: protectedDirectory ? "位于macOS隐私保护目录；若后台启动被拦截，请给终端完整磁盘访问权限" : projectDirectory },
    { key: "web-agent", label: "主站服务", status: webStatus.loaded ? "ok" : "warn", detail: webStatus.loaded ? "LaunchAgent已加载" : "尚未安装" },
    { key: "scheduler-agent", label: "统一调度器", status: schedulerStatus.loaded ? "ok" : "warn", detail: schedulerStatus.loaded ? "LaunchAgent已加载" : "尚未安装" },
  ];
}

function portAvailable(port: number) {
  return new Promise<boolean>(resolve => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, SETUP_HOST, () => server.close(() => resolve(true)));
  });
}

function safeMessage(error: unknown, secrets: string[] = []) {
  let message = error instanceof Error ? error.message : String(error || "未知错误");
  for (const secret of secrets.filter(Boolean)) message = message.replaceAll(secret, "[已脱敏]");
  return message.replace(/mysql:\/\/[^\s]+/gi, "mysql://[已脱敏]").slice(0, 4000);
}

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const value = Buffer.from(chunk);
    size += value.length;
    if (size > 128 * 1024) throw new Error("请求内容过大");
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function responseJson(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  response.end(JSON.stringify(value));
}

function databaseUrl(input: SetupInput) {
  const url = new URL("mysql://localhost");
  url.username = input.database.user;
  url.password = input.database.password;
  url.hostname = input.database.host;
  url.port = String(input.database.port);
  url.pathname = `/${input.database.name}`;
  url.searchParams.set("connection_limit", "10");
  return url.toString();
}

function iniValue(value: string) {
  if (/[\r\n]/.test(value)) throw new Error("数据库连接信息包含非法换行符");
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

async function runProcess(input: { command: string; args: string[]; env?: NodeJS.ProcessEnv; stdin?: string | Buffer; timeoutMs?: number; secrets?: string[] }) {
  const child = spawn(input.command, input.args, { cwd: projectDirectory, env: input.env || process.env, stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", chunk => { if (stdout.length < 100_000) stdout += String(chunk); });
  child.stderr.on("data", chunk => { if (stderr.length < 100_000) stderr += String(chunk); });
  if (input.stdin !== undefined) child.stdin.end(input.stdin); else child.stdin.end();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; child.kill("SIGTERM"); }, input.timeoutMs || 5 * 60 * 1000);
  const exitCode = await new Promise<number | null>((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
  clearTimeout(timer);
  if (timedOut) throw new Error("执行超时，已停止当前步骤");
  if (exitCode !== 0) throw new Error(safeMessage(stderr.trim() || stdout.trim() || `命令异常退出（${exitCode ?? "unknown"}）`, input.secrets));
  return stdout.trim();
}

async function mysqlDefaultsFile(directory: string, input: { host: string; port: number; user: string; password: string }, name: string) {
  const target = path.join(directory, name);
  await writeFile(target, `[client]\nhost=${iniValue(input.host)}\nport=${input.port}\nuser=${iniValue(input.user)}\npassword=${iniValue(input.password)}\nprotocol=TCP\n`, { encoding: "utf8", mode: 0o600 });
  await chmod(target, 0o600);
  return target;
}

async function runMysql(executablePath: string, defaultsFile: string, sql: string, database?: string, secret?: string) {
  const args = [`--defaults-extra-file=${defaultsFile}`, "--batch", "--skip-column-names", "--default-character-set=utf8mb4"];
  args.push("--execute", sql);
  if (database) args.push(database);
  return runProcess({ command: executablePath, args, timeoutMs: 60_000, secrets: secret ? [secret] : [] });
}

async function createAndValidateDatabase(input: SetupInput, mysqlPath: string, allowResume: boolean) {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "canyin-setup-mysql-"));
  try {
    const builder = {
      host: input.database.host,
      port: input.database.port,
      user: input.database.adminUser || input.database.user,
      password: input.database.adminUser ? (input.database.adminPassword || "") : input.database.password,
    };
    const builderFile = await mysqlDefaultsFile(temporaryDirectory, builder, "builder.cnf");
    const exists = await runMysql(mysqlPath, builderFile, `SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='${input.database.name}';`, undefined, builder.password);
    if (exists.trim() === "1") {
      const tables = await runMysql(mysqlPath, builderFile, `SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='${input.database.name}';`, undefined, builder.password);
      if (Number(tables.trim()) > 0 && !allowResume) throw new Error(`数据库${input.database.name}不是空库，setup为保护现有数据已停止初始化`);
    } else {
      await runMysql(mysqlPath, builderFile, `CREATE DATABASE \`${input.database.name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`, undefined, builder.password);
    }
    const applicationFile = await mysqlDefaultsFile(temporaryDirectory, input.database, "application.cnf");
    await runMysql(mysqlPath, applicationFile, "SELECT 1;", input.database.name, input.database.password);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

function envQuote(value: string) {
  if (/[\r\n]/.test(value)) throw new Error("配置值包含非法换行符");
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

async function writeEnvironment(input: SetupInput, mysqlPath: string, dumpPath: string, installId: string) {
  let existing = "";
  try { existing = await readFile(envPath, "utf8"); } catch { /* First installation. */ }
  if (existing) {
    const stamp = new Date().toISOString().replaceAll(":", "-");
    await copyFile(envPath, path.join(projectDirectory, `.env.backup-${stamp}`));
  }
  const managed = new Set(["DATABASE_URL", "AUTH_SECRET", "TASK_SCHEDULER_SECRET", "NOTIFICATION_SCHEDULER_SECRET", "R2_CONFIG_ENCRYPTION_KEY", "MYSQL_BIN", "MYSQLDUMP_BIN", "APP_HOST", "APP_PORT", "APP_URL", "SESSION_COOKIE_SECURE", "CANYIN_INSTALL_ID"]);
  const retained = existing.split(/\r?\n/).filter(line => {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=/);
    return !match || !managed.has(match[1]);
  }).join("\n").trim();
  const generated = {
    DATABASE_URL: databaseUrl(input),
    AUTH_SECRET: randomBytes(48).toString("base64url"),
    TASK_SCHEDULER_SECRET: randomBytes(48).toString("base64url"),
    NOTIFICATION_SCHEDULER_SECRET: randomBytes(48).toString("base64url"),
    R2_CONFIG_ENCRYPTION_KEY: randomBytes(48).toString("base64url"),
    MYSQL_BIN: mysqlPath,
    MYSQLDUMP_BIN: dumpPath,
    APP_HOST: SETUP_HOST,
    APP_PORT: String(input.appPort),
    APP_URL: `http://${SETUP_HOST}:${input.appPort}`,
    SESSION_COOKIE_SECURE: "false",
    CANYIN_INSTALL_ID: installId,
  };
  const block = Object.entries(generated).map(([key, value]) => `${key}=${envQuote(value)}`).join("\n");
  const contents = `${retained ? `${retained}\n\n` : ""}# Managed by npm run setup\n${block}\n`;
  const temporary = `${envPath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, contents, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, envPath);
  await chmod(envPath, 0o600);
  return generated;
}

async function testR2(input: SetupInput) {
  const client = new S3Client({
    region: "auto",
    endpoint: input.r2.endpoint,
    credentials: { accessKeyId: input.r2.accessKeyId, secretAccessKey: input.r2.secretAccessKey },
    maxAttempts: 2,
    requestChecksumCalculation: "WHEN_REQUIRED",
  });
  const key = `setup-checks/${randomUUID()}.txt`;
  const contents = `canyin-setup-${randomUUID()}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  let deleted = false;
  try {
    await client.send(new PutObjectCommand({ Bucket: input.r2.bucketName, Key: key, Body: contents, ContentType: "text/plain", IfNoneMatch: "*" }), { abortSignal: controller.signal });
    const [head, downloaded] = await Promise.all([
      client.send(new HeadObjectCommand({ Bucket: input.r2.bucketName, Key: key }), { abortSignal: controller.signal }),
      client.send(new GetObjectCommand({ Bucket: input.r2.bucketName, Key: key }), { abortSignal: controller.signal }),
    ]);
    const actual = await downloaded.Body?.transformToString("utf-8");
    if (actual !== contents || head.ContentLength !== Buffer.byteLength(contents)) throw new Error("R2测试对象读取结果与写入内容不一致");
    await client.send(new DeleteObjectCommand({ Bucket: input.r2.bucketName, Key: key }), { abortSignal: controller.signal });
    deleted = true;
    const origin = `http://${SETUP_HOST}:${input.appPort}`;
    const signedPut = await getSignedUrl(client, new PutObjectCommand({ Bucket: input.r2.bucketName, Key: `setup-checks/cors-${randomUUID()}.txt`, ContentType: "text/plain", IfNoneMatch: "*" }), { expiresIn: 60 });
    const cors = await fetch(signedPut, {
      method: "OPTIONS",
      headers: { Origin: origin, "Access-Control-Request-Method": "PUT", "Access-Control-Request-Headers": "content-type,if-none-match" },
      signal: controller.signal,
    });
    const allowedOrigin = cors.headers.get("access-control-allow-origin") || "";
    const allowedMethods = cors.headers.get("access-control-allow-methods") || "";
    if (!cors.ok || !["*", origin].includes(allowedOrigin) || !allowedMethods.toUpperCase().includes("PUT")) {
      throw new Error(`R2对象读写正常，但Bucket CORS尚未允许${origin}执行PUT；请在Cloudflare中添加该来源后重试`);
    }
  } finally {
    clearTimeout(timeout);
    if (!deleted) await client.send(new DeleteObjectCommand({ Bucket: input.r2.bucketName, Key: key })).catch(() => undefined);
    client.destroy();
  }
}

function parsedJson(output: string) {
  const line = output.split(/\r?\n/).filter(Boolean).at(-1);
  if (!line) throw new Error("步骤未返回验证结果");
  return JSON.parse(line) as Record<string, unknown>;
}

async function waitForHealth(appUrl: string, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  let lastMessage = "主站尚未响应";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${appUrl}/api/health`, { signal: AbortSignal.timeout(4_000), cache: "no-store" });
      const result = await response.json() as { status?: string; database?: boolean };
      if (response.ok && result.status === "ok" && result.database) return result;
      lastMessage = `健康检查返回HTTP ${response.status}`;
    } catch (error) { lastMessage = error instanceof Error ? error.message : lastMessage; }
    await new Promise(resolve => setTimeout(resolve, 1_000));
  }
  throw new Error(`主站启动后未通过健康检查：${lastMessage}`);
}

async function runStep<T>(job: Job, label: string, action: () => Promise<T>, successDetail?: (value: T) => string): Promise<T> {
  const step: JobStep = { id: randomUUID(), label, status: "running", at: now() };
  job.steps.push(step);
  try {
    const result = await action();
    step.status = "success";
    step.at = now();
    if (successDetail) step.detail = successDetail(result);
    return result;
  } catch (error) {
    step.status = "failed";
    step.at = now();
    step.detail = safeMessage(error, jobSecrets.get(job));
    throw error;
  }
}

function runtimeEnvironment(values: Record<string, string>): NodeJS.ProcessEnv {
  return { ...process.env, ...values, NODE_ENV: "production" };
}

async function install(job: Job, input: SetupInput) {
  const secrets = [input.database.password, input.database.adminPassword || "", input.r2.accessKeyId, input.r2.secretAccessKey, input.administrator.password];
  jobSecrets.set(job, secrets);
  let state: DeploymentState | null = null;
  try {
    const previousPending = await readPending();
    const samePendingDatabase = Boolean(previousPending
      && previousPending.databaseHost === input.database.host
      && previousPending.databasePort === input.database.port
      && previousPending.databaseName === input.database.name
      && previousPending.databaseUser === input.database.user);
    const allowResume = Boolean(samePendingDatabase && previousPending?.allowNonEmptyResume);
    const installId = samePendingDatabase && previousPending ? previousPending.installId : randomUUID();
    const appVersion = await readPackageVersion();
    const checks = await runStep(job, "检查Mac、构建文件和运行工具", preflight, value => `${value.filter(item => item.status === "ok").length}/${value.length}项通过`);
    const mysqlPath = checks.find(item => item.key === "mysql")?.path;
    const autoDump = checks.find(item => item.key === "mysqldump")?.path;
    const requestedDump = input.backup.mysqldumpBin ? await executable(input.backup.mysqldumpBin) : null;
    const dumpPath = requestedDump || autoDump;
    const blocking = checks.filter(item => item.status === "bad" && !(item.key === "mysqldump" && requestedDump));
    if (blocking.length) throw new Error(blocking.map(item => `${item.label}：${item.detail}`).join("；"));
    if (!mysqlPath || !dumpPath) throw new Error("MySQL客户端或数据库备份工具不可用");
    if (!(await portAvailable(input.appPort))) throw new Error(`端口${input.appPort}已被其他程序占用，请更换端口后重试`);

    const pending = { installId, databaseHost: input.database.host, databasePort: input.database.port, databaseName: input.database.name, databaseUser: input.database.user, createdAt: samePendingDatabase && previousPending ? previousPending.createdAt : now(), allowNonEmptyResume: allowResume };
    await writePending(pending);
    await runStep(job, "连接MySQL并创建空数据库", () => createAndValidateDatabase(input, mysqlPath, allowResume), () => `${input.database.name} · utf8mb4`);
    pending.allowNonEmptyResume = true;
    await writePending(pending);
    await runStep(job, "测试Cloudflare R2对象权限与浏览器CORS", () => testR2(input), () => `${input.r2.bucketName}读写、删除和CORS正常`);
    const generatedEnv = await runStep(job, "生成本机环境配置和安全密钥", () => writeEnvironment(input, mysqlPath, dumpPath, installId), () => ".env已安全写入（0600）");
    const childEnv = runtimeEnvironment(generatedEnv);
    const prismaCli = path.join(projectDirectory, "node_modules", "prisma", "build", "index.js");
    await runStep(job, "创建最新数据库结构", () => runProcess({ command: process.execPath, args: [prismaCli, "db", "push", "--skip-generate"], env: childEnv, timeoutMs: 10 * 60 * 1000, secrets }), () => "Prisma结构同步完成");
    const migrationOutput = await runStep(job, "建立数据库部署基线", () => runProcess({ command: process.execPath, args: ["--import", "tsx", path.join(projectDirectory, "scripts", "run-deployment-migrations.ts"), "--baseline"], env: childEnv, timeoutMs: 3 * 60 * 1000, secrets }), () => "后续升级将按版本执行");
    parsedJson(migrationOutput);
    const initializedOutput = await runStep(job, "初始化管理员、字典、R2和备份计划", () => runProcess({ command: process.execPath, args: ["--import", "tsx", path.join(projectDirectory, "scripts", "setup-apply.ts")], env: childEnv, stdin: JSON.stringify(input), timeoutMs: 5 * 60 * 1000, secrets }), () => "未写入演示门店、合同或任务");
    const initialized = parsedJson(initializedOutput) as { administratorId: string; r2StorageId: string };
    const verificationOutput = await runStep(job, "生成首份全量备份并上传R2", () => runProcess({ command: process.execPath, args: ["--import", "tsx", path.join(projectDirectory, "scripts", "setup-verify.ts")], env: childEnv, stdin: JSON.stringify(initialized), timeoutMs: 60 * 60 * 1000, secrets }), value => {
      const result = parsedJson(value); return `${String(result.backupFileName || "全量备份成功")}`;
    });
    const verification = parsedJson(verificationOutput);
    state = {
      schemaVersion: DEPLOYMENT_SCHEMA_VERSION,
      databaseSchemaVersion: DATABASE_SCHEMA_VERSION,
      configSchemaVersion: CONFIG_SCHEMA_VERSION,
      installId,
      appVersion,
      databaseName: input.database.name,
      appHost: SETUP_HOST,
      appPort: input.appPort,
      appUrl: `http://${SETUP_HOST}:${input.appPort}`,
      installedAt: now(),
      status: "needs-attention",
      webAgentLabel: WEB_AGENT_LABEL,
      schedulerAgentLabel: SCHEDULER_AGENT_LABEL,
      lastVerification: { database: true, r2: true, backup: true, web: false, scheduler: false },
    };
    await writeState(state);
    await rm(pendingPath, { force: true }).catch(() => undefined);
    const agents = await runStep(job, "安装并启动主站与统一调度器", () => installCanyinLaunchAgents(projectDirectory, input.appPort), value => `主站：${value.web.loaded ? "已加载" : "异常"}；调度器：${value.scheduler.loaded ? "已加载" : "异常"}`);
    if (!agents.web.loaded || !agents.scheduler.loaded) throw new Error("LaunchAgent安装后未能正确加载");
    await runStep(job, "验证主站和数据库健康状态", () => waitForHealth(state!.appUrl), () => "HTTP、Next.js和MySQL均正常");
    state.status = "installed";
    state.lastVerification = { database: true, r2: true, backup: true, web: true, scheduler: true };
    await writeState(state);
    job.status = "success";
    job.result = { appUrl: state.appUrl, backupFileName: verification.backupFileName, appVersion };
  } catch (error) {
    if (state) { state.status = "needs-attention"; await writeState(state).catch(() => undefined); }
    job.status = "failed";
    job.error = safeMessage(error, secrets);
  } finally {
    activeJobId = null;
  }
}

function parseEnvironment(contents: string) {
  const result: Record<string, string> = {};
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2];
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1).replaceAll('\\"', '"').replaceAll("\\\\", "\\");
    result[match[1]] = value;
  }
  return result;
}

async function repair(job: Job, originalState: DeploymentState) {
  let state: DeploymentState = { ...originalState, status: "needs-attention" };
  try {
    const checks = await runStep(job, "检查当前部署环境", preflight, value => `${value.filter(item => item.status !== "bad").length}/${value.length}项可用`);
    const blocking = checks.filter(item => item.status === "bad");
    if (blocking.length) throw new Error(blocking.map(item => `${item.label}：${item.detail}`).join("；"));
    const fileEnv = parseEnvironment(await readFile(envPath, "utf8"));
    jobSecrets.set(job, [fileEnv.DATABASE_URL, fileEnv.AUTH_SECRET, fileEnv.TASK_SCHEDULER_SECRET, fileEnv.NOTIFICATION_SCHEDULER_SECRET, fileEnv.R2_CONFIG_ENCRYPTION_KEY].filter(Boolean));
    const childEnv = runtimeEnvironment(fileEnv);
    const backupOutput = await runStep(job, "升级前创建全量数据库备份", () => runProcess({ command: process.execPath, args: ["--import", "tsx", path.join(projectDirectory, "scripts", "create-deployment-backup.ts")], env: childEnv, timeoutMs: 60 * 60 * 1000 }), value => String(parsedJson(value).backupFileName || "备份完成"));
    parsedJson(backupOutput);
    const migrationOutput = await runStep(job, "执行尚未应用的版本迁移", () => runProcess({ command: process.execPath, args: ["--import", "tsx", path.join(projectDirectory, "scripts", "run-deployment-migrations.ts")], env: childEnv, timeoutMs: 20 * 60 * 1000 }), value => {
      const result = parsedJson(value); return `${Array.isArray(result.applied) ? result.applied.length : 0}个新迁移`;
    });
    parsedJson(migrationOutput);
    await runStep(job, "同步系统权限和必要字典", () => runProcess({ command: process.execPath, args: ["--import", "tsx", path.join(projectDirectory, "scripts", "sync-deployment-reference-data.ts")], env: childEnv, timeoutMs: 5 * 60 * 1000 }), value => {
      const result = parsedJson(value); return `${String(result.dictionaries || 0)}项数据字典`;
    });
    await runStep(job, "校验并升级本地配置文件", () => runProcess({ command: process.execPath, args: ["--import", "tsx", path.join(projectDirectory, "scripts", "sync-deployment-config.ts")], env: childEnv, timeoutMs: 5 * 60 * 1000 }), () => "平台配置和本地JSON均正常");
    const agents = await runStep(job, "重装并重启LaunchAgent", () => installCanyinLaunchAgents(projectDirectory, state.appPort), value => `主站：${value.web.loaded ? "已加载" : "异常"}；调度器：${value.scheduler.loaded ? "已加载" : "异常"}`);
    if (!agents.web.loaded || !agents.scheduler.loaded) throw new Error("LaunchAgent修复后未能正确加载");
    await runStep(job, "验证主站和数据库健康状态", () => waitForHealth(state.appUrl), () => "服务运行正常");
    state = { ...state, schemaVersion: DEPLOYMENT_SCHEMA_VERSION, databaseSchemaVersion: DATABASE_SCHEMA_VERSION, configSchemaVersion: CONFIG_SCHEMA_VERSION, appVersion: await readPackageVersion(), lastRepairedAt: now(), status: "installed", lastVerification: { database: true, r2: true, backup: true, web: true, scheduler: true } };
    await writeState(state);
    job.status = "success";
    job.result = { appUrl: state.appUrl, backupFileName: parsedJson(backupOutput).backupFileName, appVersion: state.appVersion };
  } catch (error) {
    state.status = "needs-attention";
    await writeState(state).catch(() => undefined);
    job.status = "failed";
    job.error = safeMessage(error, jobSecrets.get(job));
  } finally { activeJobId = null; }
}

function createJob(kind: Job["kind"]) {
  if (activeJobId) throw new Error("已有部署任务正在执行，请等待完成");
  const job: Job = { id: randomUUID(), kind, status: "running", steps: [], createdAt: now() };
  jobs.set(job.id, job);
  activeJobId = job.id;
  return job;
}

async function handler(request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url || "/", `http://${SETUP_HOST}:${SETUP_PORT}`);
  if (url.pathname === "/" && request.method === "GET") {
    if (url.searchParams.get("token") !== setupToken) {
      response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
      response.end("setup访问令牌无效，请使用启动终端显示的完整地址。\n");
      return;
    }
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Frame-Options": "DENY", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" });
    response.end(setupPage(setupToken));
    return;
  }
  if (request.headers["x-setup-token"] !== setupToken) { responseJson(response, 403, { message: "setup访问令牌无效，请从启动终端重新打开页面" }); return; }
  try {
    if (url.pathname === "/api/status" && request.method === "GET") {
      const state = await readState();
      responseJson(response, 200, { installed: Boolean(state), state, preflight: await preflight(), appVersion: await readPackageVersion() });
      return;
    }
    if (url.pathname === "/api/install" && request.method === "POST") {
      if (await readState()) { responseJson(response, 409, { message: "当前设备已有安装记录，只能执行升级或修复" }); return; }
      const parsed = setupInputSchema.safeParse(JSON.parse(await readBody(request)));
      if (!parsed.success) { responseJson(response, 400, { message: parsed.error.issues[0]?.message || "安装参数不正确" }); return; }
      const job = createJob("install");
      void install(job, parsed.data);
      responseJson(response, 202, { jobId: job.id });
      return;
    }
    if (url.pathname === "/api/repair" && request.method === "POST") {
      const state = await readState();
      if (!state) { responseJson(response, 409, { message: "未找到安装记录，请先完成首次部署" }); return; }
      const job = createJob("repair");
      void repair(job, state);
      responseJson(response, 202, { jobId: job.id });
      return;
    }
    const jobMatch = url.pathname.match(/^\/api\/jobs\/([A-Za-z0-9-]+)$/);
    if (jobMatch && request.method === "GET") {
      const job = jobs.get(jobMatch[1]);
      if (!job) { responseJson(response, 404, { message: "部署任务不存在或setup服务已经重启" }); return; }
      responseJson(response, 200, job);
      return;
    }
    responseJson(response, 404, { message: "未找到setup接口" });
  } catch (error) {
    responseJson(response, 500, { message: safeMessage(error) });
  }
}

const server = http.createServer((request, response) => { void handler(request, response); });
server.on("error", error => {
  process.stderr.write(`setup服务启动失败：${error.message}\n`);
  process.exitCode = 1;
});
server.listen(SETUP_PORT, SETUP_HOST, () => {
  const url = `http://${SETUP_HOST}:${SETUP_PORT}/?token=${setupToken}`;
  process.stdout.write(`\n餐饮运营管理系统本地部署助手已启动：\n${url}\n\n请保持此终端窗口开启。setup仅监听本机地址，按Control+C可停止。\n`);
  if (process.platform === "darwin" && process.env.CANYIN_SETUP_NO_OPEN !== "1") {
    const child = spawn("/usr/bin/open", [url], { detached: true, stdio: "ignore" });
    child.unref();
  }
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}

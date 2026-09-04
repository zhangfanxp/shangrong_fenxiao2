import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { loadEnvConfig } from "@next/env";
import { DEPLOYMENT_BASELINE_ID } from "../lib/deployment";

type Connection = { host: string; port: string; user: string; password: string; database: string };

function connectionFromEnvironment(): Connection {
  const source = process.env.DATABASE_URL;
  if (!source) throw new Error("缺少DATABASE_URL，无法执行部署迁移");
  const url = new URL(source);
  if (url.protocol !== "mysql:") throw new Error("部署迁移目前只支持MySQL");
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!url.hostname || !url.username || !database) throw new Error("DATABASE_URL缺少数据库连接信息");
  return { host: url.hostname, port: url.port || "3306", user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), database };
}

function iniValue(value: string) {
  if (/[\r\n]/.test(value)) throw new Error("数据库连接信息包含非法换行符");
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function sqlValue(value: string) {
  return `'${value.replaceAll("\\", "\\\\").replaceAll("'", "''")}'`;
}

function findMysql() {
  const configured = process.env.MYSQL_BIN?.trim();
  const candidates = [configured, "/opt/homebrew/bin/mysql", "/usr/local/bin/mysql", "/usr/bin/mysql"].filter((item): item is string => Boolean(item));
  const found = candidates.find(candidate => existsSync(candidate));
  if (!found) throw new Error("未找到mysql命令，请先安装MySQL客户端或设置MYSQL_BIN");
  return found;
}

async function runMysql(executable: string, defaultsFile: string, connection: Connection, options: { sql?: string; file?: string }) {
  const args = [`--defaults-extra-file=${defaultsFile}`, "--batch", "--skip-column-names", "--default-character-set=utf8mb4"];
  if (options.sql) args.push("--execute", options.sql);
  args.push(connection.database);
  const child = spawn(executable, args, { cwd: process.cwd(), stdio: [options.file ? "pipe" : "ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", chunk => { stdout += String(chunk); });
  child.stderr?.on("data", chunk => { if (stderr.length < 20_000) stderr += String(chunk); });
  if (options.file) child.stdin?.end(await readFile(options.file));
  const exitCode = await new Promise<number | null>((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
  if (exitCode !== 0) throw new Error(stderr.trim() || `mysql迁移命令异常退出（${exitCode ?? "unknown"}）`);
  return stdout.trim();
}

async function main() {
  loadEnvConfig(process.cwd());
  const baselineOnly = process.argv.includes("--baseline");
  const connection = connectionFromEnvironment();
  const executable = findMysql();
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "canyin-migrations-"));
  const defaultsFile = path.join(temporaryDirectory, "mysql-client.cnf");
  try {
    await writeFile(defaultsFile, `[client]\nhost=${iniValue(connection.host)}\nport=${connection.port}\nuser=${iniValue(connection.user)}\npassword=${iniValue(connection.password)}\nprotocol=TCP\n`, { mode: 0o600 });
    await chmod(defaultsFile, 0o600);
    await runMysql(executable, defaultsFile, connection, { sql: `
      CREATE TABLE IF NOT EXISTS \`DeploymentMigration\` (
        \`id\` VARCHAR(100) NOT NULL,
        \`checksum\` VARCHAR(64) NOT NULL,
        \`appVersion\` VARCHAR(30) NOT NULL,
        \`description\` VARCHAR(200) NULL,
        \`status\` VARCHAR(20) NOT NULL DEFAULT 'SUCCESS',
        \`startedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`appliedAt\` DATETIME(3) NULL,
        \`error\` TEXT NULL,
        INDEX \`DeploymentMigration_status_startedAt_idx\`(\`status\`, \`startedAt\`),
        PRIMARY KEY (\`id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    ` });

    const packageJson = JSON.parse(await readFile(path.join(process.cwd(), "package.json"), "utf8")) as { version?: string };
    const appVersion = packageJson.version || "0.0.0";
    const schema = await readFile(path.join(process.cwd(), "prisma", "schema.prisma"));
    const baselineChecksum = createHash("sha256").update(schema).digest("hex");
    const existingBaseline = await runMysql(executable, defaultsFile, connection, { sql: `SELECT \`checksum\` FROM \`DeploymentMigration\` WHERE \`id\`=${sqlValue(DEPLOYMENT_BASELINE_ID)} LIMIT 1;` });
    if (!existingBaseline) {
      await runMysql(executable, defaultsFile, connection, { sql: `INSERT INTO \`DeploymentMigration\` (\`id\`, \`checksum\`, \`appVersion\`, \`description\`, \`status\`, \`startedAt\`, \`appliedAt\`) VALUES (${sqlValue(DEPLOYMENT_BASELINE_ID)}, ${sqlValue(baselineChecksum)}, ${sqlValue(appVersion)}, '首次部署数据库基线', 'SUCCESS', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));` });
    }
    const directory = path.join(process.cwd(), "prisma", "deploy-migrations");
    const files = (await readdir(directory)).filter(file => file.endsWith(".sql")).sort();
    if (baselineOnly) {
      const baselined: string[] = [];
      for (const file of files) {
        const id = path.basename(file, ".sql");
        if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw new Error(`迁移文件名不合法：${file}`);
        const checksum = createHash("sha256").update(await readFile(path.join(directory, file))).digest("hex");
        const existing = await runMysql(executable, defaultsFile, connection, { sql: `SELECT CONCAT(\`checksum\`, '\\t', \`status\`) FROM \`DeploymentMigration\` WHERE \`id\`=${sqlValue(id)} LIMIT 1;` });
        if (existing) {
          const [savedChecksum] = existing.split("\t");
          if (savedChecksum !== checksum) throw new Error(`迁移${id}的基线校验值冲突`);
          continue;
        }
        await runMysql(executable, defaultsFile, connection, { sql: `INSERT INTO \`DeploymentMigration\` (\`id\`, \`checksum\`, \`appVersion\`, \`description\`, \`status\`, \`startedAt\`, \`appliedAt\`) VALUES (${sqlValue(id)}, ${sqlValue(checksum)}, ${sqlValue(appVersion)}, ${sqlValue(`${file}（空库基线）`)}, 'SUCCESS', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));` });
        baselined.push(id);
      }
      process.stdout.write(`${JSON.stringify({ baseline: DEPLOYMENT_BASELINE_ID, baselined, applied: [] })}\n`);
      return;
    }
    const applied: string[] = [];
    for (const file of files) {
      const id = path.basename(file, ".sql");
      if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw new Error(`迁移文件名不合法：${file}`);
      const filePath = path.join(directory, file);
      const checksum = createHash("sha256").update(await readFile(filePath)).digest("hex");
      const existing = await runMysql(executable, defaultsFile, connection, { sql: `SELECT CONCAT(\`checksum\`, '\\t', \`status\`) FROM \`DeploymentMigration\` WHERE \`id\`=${sqlValue(id)} LIMIT 1;` });
      if (existing) {
        const [savedChecksum, status] = existing.split("\t");
        if (savedChecksum !== checksum) throw new Error(`迁移${id}已执行但文件校验值发生变化，禁止继续部署`);
        if (status === "SUCCESS") continue;
        throw new Error(`迁移${id}上次执行未成功，请检查数据库后处理`);
      }
      await runMysql(executable, defaultsFile, connection, { sql: `INSERT INTO \`DeploymentMigration\` (\`id\`, \`checksum\`, \`appVersion\`, \`description\`, \`status\`, \`startedAt\`) VALUES (${sqlValue(id)}, ${sqlValue(checksum)}, ${sqlValue(appVersion)}, ${sqlValue(file)}, 'RUNNING', CURRENT_TIMESTAMP(3));` });
      try {
        await runMysql(executable, defaultsFile, connection, { file: filePath });
        await runMysql(executable, defaultsFile, connection, { sql: `UPDATE \`DeploymentMigration\` SET \`status\`='SUCCESS', \`appliedAt\`=CURRENT_TIMESTAMP(3), \`error\`=NULL WHERE \`id\`=${sqlValue(id)};` });
        applied.push(id);
      } catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 2000) : "迁移失败";
        await runMysql(executable, defaultsFile, connection, { sql: `UPDATE \`DeploymentMigration\` SET \`status\`='FAILED', \`error\`=${sqlValue(message)} WHERE \`id\`=${sqlValue(id)};` }).catch(() => undefined);
        throw error;
      }
    }
    process.stdout.write(`${JSON.stringify({ baseline: DEPLOYMENT_BASELINE_ID, applied })}\n`);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : "部署迁移失败"}\n`);
  process.exitCode = 1;
});

import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

type Manifest = {
  deploymentVersion: number;
  databaseSchemaVersion: number;
  databaseSchemaChecksum: string;
  latestMigration: string | null;
  configSchemaVersion: number;
  requiredEnvironment: string[];
};

async function main() {
  const root = process.cwd();
  const manifest = JSON.parse(await readFile(path.join(root, "deployment", "manifest.json"), "utf8")) as Manifest;
  if (!Number.isInteger(manifest.deploymentVersion) || manifest.deploymentVersion < 1) throw new Error("deploymentVersion必须是正整数");
  if (!Number.isInteger(manifest.databaseSchemaVersion) || manifest.databaseSchemaVersion < 1) throw new Error("databaseSchemaVersion必须是正整数");
  if (!Number.isInteger(manifest.configSchemaVersion) || manifest.configSchemaVersion < 1) throw new Error("configSchemaVersion必须是正整数");
  const schema = await readFile(path.join(root, "prisma", "schema.prisma"));
  const checksum = createHash("sha256").update(schema).digest("hex");
  if (checksum !== manifest.databaseSchemaChecksum) {
    throw new Error("prisma/schema.prisma已经变化，但部署清单尚未更新。请新增不可变的prisma/deploy-migrations SQL、递增databaseSchemaVersion，并更新databaseSchemaChecksum与latestMigration。");
  }
  const migrationFiles = (await readdir(path.join(root, "prisma", "deploy-migrations"))).filter(file => file.endsWith(".sql")).sort();
  for (const file of migrationFiles) if (!/^[A-Za-z0-9_-]{1,100}\.sql$/.test(file)) throw new Error(`部署迁移文件名不合法：${file}`);
  if (manifest.databaseSchemaVersion > 1) {
    if (!manifest.latestMigration || !migrationFiles.includes(manifest.latestMigration)) throw new Error("部署清单latestMigration不存在于prisma/deploy-migrations目录");
  } else if (manifest.latestMigration !== null) throw new Error("数据库基线版本的latestMigration必须为null");
  const envExample = await readFile(path.join(root, ".env.example"), "utf8");
  const declared = new Set([...envExample.matchAll(/^([A-Z0-9_]+)=/gm)].map(match => match[1]));
  const missing = manifest.requiredEnvironment.filter(key => !declared.has(key));
  if (missing.length) throw new Error(`.env.example缺少部署清单声明的配置：${missing.join("、")}`);
  process.stdout.write(`${JSON.stringify({ deploymentVersion: manifest.deploymentVersion, databaseSchemaVersion: manifest.databaseSchemaVersion, configSchemaVersion: manifest.configSchemaVersion, migrations: migrationFiles.length })}\n`);
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : "部署契约检查失败"}\n`);
  process.exitCode = 1;
});

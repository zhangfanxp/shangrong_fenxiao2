import { access, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { SYSTEM_DICTIONARIES } from "../lib/deployment";
import { getPlatformConfig, savePlatformConfig } from "../lib/platform-config";

async function main() {
  const directories = [
    "config",
    "Data_Dictionary",
    "data/R2_Bucket",
    "data/logs",
    "data/task-configs",
    "data/review-configs",
    "data/research-configs",
    "data/deployment",
  ];
  for (const directory of directories) await mkdir(path.join(process.cwd(), directory), { recursive: true });
  for (const dictionary of SYSTEM_DICTIONARIES) {
    const target = path.join(process.cwd(), "Data_Dictionary", dictionary.fileName);
    await access(target);
    const document = JSON.parse(await readFile(target, "utf8")) as { values?: unknown };
    if (!Array.isArray(document.values) || document.values.some(value => typeof value !== "string")) throw new Error(`数据字典文件格式异常：${dictionary.fileName}`);
  }
  const platform = await getPlatformConfig();
  await savePlatformConfig(platform);
  process.stdout.write(`${JSON.stringify({ directories: directories.length, dictionaries: SYSTEM_DICTIONARIES.length, platform: true })}\n`);
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : "本地配置同步失败"}\n`);
  process.exitCode = 1;
});

import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

type ConfigEntry = {
  brand?: unknown;
  workdayHours?: unknown;
  品牌?: unknown;
  工作日小时?: unknown;
};

const configPath = () => path.join(process.cwd(), "config", "band_day_hour.config.json");

export class BrandDayHourConfigError extends Error {}

function parseConfig(parsed: unknown) {
  const entries: ConfigEntry[] = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object"
      ? Object.entries(parsed).map(([brand, workdayHours]) => ({ brand, workdayHours }))
      : [];
  return Object.fromEntries(entries.flatMap(entry => {
    const brand = String(entry.brand ?? entry.品牌 ?? "").trim();
    const workdayHours = Number(entry.workdayHours ?? entry.工作日小时);
    return brand && Number.isFinite(workdayHours) && workdayHours > 0 && workdayHours <= 24 ? [[brand, workdayHours]] : [];
  })) as Record<string, number>;
}

async function readConfig() {
  try {
    return parseConfig(JSON.parse(await readFile(configPath(), "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    if (error instanceof SyntaxError) throw new BrandDayHourConfigError("品牌工作日小时配置文件格式异常，请联系系统管理员");
    throw error;
  }
}

export async function getBrandDayHourConfig() {
  try {
    return await readConfig();
  } catch {
    return {};
  }
}

export async function getBrandDayHourEntries() {
  const config = await readConfig();
  return Object.entries(config).map(([brand, workdayHours]) => ({ brand, workdayHours }));
}

let writeQueue: Promise<void> = Promise.resolve();

export async function addBrandDayHour(brand: string, workdayHours: number) {
  const task = writeQueue.then(async () => {
    const config = await readConfig();
    if (Object.prototype.hasOwnProperty.call(config, brand)) throw new BrandDayHourConfigError(`品牌“${brand}”已添加，不可重复添加`);
    const directory = path.dirname(configPath());
    await mkdir(directory, { recursive: true });
    const temporary = path.join(directory, `.band_day_hour.${crypto.randomUUID()}.tmp`);
    const rows = [...Object.entries(config).map(([name, hours]) => ({ 品牌: name, 工作日小时: hours })), { 品牌: brand, 工作日小时: workdayHours }];
    try {
      await writeFile(temporary, `${JSON.stringify(rows, null, 2)}\n`, "utf8");
      await rename(temporary, configPath());
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
    return { brand, workdayHours };
  });
  writeQueue = task.then(() => undefined, () => undefined);
  return task;
}

export async function getConfiguredWorkdayHours(brand: string) {
  const config = await getBrandDayHourConfig();
  return Object.prototype.hasOwnProperty.call(config, brand) ? config[brand] : undefined;
}

import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

type ConfigEntry = {
  brand?: unknown;
  workdayHours?: unknown;
  attendanceStartDayOffset?: unknown;
  attendanceStartTime?: unknown;
  attendanceDeadlineDayOffset?: unknown;
  attendanceDeadlineTime?: unknown;
  品牌?: unknown;
  工作日小时?: unknown;
  考勤开始日期?: unknown;
  考勤开始时间?: unknown;
  考勤截止日期?: unknown;
  考勤截止时间?: unknown;
};

export type AttendanceDayOffset = 0 | 1;
export type AttendanceParameterEntry = {
  brand: string;
  workdayHours: number;
  attendanceStartDayOffset: AttendanceDayOffset;
  attendanceStartTime: string;
  attendanceDeadlineDayOffset: AttendanceDayOffset;
  attendanceDeadlineTime: string;
};

const configPath = () => path.join(process.cwd(), "config", "band_day_hour.config.json");

export class BrandDayHourConfigError extends Error {}

function parseAttendanceTime(rawTimeValue: unknown, rawDayOffset: unknown, defaultTime: string) {
  const rawTime = String(rawTimeValue ?? "").trim();
  const combined = rawTime.match(/^(当日|次日)\s+([01]\d|2[0-3]):[0-5]\d$/);
  const dayOffset: AttendanceDayOffset = combined?.[1] === "次日" || rawDayOffset === 1 || rawDayOffset === "1" || rawDayOffset === "次日" ? 1 : 0;
  const time = combined?.[2] || (/^([01]\d|2[0-3]):[0-5]\d$/.test(rawTime) ? rawTime : defaultTime);
  return { dayOffset, time };
}

function parseConfig(parsed: unknown) {
  const entries: ConfigEntry[] = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object"
      ? Object.entries(parsed).map(([brand, workdayHours]) => ({ brand, workdayHours }))
      : [];
  return Object.fromEntries(entries.flatMap(entry => {
    const brand = String(entry.brand ?? entry.品牌 ?? "").trim();
    const workdayHours = Number(entry.workdayHours ?? entry.工作日小时);
    const start = parseAttendanceTime(entry.attendanceStartTime ?? entry.考勤开始时间, entry.attendanceStartDayOffset ?? entry.考勤开始日期, "20:00");
    const deadline = parseAttendanceTime(entry.attendanceDeadlineTime ?? entry.考勤截止时间, entry.attendanceDeadlineDayOffset ?? entry.考勤截止日期, "23:59");
    const value: AttendanceParameterEntry = {
      brand,
      workdayHours,
      attendanceStartDayOffset: start.dayOffset,
      attendanceStartTime: start.time,
      attendanceDeadlineDayOffset: deadline.dayOffset,
      attendanceDeadlineTime: deadline.time,
    };
    return brand && Number.isFinite(workdayHours) && workdayHours > 0 && workdayHours <= 24 ? [[brand, value]] : [];
  })) as Record<string, AttendanceParameterEntry>;
}

async function readConfig() {
  try {
    return parseConfig(JSON.parse(await readFile(configPath(), "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    if (error instanceof SyntaxError) throw new BrandDayHourConfigError("考勤参数配置文件格式异常，请联系系统管理员");
    throw error;
  }
}

export async function getBrandDayHourConfig() {
  try {
    const config = await readConfig();
    return Object.fromEntries(Object.entries(config).map(([brand, entry]) => [brand, entry.workdayHours]));
  } catch {
    return {};
  }
}

export async function getAttendanceParameterEntries() {
  const config = await readConfig();
  return Object.values(config);
}

let writeQueue: Promise<void> = Promise.resolve();

function serializedRows(config: Record<string, AttendanceParameterEntry>) {
  return Object.values(config).map(entry => ({
    品牌: entry.brand,
    工作日小时: entry.workdayHours,
    考勤开始日期: entry.attendanceStartDayOffset === 1 ? "次日" : "当日",
    考勤开始时间: entry.attendanceStartTime,
    考勤截止日期: entry.attendanceDeadlineDayOffset === 1 ? "次日" : "当日",
    考勤截止时间: entry.attendanceDeadlineTime,
  }));
}

async function writeConfig(config: Record<string, AttendanceParameterEntry>) {
  const directory = path.dirname(configPath());
  await mkdir(directory, { recursive: true });
  const temporary = path.join(directory, `.band_day_hour.${crypto.randomUUID()}.tmp`);
  try {
    await writeFile(temporary, `${JSON.stringify(serializedRows(config), null, 2)}\n`, "utf8");
    await rename(temporary, configPath());
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}

export async function addAttendanceParameter(entry: AttendanceParameterEntry) {
  const task = writeQueue.then(async () => {
    const config = await readConfig();
    if (Object.prototype.hasOwnProperty.call(config, entry.brand)) throw new BrandDayHourConfigError(`品牌“${entry.brand}”已添加，不可重复添加`);
    config[entry.brand] = entry;
    await writeConfig(config);
    return entry;
  });
  writeQueue = task.then(() => undefined, () => undefined);
  return task;
}

export async function updateAttendanceParameter(entry: AttendanceParameterEntry) {
  const task = writeQueue.then(async () => {
    const config = await readConfig();
    if (!Object.prototype.hasOwnProperty.call(config, entry.brand)) throw new BrandDayHourConfigError(`品牌“${entry.brand}”的考勤参数不存在`);
    config[entry.brand] = entry;
    await writeConfig(config);
    return entry;
  });
  writeQueue = task.then(() => undefined, () => undefined);
  return task;
}

export async function getConfiguredWorkdayHours(brand: string) {
  const config = await getBrandDayHourConfig();
  return Object.prototype.hasOwnProperty.call(config, brand) ? config[brand] : undefined;
}

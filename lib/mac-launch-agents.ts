import { existsSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { SCHEDULER_AGENT_LABEL, SETUP_HOST, WEB_AGENT_LABEL } from "@/lib/deployment";

function xml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function array(values: string[]) {
  return `<array>${values.map(value => `<string>${xml(value)}</string>`).join("")}</array>`;
}

function environment(pathValue: string) {
  return `<key>EnvironmentVariables</key><dict><key>NODE_ENV</key><string>production</string><key>PATH</key><string>${xml(pathValue)}</string></dict>`;
}

function plist(input: { label: string; args: string[]; cwd: string; stdout: string; stderr: string; pathValue: string; keepAlive?: boolean; interval?: number }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${xml(input.label)}</string>
<key>ProgramArguments</key>${array(input.args)}
<key>WorkingDirectory</key><string>${xml(input.cwd)}</string>
${environment(input.pathValue)}
<key>RunAtLoad</key><true/>
${input.interval ? `<key>StartInterval</key><integer>${input.interval}</integer>` : ""}
${input.keepAlive ? "<key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict><key>ThrottleInterval</key><integer>10</integer>" : ""}
<key>ProcessType</key><string>Background</string>
<key>StandardOutPath</key><string>${xml(input.stdout)}</string>
<key>StandardErrorPath</key><string>${xml(input.stderr)}</string>
</dict></plist>
`;
}

async function command(executable: string, args: string[], allowFailure = false) {
  const child = spawn(executable, args, { stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", chunk => { output += String(chunk); });
  child.stderr.on("data", chunk => { output += String(chunk); });
  const code = await new Promise<number | null>((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
  if (code !== 0 && !allowFailure) throw new Error(output.trim() || `${path.basename(executable)}执行失败（${code ?? "unknown"}）`);
  return { code, output: output.trim() };
}

async function writeAgent(filePath: string, contents: string) {
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, contents, { encoding: "utf8", mode: 0o644 });
  await rename(temporary, filePath);
  await command("/usr/bin/plutil", ["-lint", filePath]);
}

export async function launchAgentStatus(label: string) {
  const uid = process.getuid?.();
  if (uid === undefined) return { loaded: false, detail: "无法取得当前用户UID" };
  const result = await command("/bin/launchctl", ["print", `gui/${uid}/${label}`], true);
  const state = result.output.match(/\bstate = ([^\n]+)/)?.[1]?.trim();
  const pid = result.output.match(/\bpid = (\d+)/)?.[1];
  return { loaded: result.code === 0, state: state || null, pid: pid ? Number(pid) : null };
}

export function renderCanyinLaunchAgentPlists(projectDirectory: string, appPort: number) {
  // Keep the services on the exact Node binary that passed Setup's version check.
  // A different Homebrew binary may be older than the Node used by npm (for example with nvm).
  const nodePath = process.execPath;
  const nextCli = path.join(projectDirectory, "node_modules", "next", "dist", "bin", "next");
  const tsxCli = path.join(projectDirectory, "node_modules", "tsx", "dist", "cli.mjs");
  const startScript = path.join(projectDirectory, "scripts", "start-production.ts");
  const schedulerScript = path.join(projectDirectory, "scripts", "run-task-scheduler.ts");
  const logDirectory = path.join(projectDirectory, "data", "logs");
  const pathValue = `${path.dirname(nodePath)}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin`;
  return {
    nodePath,
    nextCli,
    tsxCli,
    startScript,
    schedulerScript,
    web: plist({
      label: WEB_AGENT_LABEL,
      args: [nodePath, tsxCli, startScript, "--hostname", SETUP_HOST, "--port", String(appPort)],
      cwd: projectDirectory,
      stdout: path.join(logDirectory, "web.log"),
      stderr: path.join(logDirectory, "web.error.log"),
      pathValue,
      keepAlive: true,
    }),
    scheduler: plist({
      label: SCHEDULER_AGENT_LABEL,
      args: [nodePath, tsxCli, schedulerScript],
      cwd: projectDirectory,
      stdout: path.join(logDirectory, "scheduler.log"),
      stderr: path.join(logDirectory, "scheduler.error.log"),
      pathValue,
      interval: 60,
    }),
  };
}

export async function installCanyinLaunchAgents(projectDirectory: string, appPort: number) {
  if (process.platform !== "darwin") throw new Error("LaunchAgent只能在macOS上安装");
  const documents = renderCanyinLaunchAgentPlists(projectDirectory, appPort);
  for (const required of [documents.nodePath, documents.nextCli, documents.tsxCli, documents.startScript, documents.schedulerScript, path.join(projectDirectory, ".next", "BUILD_ID")]) {
    if (!existsSync(required)) throw new Error(`缺少运行文件：${required}`);
  }

  const home = os.homedir();
  const agentDirectory = path.join(home, "Library", "LaunchAgents");
  const logDirectory = path.join(projectDirectory, "data", "logs");
  await Promise.all([mkdir(agentDirectory, { recursive: true }), mkdir(logDirectory, { recursive: true })]);
  const webFile = path.join(agentDirectory, `${WEB_AGENT_LABEL}.plist`);
  const schedulerFile = path.join(agentDirectory, `${SCHEDULER_AGENT_LABEL}.plist`);
  await writeAgent(webFile, documents.web);
  await writeAgent(schedulerFile, documents.scheduler);

  const uid = process.getuid?.();
  if (uid === undefined) throw new Error("无法取得当前用户UID");
  const legacyLabel = "com.canyin.task-scheduler";
  const legacyFile = path.join(agentDirectory, `${legacyLabel}.plist`);
  await command("/bin/launchctl", ["bootout", `gui/${uid}/${legacyLabel}`], true);
  if (existsSync(legacyFile)) {
    const disabledLegacyFile = existsSync(`${legacyFile}.disabled`) ? `${legacyFile}.disabled.${Date.now()}` : `${legacyFile}.disabled`;
    await rename(legacyFile, disabledLegacyFile);
  }
  for (const [label, file] of [[WEB_AGENT_LABEL, webFile], [SCHEDULER_AGENT_LABEL, schedulerFile]] as const) {
    await command("/bin/launchctl", ["bootout", `gui/${uid}/${label}`], true);
    await command("/bin/launchctl", ["bootstrap", `gui/${uid}`, file]);
    await command("/bin/launchctl", ["enable", `gui/${uid}/${label}`]);
    await command("/bin/launchctl", ["kickstart", "-k", `gui/${uid}/${label}`], label === SCHEDULER_AGENT_LABEL);
  }
  const [web, scheduler] = await Promise.all([launchAgentStatus(WEB_AGENT_LABEL), launchAgentStatus(SCHEDULER_AGENT_LABEL)]);
  return { web, scheduler, files: [webFile, schedulerFile] };
}

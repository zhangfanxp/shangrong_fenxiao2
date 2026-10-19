import { spawn } from "node:child_process";
import path from "node:path";

function run(command: string, args: string[]) {
  return new Promise<number>(resolve => {
    const child = spawn(command, args, { cwd: process.cwd(), env: process.env, stdio: "inherit" });
    let settled = false;
    const finish = (code: number) => {
      if (settled) return;
      settled = true;
      process.off("SIGINT", forwardSigint);
      process.off("SIGTERM", forwardSigterm);
      resolve(code);
    };
    const forwardSigint = () => child.kill("SIGINT");
    const forwardSigterm = () => child.kill("SIGTERM");

    process.once("SIGINT", forwardSigint);
    process.once("SIGTERM", forwardSigterm);
    child.once("error", error => {
      process.stderr.write(`${error.message}\n`);
      finish(1);
    });
    child.once("close", code => finish(code ?? 1));
  });
}

async function main() {
  const projectDirectory = process.cwd();
  const tsxCli = path.join(projectDirectory, "node_modules", "tsx", "dist", "cli.mjs");
  const migrationRunner = path.join(projectDirectory, "scripts", "run-deployment-migrations.ts");
  const nextCli = path.join(projectDirectory, "node_modules", "next", "dist", "bin", "next");

  process.stdout.write("检查并应用待执行的数据库迁移...\n");
  const migrationExitCode = await run(process.execPath, [tsxCli, migrationRunner]);
  if (migrationExitCode !== 0) {
    throw new Error(`数据库迁移失败（退出码 ${migrationExitCode}），为避免应用因数据库结构不匹配而报错，已停止启动。`);
  }

  process.stdout.write("数据库迁移检查完成，正在启动 Next.js...\n");
  process.exitCode = await run(process.execPath, [nextCli, "start", ...process.argv.slice(2)]);
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : "应用启动失败"}\n`);
  process.exitCode = 1;
});

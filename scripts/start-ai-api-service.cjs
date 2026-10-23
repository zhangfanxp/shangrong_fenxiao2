const { spawn } = require("node:child_process");
const path = require("node:path");

const projectDirectory = path.resolve(__dirname, "..");
const services = {
  qwen: {
    directory: path.join(projectDirectory, ".local-ai/services/qwen3-vl-api"),
    model: path.join(projectDirectory, ".local-ai/models/qwen3-vl"),
    environment: { HOST: "127.0.0.1", PORT: "8012" },
  },
  mage: {
    directory: path.join(projectDirectory, ".local-ai/services/mage-vl"),
    model: path.join(projectDirectory, ".local-ai/models/mage-vl"),
    environment: { API_HOST: "127.0.0.1", API_PORT: "8013" },
  },
};

const serviceName = process.argv[2];
const service = services[serviceName];
if (!service) {
  console.error(`Unknown AI service: ${serviceName || "(missing)"}`);
  process.exit(2);
}

const python = path.join(service.directory, ".venv/bin/python");
const child = spawn(python, ["server.py"], {
  cwd: service.directory,
  env: {
    ...process.env,
    ...service.environment,
    MODEL_ID: service.model,
    HF_HOME: path.join(projectDirectory, ".local-ai/hf-cache"),
    HF_HUB_DISABLE_XET: "1",
    PYTHONUNBUFFERED: "1",
  },
  stdio: "inherit",
});

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopping = true;
    child.kill(signal);
    const forceExit = setTimeout(() => child.kill("SIGKILL"), 10_000);
    forceExit.unref();
  });
}

child.on("error", error => {
  console.error(`Unable to start ${serviceName} API: ${error.message}`);
  process.exitCode = 1;
});
child.on("close", (code, signal) => {
  if (stopping) process.exit(0);
  console.error(`${serviceName} API exited (code=${code}, signal=${signal})`);
  process.exit(code ?? 1);
});

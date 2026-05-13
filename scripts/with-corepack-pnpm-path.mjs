import { spawn } from "node:child_process";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const shimDir = join(rootDir, "scripts", "bin");
const [command, ...args] = process.argv.slice(2);

if (!command) {
  console.error("Usage: node scripts/with-corepack-pnpm-path.mjs <command> [...args]");
  process.exit(1);
}

const pathKey =
  Object.keys(process.env).find((key) => key.toLowerCase() === "path") ?? "PATH";
const currentPath = process.env[pathKey] ?? "";
const child = spawn(command, args, {
  cwd: rootDir,
  env: {
    ...process.env,
    [pathKey]: `${shimDir}${delimiter}${currentPath}`
  },
  stdio: "inherit"
});

child.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`${command} exited with signal ${signal}`);
    process.exit(1);
  }

  process.exit(code ?? 0);
});

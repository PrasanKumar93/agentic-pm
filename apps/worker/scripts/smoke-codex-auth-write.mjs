#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");

loadEnvFile(resolve(repoRoot, ".env"));

class SmokeFailure extends Error {
  constructor(reason, message, details = {}) {
    super(message);
    this.reason = reason;
    this.details = details;
  }
}

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const help = hasFlag(args, "--help") || hasFlag(args, "-h");
const json = hasFlag(args, "--json");
const dryRun = hasFlag(args, "--dry-run");
const keepWorkspace = hasFlag(args, "--keep-workspace");
const noGit = hasFlag(args, "--no-git");

if (help) {
  printHelp();
  process.exit(0);
}

const timeoutMs = readPositiveIntegerArg(args, "--timeout-ms", 120000);
const explicitWorkspace = readArg(args, "--workspace");
const workspacePath = explicitWorkspace
  ? resolve(explicitWorkspace)
  : mkdtempSync(join(tmpdir(), "agentic-pm-codex-smoke-"));
const workspaceOwnedByScript = !explicitWorkspace;
const markerFileName =
  readArg(args, "--marker") ?? `codex-write-smoke-${randomUUID().slice(0, 8)}.txt`;
const markerPath = join(workspacePath, markerFileName);
const command = readArg(args, "--command") ?? process.env.CODEX_COMMAND ?? "codex";
const model = readArg(args, "--model") ?? process.env.CODEX_MODEL;
const reasoningEffort =
  readArg(args, "--reasoning-effort") ?? process.env.CODEX_REASONING_EFFORT;
const approvalPolicy =
  readArg(args, "--approval-policy") ??
  process.env.CODEX_APPROVAL_POLICY ??
  process.env.CODEX_ASK_FOR_APPROVAL ??
  "never";
const sandboxMode =
  readArg(args, "--sandbox") ??
  process.env.CODEX_SANDBOX ??
  process.env.CODEX_SANDBOX_MODE ??
  "workspace-write";
const codexArgs = buildCodexArgs({
  args: parseCommandArgs(process.env.CODEX_ARGS, ["exec", "--json", "-"]),
  approvalPolicy,
  model,
  reasoningEffort,
  sandboxMode,
  workspacePath,
});
const auth = readCodexAuth();
const childEnv = { ...process.env };

if (auth.value) {
  childEnv.CODEX_API_KEY = auth.value;
}

const prompt = `This is an Agentic PM write-permission smoke test.

You are in a disposable git workspace that should be writable through Codex workspace-write.

Use the shell tool to run this exact command from the current workspace:
printf 'ok\\n' > ${markerFileName}

Then verify it with:
cat ${markerFileName}

Do not modify any other files. Do not run network commands. If the write command fails, report the exact stderr. You must try the command before concluding the workspace is read-only.`;

const dryRunSummary = {
  ok: true,
  mode: "dry-run",
  auth: publicAuthSummary(auth),
  command,
  args: redactArgs(codexArgs),
  workspacePath,
  markerFileName,
  timeoutMs,
  workspaceOwnedByScript,
};

if (dryRun) {
  printSummary(dryRunSummary);
  cleanupWorkspace();
  process.exit(0);
}

try {
  await mkdir(workspacePath, { recursive: true });
  if (!noGit) {
    await prepareGitWorkspace(workspacePath);
  }

  if (!auth.value) {
    fail("missing_auth", "Neither CODEX_API_KEY nor OPENAI_API_KEY is configured.");
  }

  const result = await runCodex({
    command,
    args: codexArgs,
    env: childEnv,
    prompt,
    timeoutMs,
    workspacePath,
  });
  const markerContent = existsSync(markerPath)
    ? await readFile(markerPath, "utf8")
    : undefined;
  const markerOk = markerContent === "ok\n" || markerContent === "ok";

  if (result.exitCode !== 0) {
    fail(classifyFailure(result), "Codex auth/write smoke failed.", {
      exitCode: result.exitCode,
      signal: result.signal,
      outputTail: outputTail(result),
    });
  }

  if (!markerOk) {
    const reason = classifyFailure(result);
    fail(
      reason === "codex_failed" ? "write_verification_failed" : reason,
      "Codex completed but did not create the expected marker file.",
      {
        markerExists: markerContent !== undefined,
        markerFileName,
        outputTail: outputTail(result),
      },
    );
  }

  printSummary({
    ok: true,
    mode: "live",
    auth: publicAuthSummary(auth),
    command,
    args: redactArgs(codexArgs),
    workspacePath,
    markerFileName,
    exitCode: result.exitCode,
    outputTail: outputTail(result),
  });
  cleanupWorkspace();
} catch (error) {
  if (error instanceof SmokeFailure) {
    printFailure(error);
    cleanupWorkspace(error.reason !== "missing_auth");
    process.exit(1);
  }

  printFailure(
    new SmokeFailure("unexpected_error", error instanceof Error ? error.message : String(error)),
  );
  cleanupWorkspace(false);
  process.exit(1);
}

async function prepareGitWorkspace(targetPath) {
  if (existsSync(join(targetPath, ".git"))) {
    return;
  }

  writeFileSync(join(targetPath, "README.md"), "Codex auth/write smoke workspace\n", "utf8");
  await execFileAsync("git", ["init"], { cwd: targetPath });
  await execFileAsync("git", ["config", "user.email", "codex-smoke@example.com"], {
    cwd: targetPath,
  });
  await execFileAsync("git", ["config", "user.name", "Codex Smoke"], {
    cwd: targetPath,
  });
  await execFileAsync("git", ["add", "README.md"], { cwd: targetPath });
  await execFileAsync("git", ["commit", "-m", "Initial smoke workspace"], {
    cwd: targetPath,
  });
}

function runCodex(input) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(input.command, input.args, {
      cwd: input.workspacePath,
      env: input.env,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      rejectRun(
        new SmokeFailure("timeout", `Codex smoke exceeded ${input.timeoutMs}ms.`),
      );
    }, input.timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      rejectRun(new SmokeFailure("command_failed", error.message));
    });
    child.on("close", (exitCode, signal) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolveRun({
        exitCode,
        signal,
        stdout: sanitizeOutput(stdout),
        stderr: sanitizeOutput(stderr),
      });
    });

    child.stdin.write(input.prompt);
    child.stdin.write("\n");
    child.stdin.end();
  });
}

function buildCodexArgs(input) {
  let output = normalizeCodexArgs(input.args);

  if (!hasOptionArg(output, ["--ask-for-approval", "-a"])) {
    output = insertBeforeExec(output, ["--ask-for-approval", input.approvalPolicy]);
  }

  if (!hasOptionArg(output, ["--sandbox"])) {
    output = insertAfterExec(output, ["--sandbox", input.sandboxMode]);
  }

  if (input.reasoningEffort && !hasConfigOverrideArg(output, "model_reasoning_effort")) {
    output = insertBeforeExec(output, [
      "-c",
      `model_reasoning_effort="${input.reasoningEffort}"`,
    ]);
  }

  const workspaceArgs = [];

  if (!hasOptionArg(output, ["--add-dir"])) {
    workspaceArgs.push("--add-dir", input.workspacePath);
  }

  if (!hasOptionArg(output, ["--cd", "-C"])) {
    workspaceArgs.push("--cd", input.workspacePath);
  }

  if (workspaceArgs.length > 0) {
    output = insertAfterExec(output, workspaceArgs);
  }

  if (input.model && !hasOptionArg(output, ["--model", "-m"])) {
    const execIndex = output.indexOf("exec");
    output =
      execIndex >= 0
        ? [
            ...output.slice(0, execIndex + 1),
            "-m",
            input.model,
            ...output.slice(execIndex + 1),
          ]
        : ["-m", input.model, ...output];
  }

  return output;
}

function insertBeforeExec(args, inserted) {
  const execIndex = args.indexOf("exec");
  if (execIndex < 0) {
    return [...inserted, ...args];
  }
  return [...args.slice(0, execIndex), ...inserted, ...args.slice(execIndex)];
}

function insertAfterExec(args, inserted) {
  const execIndex = args.indexOf("exec");
  if (execIndex < 0) {
    return [...args, ...inserted];
  }
  return [
    ...args.slice(0, execIndex + 1),
    ...inserted,
    ...args.slice(execIndex + 1),
  ];
}

function normalizeCodexArgs(args) {
  const execIndex = args.indexOf("exec");
  if (execIndex < 0) {
    return args;
  }

  const beforeExec = args.slice(0, execIndex);
  const afterExec = args.slice(execIndex + 1);
  const normalizedBeforeExec = [];
  const normalizedAfterExec = [];

  for (let index = 0; index < beforeExec.length; index += 1) {
    const movedApprovalIndex = moveOptionWithValue(
      beforeExec,
      index,
      ["--ask-for-approval", "-a"],
      normalizedBeforeExec,
    );
    if (movedApprovalIndex !== undefined) {
      index = movedApprovalIndex;
      continue;
    }

    const movedExecIndex = moveOptionWithValue(
      beforeExec,
      index,
      ["--sandbox", "--add-dir", "--cd", "-C"],
      normalizedAfterExec,
    );
    if (movedExecIndex !== undefined) {
      index = movedExecIndex;
      continue;
    }

    normalizedBeforeExec.push(beforeExec[index]);
  }

  for (let index = 0; index < afterExec.length; index += 1) {
    const movedApprovalIndex = moveOptionWithValue(
      afterExec,
      index,
      ["--ask-for-approval", "-a"],
      normalizedBeforeExec,
    );
    if (movedApprovalIndex !== undefined) {
      index = movedApprovalIndex;
      continue;
    }

    normalizedAfterExec.push(afterExec[index]);
  }

  return [...normalizedBeforeExec, "exec", ...normalizedAfterExec];
}

function moveOptionWithValue(args, index, names, target) {
  const arg = args[index];
  for (const name of names) {
    if (arg === name) {
      target.push(arg);
      const value = args[index + 1];
      if (value && !value.startsWith("-")) {
        target.push(value);
        return index + 1;
      }
      return index;
    }

    if (arg.startsWith(`${name}=`)) {
      target.push(arg);
      return index;
    }
  }

  return undefined;
}

function hasOptionArg(args, names) {
  return args.some((arg, index) => {
    if (names.includes(arg)) {
      return true;
    }
    return names.some((name) => arg.startsWith(`${name}=`));
  });
}

function hasConfigOverrideArg(args, key) {
  return args.some((arg, index) => {
    if (arg.startsWith(`${key}=`)) {
      return true;
    }
    return arg === "-c" && args[index + 1]?.startsWith(`${key}=`);
  });
}

function parseCommandArgs(value, fallback) {
  if (!value?.trim()) {
    return fallback;
  }

  const parsed = [];
  let current = "";
  let quote;
  let escaped = false;

  for (const char of value) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = undefined;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        parsed.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (escaped) {
    current += "\\";
  }
  if (current) {
    parsed.push(current);
  }

  return parsed.length ? parsed : fallback;
}

function readCodexAuth() {
  const codexApiKey = process.env.CODEX_API_KEY?.trim();
  if (codexApiKey) {
    return {
      configured: true,
      source: "CODEX_API_KEY",
      value: codexApiKey,
      bridged: false,
    };
  }

  const openAiApiKey = process.env.OPENAI_API_KEY?.trim();
  if (openAiApiKey) {
    return {
      configured: true,
      source: "OPENAI_API_KEY",
      value: openAiApiKey,
      bridged: true,
    };
  }

  return {
    configured: false,
    source: undefined,
    value: undefined,
    bridged: false,
  };
}

function publicAuthSummary(auth) {
  return {
    configured: auth.configured,
    source: auth.source,
    bridgedToCodexApiKey: auth.bridged,
  };
}

function classifyFailure(result) {
  const combined = `${result.stderr}\n${result.stdout}`;
  if (/401 Unauthorized|Incorrect API key|invalid api key/i.test(combined)) {
    return "auth_failed";
  }
  if (/model .*not supported|requires a newer version of Codex/i.test(combined)) {
    return "model_unsupported";
  }
  if (/Operation not permitted|read-only|read only|permission denied/i.test(combined)) {
    return "workspace_write_failed";
  }
  return "codex_failed";
}

function outputTail(result) {
  const combined = [result.stderr, result.stdout].filter(Boolean).join("\n");
  return combined.slice(-4000);
}

function sanitizeOutput(value) {
  return value
    .replace(
      /(^|[^A-Za-z0-9])sk-[^\s"']{6,}/g,
      (_match, prefix) => `${prefix}<redacted-api-key>`,
    )
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer <redacted-token>");
}

function redactArgs(args) {
  return args.map((arg) => sanitizeOutput(arg));
}

function fail(reason, message, details = {}) {
  throw new SmokeFailure(reason, message, details);
}

function printFailure(error) {
  const output = {
    ok: false,
    reason: error.reason,
    message: error.message,
    details: error.details,
    workspacePath,
    markerFileName,
    auth: publicAuthSummary(auth),
  };

  if (json) {
    console.error(JSON.stringify(output, null, 2));
    return;
  }

  console.error("Agentic PM Codex auth/write smoke failed");
  console.error(`Reason: ${output.reason}`);
  console.error(`Message: ${output.message}`);
  console.error(`Auth: ${output.auth.source ?? "missing"}`);
  console.error(`Workspace: ${output.workspacePath}`);
  if (output.details?.outputTail) {
    console.error("");
    console.error("Sanitized output tail:");
    console.error(output.details.outputTail);
  }
}

function printSummary(summary) {
  if (json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log("Agentic PM Codex auth/write smoke passed");
  console.log(`Mode: ${summary.mode}`);
  console.log(`Auth: ${summary.auth.source ?? "missing"}`);
  console.log(`Bridged OPENAI_API_KEY: ${summary.auth.bridgedToCodexApiKey}`);
  console.log(`Command: ${summary.command}`);
  console.log(`Args: ${summary.args.join(" ")}`);
  console.log(`Workspace: ${summary.workspacePath}`);
  console.log(`Marker: ${summary.markerFileName}`);
}

function cleanupWorkspace(allowCleanup = true) {
  if (!allowCleanup || keepWorkspace || !workspaceOwnedByScript) {
    return;
  }
  rmSync(workspacePath, { recursive: true, force: true });
}

function loadEnvFile(path) {
  if (!existsSync(path)) {
    return;
  }

  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex < 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    process.env[key] = unquote(trimmed.slice(separatorIndex + 1).trim());
  }
}

function unquote(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function hasFlag(values, name) {
  return values.includes(name);
}

function readArg(values, name) {
  const index = values.indexOf(name);
  if (index < 0) {
    return undefined;
  }
  return values[index + 1];
}

function readPositiveIntegerArg(values, name, fallback) {
  const value = readArg(values, name);
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function printHelp() {
  console.log(`Usage: pnpm smoke:codex-auth-write [-- options]

Runs a secret-safe Codex auth/write smoke:
1. Loads .env without overriding existing process env.
2. Bridges OPENAI_API_KEY to CODEX_API_KEY for the child Codex process.
3. Runs codex exec with workspace-write, --add-dir, and --cd.
4. Verifies Codex can create a marker file in the workspace.

Options:
  --workspace <path>       Existing workspace to test. Defaults to a temp git repo.
  --marker <name>          Marker file name to create.
  --command <path>         Codex command. Defaults to CODEX_COMMAND or codex.
  --model <name>           Override CODEX_MODEL.
  --reasoning-effort <v>   Override CODEX_REASONING_EFFORT.
  --approval-policy <v>    Defaults to CODEX_APPROVAL_POLICY or never.
  --sandbox <mode>         Defaults to CODEX_SANDBOX or workspace-write.
  --timeout-ms <ms>        Defaults to 120000.
  --dry-run                Print redacted command/auth summary without running Codex.
  --json                   Print machine-readable output.
  --keep-workspace         Keep the temp workspace for inspection.
  --no-git                 Do not initialize a git repo for temp workspaces.
  -h, --help               Show this help.
`);
}

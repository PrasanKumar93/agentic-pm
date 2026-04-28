import { ProcessCliRuntime, type ProcessCliPreflightCheck } from "./process-cli.js";

export interface CursorCliRuntimeConfig {
  command?: string;
  args?: string[];
  outputFormat?: "text" | "json" | "stream-json";
  model?: string;
  force?: boolean;
  apiKeyConfigured?: boolean;
  turnTimeoutMs: number;
  stallTimeoutMs?: number;
  cancelGraceMs?: number;
}

export class CursorCliRuntime extends ProcessCliRuntime {
  constructor(config: CursorCliRuntimeConfig) {
    super({
      name: "cursor-cli",
      command: config.command ?? "cursor-agent",
      args: config.args ?? buildCursorArgs(config),
      promptMode: "argument",
      preflightChecks: buildCursorPreflightChecks(config),
      turnTimeoutMs: config.turnTimeoutMs,
      stallTimeoutMs: config.stallTimeoutMs,
      cancelGraceMs: config.cancelGraceMs
    });
  }
}

function buildCursorArgs(config: CursorCliRuntimeConfig): string[] {
  const args = ["--print", "--output-format", config.outputFormat ?? "stream-json"];

  if (config.force) {
    args.push("--force");
  }

  if (config.model) {
    args.push("--model", config.model);
  }

  return args;
}

function buildCursorPreflightChecks(config: CursorCliRuntimeConfig): ProcessCliPreflightCheck[] {
  const checks: ProcessCliPreflightCheck[] = [
    {
      name: "cursor-agent executable",
      args: ["--version"],
      timeoutMs: 5000,
      failureMessage:
        "Cursor Agent CLI is not available. Install it or set CURSOR_COMMAND to the executable path."
    }
  ];

  if (config.apiKeyConfigured) {
    checks.push({
      kind: "static",
      name: "cursor-agent authentication",
      status: "passed",
      message: "CURSOR_API_KEY is configured; Cursor will validate it when the run starts.",
      payload: {
        source: "CURSOR_API_KEY"
      }
    });
    return checks;
  }

  checks.push({
    name: "cursor-agent authentication",
    args: ["status"],
    timeoutMs: 10_000,
    failureMessage: "Cursor Agent CLI is not authenticated. Run cursor-agent login or set CURSOR_API_KEY."
  });

  return checks;
}

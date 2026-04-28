import { ProcessCliRuntime } from "./process-cli.js";

export interface CursorCliRuntimeConfig {
  command?: string;
  args?: string[];
  outputFormat?: "text" | "json" | "stream-json";
  model?: string;
  force?: boolean;
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

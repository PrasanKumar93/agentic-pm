import { ProcessCliRuntime } from "./process-cli.js";

export interface CodexCliRuntimeConfig {
  command: string;
  args: string[];
  turnTimeoutMs: number;
  stallTimeoutMs?: number;
  cancelGraceMs?: number;
}

export class CodexCliRuntime extends ProcessCliRuntime {
  constructor(config: CodexCliRuntimeConfig) {
    super({
      name: "codex-cli",
      command: config.command,
      args: config.args,
      preflightChecks: [
        {
          name: "codex executable",
          args: ["--version"],
          timeoutMs: 5000,
          failureMessage: "Codex CLI is not available. Install it or set CODEX_COMMAND to the executable path."
        }
      ],
      turnTimeoutMs: config.turnTimeoutMs,
      stallTimeoutMs: config.stallTimeoutMs,
      cancelGraceMs: config.cancelGraceMs
    });
  }
}

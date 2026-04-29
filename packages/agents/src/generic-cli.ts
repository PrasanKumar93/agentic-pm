import { ProcessCliRuntime } from "./process-cli.js";

export interface GenericCliRuntimeConfig {
  name?: string;
  command: string;
  args: string[];
  turnTimeoutMs: number;
  stallTimeoutMs?: number;
  cancelGraceMs?: number;
}

export class GenericCliRuntime extends ProcessCliRuntime {
  constructor(config: GenericCliRuntimeConfig) {
    super({
      name: config.name ?? "generic-cli",
      command: config.command,
      args: config.args,
      turnTimeoutMs: config.turnTimeoutMs,
      stallTimeoutMs: config.stallTimeoutMs,
      cancelGraceMs: config.cancelGraceMs
    });
  }
}

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createId } from "@agentic-pm/core";
import type { AgentEvent, AgentRuntime, AgentSession, AgentStartInput } from "./runtime.js";

export interface ProcessCliRuntimeConfig {
  name: string;
  command: string;
  args: string[];
  promptMode?: "stdin" | "argument";
  turnTimeoutMs: number;
  stallTimeoutMs?: number;
  cancelGraceMs?: number;
  env?: NodeJS.ProcessEnv;
}

interface ActiveCliProcess {
  args: string[];
  child: ChildProcessWithoutNullStreams;
  closed: boolean;
  closeEventQueued: boolean;
  cancelReason?: string;
  error?: Error;
  exitCode?: number | null;
  exitSignal?: NodeJS.Signals | null;
  killTimer?: NodeJS.Timeout;
  lastOutputAt: number;
}

export class ProcessCliRuntime implements AgentRuntime {
  readonly name: string;

  private readonly processes = new Map<string, ActiveCliProcess>();

  constructor(private readonly config: ProcessCliRuntimeConfig) {
    this.name = config.name;
  }

  async start(input: AgentStartInput): Promise<AgentSession> {
    const id = createId("agent");
    const args = this.buildArgs(input.prompt);
    const child = spawn(this.config.command, args, {
      cwd: input.workspacePath,
      detached: process.platform !== "win32",
      env: {
        ...process.env,
        ...this.config.env,
        ...input.env
      }
    });

    const active: ActiveCliProcess = {
      args,
      child,
      closed: false,
      closeEventQueued: false,
      lastOutputAt: Date.now()
    };

    child.on("error", (error) => {
      active.error = error;
      active.closed = true;
    });

    child.on("close", (code, signal) => {
      active.closed = true;
      active.closeEventQueued = true;
      active.exitCode = code;
      active.exitSignal = signal;
      if (active.killTimer) {
        clearTimeout(active.killTimer);
      }
    });

    this.processes.set(id, active);

    return {
      id,
      runtime: this.name,
      workspacePath: input.workspacePath
    };
  }

  async *run(session: AgentSession, prompt: string): AsyncIterable<AgentEvent> {
    const active = this.processes.get(session.id);
    if (!active) {
      throw new Error(`Agent session not found: ${session.id}`);
    }

    const child = active.child;
    const queue: AgentEvent[] = [
      {
        type: "session.started",
        message: `${this.name} session started`,
        payload: {
          args: this.redactPromptArg(active.args),
          command: this.config.command,
          pid: child.pid,
          sessionId: session.id
        }
      }
    ];
    let nextHeartbeatAt = Date.now() + 1000;

    child.stdout.on("data", (chunk: Buffer) => {
      active.lastOutputAt = Date.now();
      queue.push({
        type: "stdout",
        message: chunk.toString()
      });
    });

    child.stderr.on("data", (chunk: Buffer) => {
      active.lastOutputAt = Date.now();
      queue.push({
        type: "stderr",
        message: chunk.toString()
      });
    });

    child.stdin.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code !== "EPIPE") {
        active.error = error;
      }
    });

    if (this.config.promptMode !== "argument") {
      child.stdin.write(prompt);
      child.stdin.write("\n");
    }
    child.stdin.end();

    const deadline = Date.now() + this.config.turnTimeoutMs;
    const stallTimeoutMs = this.config.stallTimeoutMs ?? 0;

    try {
      while (!active.closed || queue.length > 0 || active.closeEventQueued) {
        const event = queue.shift();
        if (event) {
          yield event;
          continue;
        }

        if (active.closeEventQueued) {
          active.closeEventQueued = false;
          const succeeded = active.exitCode === 0;
          yield {
            type: succeeded ? "session.completed" : "session.failed",
            message: succeeded
              ? `${this.name} session completed`
              : `${this.name} session failed with exit code ${active.exitCode ?? "unknown"}`,
            payload: {
              cancelReason: active.cancelReason,
              code: active.exitCode,
              signal: active.exitSignal
            }
          };
          continue;
        }

        const now = Date.now();
        if (now > deadline) {
          await this.cancel(session, "turn timeout");
          yield {
            type: "session.failed",
            message: `${this.name} session timed out`,
            payload: {
              timeoutMs: this.config.turnTimeoutMs
            }
          };
          return;
        }

        if (stallTimeoutMs > 0 && now - active.lastOutputAt > stallTimeoutMs) {
          await this.cancel(session, "runtime stalled");
          yield {
            type: "session.failed",
            message: `${this.name} session stalled`,
            payload: {
              stallTimeoutMs
            }
          };
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, 100));
        if (Date.now() >= nextHeartbeatAt) {
          nextHeartbeatAt = Date.now() + 1000;
          yield {
            type: "heartbeat",
            message: `${this.name} session heartbeat`,
            payload: { sessionId: session.id }
          };
        }
      }

      if (active.error) {
        throw active.error;
      }
    } finally {
      this.processes.delete(session.id);
    }
  }

  async cancel(session: AgentSession, reason: string): Promise<void> {
    const active = this.processes.get(session.id);
    if (!active || active.closed) {
      return;
    }

    active.cancelReason = reason;
    this.signalProcess(active.child, "SIGTERM");

    const cancelGraceMs = this.config.cancelGraceMs ?? 5000;
    active.killTimer = setTimeout(() => {
      if (!active.closed) {
        this.signalProcess(active.child, "SIGKILL");
      }
    }, cancelGraceMs);
  }

  private buildArgs(prompt: string): string[] {
    if (this.config.promptMode === "argument") {
      return [...this.config.args, prompt];
    }

    return this.config.args;
  }

  private redactPromptArg(args: string[]): string[] {
    if (this.config.promptMode === "argument") {
      return [...args.slice(0, -1), "<prompt>"];
    }

    return args;
  }

  private signalProcess(child: ChildProcessWithoutNullStreams, signal: NodeJS.Signals): void {
    if (!child.pid) {
      return;
    }

    if (process.platform === "win32") {
      child.kill(signal);
      return;
    }

    try {
      process.kill(-child.pid, signal);
    } catch {
      child.kill(signal);
    }
  }
}

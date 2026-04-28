import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createId } from "@agentic-pm/core";
import type { AgentEvent, AgentRuntime, AgentSession, AgentStartInput } from "./runtime.js";

export interface CodexCliRuntimeConfig {
  command: string;
  args: string[];
  turnTimeoutMs: number;
}

export class CodexCliRuntime implements AgentRuntime {
  readonly name = "codex-cli";

  private readonly processes = new Map<string, ChildProcessWithoutNullStreams>();

  constructor(private readonly config: CodexCliRuntimeConfig) {}

  async start(input: AgentStartInput): Promise<AgentSession> {
    const id = createId("agent");
    const child = spawn(this.config.command, this.config.args, {
      cwd: input.workspacePath,
      env: input.env ?? process.env
    });

    this.processes.set(id, child);

    return {
      id,
      runtime: this.name,
      workspacePath: input.workspacePath
    };
  }

  async *run(session: AgentSession, prompt: string): AsyncIterable<AgentEvent> {
    const child = this.processes.get(session.id);
    if (!child) {
      throw new Error(`Agent session not found: ${session.id}`);
    }

    yield {
      type: "session.started",
      message: "Codex session started",
      payload: { sessionId: session.id }
    };

    child.stdin.write(prompt);
    child.stdin.write("\n");
    child.stdin.end();

    const queue: AgentEvent[] = [];
    let done = false;
    let error: Error | undefined;
    let nextHeartbeatAt = Date.now() + 1000;

    child.stdout.on("data", (chunk: Buffer) => {
      queue.push({
        type: "stdout",
        message: chunk.toString()
      });
    });

    child.stderr.on("data", (chunk: Buffer) => {
      queue.push({
        type: "stderr",
        message: chunk.toString()
      });
    });

    child.on("error", (childError) => {
      error = childError;
      done = true;
    });

    child.on("close", (code) => {
      queue.push({
        type: code === 0 ? "session.completed" : "session.failed",
        message: code === 0 ? "Codex session completed" : `Codex session failed with exit code ${code}`,
        payload: { code }
      });
      done = true;
    });

    const deadline = Date.now() + this.config.turnTimeoutMs;
    while (!done || queue.length > 0) {
      const event = queue.shift();
      if (event) {
        yield event;
        continue;
      }

      if (Date.now() > deadline) {
        await this.cancel(session, "turn timeout");
        yield {
          type: "session.failed",
          message: "Codex session timed out"
        };
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
      if (Date.now() >= nextHeartbeatAt) {
        nextHeartbeatAt = Date.now() + 1000;
        yield {
          type: "heartbeat",
          message: "Codex session heartbeat",
          payload: { sessionId: session.id }
        };
      }
    }

    this.processes.delete(session.id);

    if (error) {
      throw error;
    }
  }

  async cancel(session: AgentSession, reason: string): Promise<void> {
    const child = this.processes.get(session.id);
    if (!child) {
      return;
    }

    child.kill("SIGTERM");
    this.processes.delete(session.id);
    console.warn(`Cancelled ${session.id}: ${reason}`);
  }
}

import { createId } from "@agentic-pm/core";
import type { AgentEvent, AgentRuntime, AgentSession, AgentStartInput } from "./runtime.js";

export class FakeAgentRuntime implements AgentRuntime {
  readonly name = "fake-agent";

  private readonly eventDelayMs = Number(process.env.AGENTIC_PM_FAKE_EVENT_DELAY_MS ?? 0);

  async start(input: AgentStartInput): Promise<AgentSession> {
    return {
      id: createId("agent"),
      runtime: this.name,
      workspacePath: input.workspacePath
    };
  }

  async *run(session: AgentSession, prompt: string): AsyncIterable<AgentEvent> {
    yield {
      type: "session.started",
      message: "Fake agent session started",
      payload: { sessionId: session.id }
    };

    yield* this.waitBetweenEvents(session);

    yield {
      type: "message",
      message: "Received rendered prompt",
      payload: {
        promptPreview: prompt.slice(0, 500)
      }
    };

    yield* this.waitBetweenEvents(session);

    yield {
      type: "session.completed",
      message: "Fake agent session completed"
    };
  }

  async cancel(): Promise<void> {
    return;
  }

  private async *waitBetweenEvents(session: AgentSession): AsyncIterable<AgentEvent> {
    if (!Number.isFinite(this.eventDelayMs) || this.eventDelayMs <= 0) {
      return;
    }

    const deadline = Date.now() + this.eventDelayMs;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(500, deadline - Date.now())));
      yield {
        type: "heartbeat",
        message: "Fake agent heartbeat",
        payload: { sessionId: session.id }
      };
    }
  }
}

import { createId } from "@agentic-pm/core";
import type { AgentEvent, AgentRuntime, AgentSession, AgentStartInput } from "./runtime.js";

export class FakeAgentRuntime implements AgentRuntime {
  readonly name = "fake-agent";

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

    yield {
      type: "message",
      message: "Received rendered prompt",
      payload: {
        promptPreview: prompt.slice(0, 500)
      }
    };

    yield {
      type: "session.completed",
      message: "Fake agent session completed"
    };
  }

  async cancel(): Promise<void> {
    return;
  }
}

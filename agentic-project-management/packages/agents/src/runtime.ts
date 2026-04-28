export type AgentEventType =
  | "session.started"
  | "stdout"
  | "stderr"
  | "message"
  | "heartbeat"
  | "artifact"
  | "session.completed"
  | "session.failed";

export interface AgentStartInput {
  workspacePath: string;
  prompt: string;
  env?: NodeJS.ProcessEnv;
  metadata?: Record<string, unknown>;
}

export interface AgentSession {
  id: string;
  runtime: string;
  workspacePath: string;
}

export interface AgentEvent {
  type: AgentEventType;
  message: string;
  payload?: Record<string, unknown>;
}

export interface AgentRuntime {
  readonly name: string;
  start(input: AgentStartInput): Promise<AgentSession>;
  run(session: AgentSession, prompt: string): AsyncIterable<AgentEvent>;
  cancel(session: AgentSession, reason: string): Promise<void>;
}

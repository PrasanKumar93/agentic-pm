import { ProcessCliRuntime, type ProcessCliPreflightCheck } from "./process-cli.js";
import type { AgentEvent, AgentSession } from "./runtime.js";

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

  override async *run(session: AgentSession, prompt: string): AsyncIterable<AgentEvent> {
    const parser = new CursorStreamJsonParser();

    for await (const event of super.run(session, prompt)) {
      if (event.type === "stdout") {
        yield* parser.push(event.message);
        continue;
      }

      if (event.type === "session.completed" || event.type === "session.failed") {
        yield* parser.flush();
      }

      yield event;
    }
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

class CursorStreamJsonParser {
  private buffer = "";

  *push(chunk: string): Iterable<AgentEvent> {
    this.buffer += chunk;
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() ?? "";

    for (const line of lines) {
      yield* parseCursorStreamJsonLine(line);
    }
  }

  *flush(): Iterable<AgentEvent> {
    if (!this.buffer.trim()) {
      this.buffer = "";
      return;
    }

    const line = this.buffer;
    this.buffer = "";
    yield* parseCursorStreamJsonLine(line);
  }
}

function parseCursorStreamJsonLine(line: string): AgentEvent[] {
  const trimmed = line.trim();
  if (!trimmed) {
    return [];
  }

  const parsed = parseJsonObject(trimmed);
  if (!parsed) {
    return [
      {
        type: "stdout",
        message: line
      }
    ];
  }

  const cursorType = readString(parsed, "type") ?? "event";
  const cursorSubtype = readString(parsed, "subtype");
  const payload = buildCursorPayload(parsed);

  if (cursorType === "assistant") {
    const text = extractCursorText(parsed);
    return [
      {
        type: "message",
        message: text || "Cursor assistant event",
        payload
      }
    ];
  }

  if (cursorType === "result") {
    const result = readString(parsed, "result");
    return [
      {
        type: "message",
        message: result || "Cursor result event",
        payload
      }
    ];
  }

  if (cursorType === "user") {
    return [
      {
        type: "message",
        message: "Cursor user prompt accepted",
        payload: {
          ...payload,
          promptLength: extractCursorText(parsed)?.length
        }
      }
    ];
  }

  if (cursorType === "tool_call") {
    return [
      {
        type: "message",
        message: `Cursor tool call${cursorSubtype ? ` ${cursorSubtype}` : ""}`,
        payload
      }
    ];
  }

  return [
    {
      type: "message",
      message: `Cursor ${cursorType}${cursorSubtype ? ` ${cursorSubtype}` : ""} event`,
      payload
    }
  ];
}

function parseJsonObject(value: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function buildCursorPayload(event: Record<string, unknown>): Record<string, unknown> {
  return {
    cursorSubtype: readString(event, "subtype"),
    cursorType: readString(event, "type"),
    durationApiMs: readNumber(event, "duration_api_ms"),
    durationMs: readNumber(event, "duration_ms"),
    isError: readBooleanField(event, "is_error"),
    model: readString(event, "model"),
    permissionMode: readString(event, "permissionMode"),
    provider: "cursor",
    requestId: readString(event, "request_id"),
    sessionId: readString(event, "session_id"),
    toolName: extractToolName(event)
  };
}

function extractCursorText(event: Record<string, unknown>): string | undefined {
  const directResult = readString(event, "result");
  if (directResult) {
    return directResult;
  }

  const delta = readString(event, "delta");
  if (delta) {
    return delta;
  }

  const message = event.message;
  if (!isRecord(message)) {
    return undefined;
  }

  const directContent = readString(message, "content");
  if (directContent) {
    return directContent;
  }

  const content = message.content;
  if (!Array.isArray(content)) {
    return undefined;
  }

  const text = content
    .map((item) => (isRecord(item) ? readString(item, "text") : undefined))
    .filter((item): item is string => Boolean(item))
    .join("");

  return text || undefined;
}

function extractToolName(event: Record<string, unknown>): string | undefined {
  const directName = readString(event, "name") ?? readString(event, "tool_name");
  if (directName) {
    return directName;
  }

  const tool = event.tool;
  return isRecord(tool) ? readString(tool, "name") : undefined;
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function readNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" ? value : undefined;
}

function readBooleanField(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === "boolean" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

import { ProcessCliRuntime, type ProcessCliPreflightCheck } from "./process-cli.js";
import type { AgentEvent, AgentSession } from "./runtime.js";

export interface CodexCliRuntimeConfig {
  command: string;
  args: string[];
  apiKeyConfigured?: boolean;
  apiKeyEnv?: NodeJS.ProcessEnv;
  apiKeySource?: string;
  approvalPolicy?: string;
  model?: string;
  reasoningEffort?: string;
  sandboxMode?: string;
  skipGitRepoCheck?: boolean;
  turnTimeoutMs: number;
  stallTimeoutMs?: number;
  cancelGraceMs?: number;
}

export class CodexCliRuntime extends ProcessCliRuntime {
  constructor(config: CodexCliRuntimeConfig) {
    const args = buildCodexArgs(config);
    super({
      name: "codex-cli",
      command: config.command,
      args,
      argsForInput: (input) =>
        ensureCodexWorkspaceArg(args, input.workspacePath),
      preflightChecks: buildCodexPreflightChecks(config),
      env: config.apiKeyEnv,
      turnTimeoutMs: config.turnTimeoutMs,
      stallTimeoutMs: config.stallTimeoutMs,
      cancelGraceMs: config.cancelGraceMs
    });
  }

  override async *run(session: AgentSession, prompt: string): AsyncIterable<AgentEvent> {
    const parser = new CodexJsonLineParser();

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

export function ensureCodexWorkspaceArg(
  args: string[],
  workspacePath: string,
): string[] {
  let normalizedArgs = normalizeCodexArgs(args);
  const workspaceArgs: string[] = [];

  if (!hasAddDirArg(normalizedArgs)) {
    workspaceArgs.push(
      "--add-dir",
      workspacePath,
    );
  }

  if (!hasCdArg(normalizedArgs)) {
    workspaceArgs.push("--cd", workspacePath);
  }

  if (workspaceArgs.length > 0) {
    normalizedArgs = insertAfterExec(normalizedArgs, workspaceArgs);
  }

  return normalizedArgs;
}

export function buildCodexArgs(config: CodexCliRuntimeConfig): string[] {
  let normalizedArgs = normalizeCodexArgs(config.args);

  if (
    config.approvalPolicy &&
    !hasOptionArg(normalizedArgs, ["--ask-for-approval", "-a"])
  ) {
    normalizedArgs = insertBeforeExec(normalizedArgs, [
      "--ask-for-approval",
      config.approvalPolicy
    ]);
  }

  if (config.sandboxMode && !hasOptionArg(normalizedArgs, ["--sandbox"])) {
    normalizedArgs = insertAfterExec(normalizedArgs, [
      "--sandbox",
      config.sandboxMode
    ]);
  }

  if (
    config.skipGitRepoCheck &&
    !hasFlagArg(normalizedArgs, "--skip-git-repo-check")
  ) {
    normalizedArgs = insertAfterExec(normalizedArgs, ["--skip-git-repo-check"]);
  }

  if (
    config.reasoningEffort &&
    !hasConfigOverrideArg(normalizedArgs, "model_reasoning_effort")
  ) {
    normalizedArgs = insertBeforeExec(normalizedArgs, [
      "-c",
      `model_reasoning_effort="${config.reasoningEffort}"`
    ]);
  }

  if (!config.model || hasModelArg(normalizedArgs)) {
    return normalizedArgs;
  }

  const execIndex = normalizedArgs.indexOf("exec");
  if (execIndex < 0) {
    return ["-m", config.model, ...normalizedArgs];
  }

  return [...normalizedArgs.slice(0, execIndex + 1), "-m", config.model, ...normalizedArgs.slice(execIndex + 1)];
}

function insertBeforeExec(args: string[], inserted: string[]): string[] {
  const execIndex = args.indexOf("exec");
  if (execIndex < 0) {
    return [...inserted, ...args];
  }

  return [...args.slice(0, execIndex), ...inserted, ...args.slice(execIndex)];
}

function insertAfterExec(args: string[], inserted: string[]): string[] {
  const execIndex = args.indexOf("exec");
  if (execIndex < 0) {
    return [...args, ...inserted];
  }

  return [
    ...args.slice(0, execIndex + 1),
    ...inserted,
    ...args.slice(execIndex + 1)
  ];
}

function normalizeCodexArgs(args: string[]): string[] {
  const execIndex = args.indexOf("exec");
  if (execIndex < 0) {
    return args;
  }

  const beforeExec = args.slice(0, execIndex);
  const afterExec = args.slice(execIndex + 1);
  const normalizedBeforeExec: string[] = [];
  const normalizedAfterExec: string[] = [];

  for (let index = 0; index < beforeExec.length; index += 1) {
    const arg = beforeExec[index];
    const movedApprovalIndex = moveOptionWithValue({
      args: beforeExec,
      index,
      names: ["--ask-for-approval", "-a"],
      target: normalizedBeforeExec,
    });
    if (movedApprovalIndex !== undefined) {
      index = movedApprovalIndex;
      continue;
    }

    const movedExecIndex = moveOptionWithValue({
      args: beforeExec,
      index,
      names: ["--sandbox", "--add-dir", "--cd", "-C"],
      target: normalizedAfterExec,
    });
    if (movedExecIndex !== undefined) {
      index = movedExecIndex;
      continue;
    }

    normalizedBeforeExec.push(arg);
  }

  for (let index = 0; index < afterExec.length; index += 1) {
    const arg = afterExec[index];
    const movedApprovalIndex = moveOptionWithValue({
      args: afterExec,
      index,
      names: ["--ask-for-approval", "-a"],
      target: normalizedBeforeExec,
    });
    if (movedApprovalIndex !== undefined) {
      index = movedApprovalIndex;
      continue;
    }

    normalizedAfterExec.push(arg);
  }

  return [...normalizedBeforeExec, "exec", ...normalizedAfterExec];
}

function moveOptionWithValue(input: {
  args: string[];
  index: number;
  names: string[];
  target: string[];
}): number | undefined {
  const arg = input.args[input.index];
  for (const name of input.names) {
    if (arg === name) {
      input.target.push(arg);
      const value = input.args[input.index + 1];
      if (value && !value.startsWith("-")) {
        input.target.push(value);
        return input.index + 1;
      }
      return input.index;
    }

    if (arg.startsWith(`${name}=`)) {
      input.target.push(arg);
      return input.index;
    }
  }

  return undefined;
}

function hasModelArg(args: string[]): boolean {
  return hasOptionArg(args, ["-m", "--model"]);
}

function hasCdArg(args: string[]): boolean {
  return hasOptionArg(args, ["-C", "--cd"]);
}

function hasAddDirArg(args: string[]): boolean {
  return hasOptionArg(args, ["--add-dir"]);
}

function hasConfigOverrideArg(args: string[], key: string): boolean {
  return args.some((arg, index) => {
    if (arg.startsWith(`${key}=`)) {
      return true;
    }

    const previousArg = args[index - 1];
    return (
      (previousArg === "-c" || previousArg === "--config") &&
      arg.startsWith(`${key}=`)
    );
  });
}

function hasOptionArg(args: string[], names: string[]): boolean {
  return args.some((arg) =>
    names.some((name) => arg === name || arg.startsWith(`${name}=`)),
  );
}

function hasFlagArg(args: string[], name: string): boolean {
  return args.includes(name);
}

function readOptionValue(
  args: string[],
  names: string[],
): string | undefined {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    for (const name of names) {
      if (arg === name) {
        return args[index + 1];
      }

      if (arg.startsWith(`${name}=`)) {
        return arg.slice(name.length + 1);
      }
    }
  }

  return undefined;
}

function buildCodexPreflightChecks(config: CodexCliRuntimeConfig): ProcessCliPreflightCheck[] {
  const args = buildCodexArgs(config);
  const checks: ProcessCliPreflightCheck[] = [
    {
      name: "codex executable",
      args: ["--version"],
      timeoutMs: 5000,
      failureMessage: "Codex CLI is not available. Install it or set CODEX_COMMAND to the executable path."
    },
    {
      name: "codex exec json support",
      args: ["exec", "--help"],
      includeOutput: false,
      timeoutMs: 5000,
      failureMessage: "Codex CLI does not expose the noninteractive exec command required by Symphony."
    },
    {
      kind: "static" as const,
      name: "codex execution policy",
      status: "passed" as const,
      message: "Codex CLI run policy is configured for headless workspace execution.",
      payload: {
        approvalPolicy: readOptionValue(args, ["--ask-for-approval", "-a"]),
        sandboxMode: readOptionValue(args, ["--sandbox"]),
        skipGitRepoCheck: hasFlagArg(args, "--skip-git-repo-check")
      }
    }
  ];

  if (config.apiKeyConfigured) {
    checks.push({
      kind: "static" as const,
      name: "codex authentication",
      status: "passed" as const,
      message: `${config.apiKeySource ?? "CODEX_API_KEY"} is configured; Codex will validate it when the run starts.`,
      payload: {
        source: config.apiKeySource ?? "CODEX_API_KEY"
      }
    });
    return checks;
  }

  checks.push({
    name: "codex authentication",
    args: ["login", "status"],
    includeOutput: false,
    timeoutMs: 5000,
    failureMessage: "Codex CLI is not authenticated. Run codex login or set CODEX_API_KEY."
  });

  return checks;
}

class CodexJsonLineParser {
  private buffer = "";

  *push(chunk: string): Iterable<AgentEvent> {
    this.buffer += chunk;
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() ?? "";

    for (const line of lines) {
      yield* parseCodexJsonLine(line);
    }
  }

  *flush(): Iterable<AgentEvent> {
    if (!this.buffer.trim()) {
      this.buffer = "";
      return;
    }

    const line = this.buffer;
    this.buffer = "";
    yield* parseCodexJsonLine(line);
  }
}

function parseCodexJsonLine(line: string): AgentEvent[] {
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

  const codexType = readString(parsed, "type") ?? "event";
  const payload = buildCodexPayload(parsed);
  const role = readString(parsed, "role") ?? readNestedString(parsed, ["item", "role"]);
  const itemType = readNestedString(parsed, ["item", "type"]);

  if (role === "user" || itemType === "user_message" || codexType.includes("user")) {
    return [
      {
        type: "message",
        message: "Codex user prompt accepted",
        payload: {
          ...payload,
          promptLength: extractCodexText(parsed)?.length
        }
      }
    ];
  }

  if (role === "assistant" || itemType === "assistant_message" || codexType.includes("assistant")) {
    const text = extractCodexText(parsed);
    return [
      {
        type: "message",
        message: text || "Codex assistant event",
        payload
      }
    ];
  }

  if (codexType.includes("error")) {
    return [
      {
        type: "stderr",
        message: extractCodexText(parsed) || readString(parsed, "message") || "Codex error event",
        payload
      }
    ];
  }

  if (codexType.includes("tool") || codexType.includes("command") || itemType?.includes("tool")) {
    return [
      {
        type: "message",
        message: `Codex tool event${itemType ? ` ${itemType}` : ""}`,
        payload
      }
    ];
  }

  const text = extractCodexText(parsed);
  return [
    {
      type: "message",
      message: text || `Codex ${codexType} event`,
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

function buildCodexPayload(event: Record<string, unknown>): Record<string, unknown> {
  return compactPayload({
    codexType: readString(event, "type"),
    durationMs: readNumber(event, "duration_ms") ?? readNumber(event, "durationMs"),
    exitCode: readNumber(event, "exit_code") ?? readNumber(event, "exitCode"),
    itemId: readNestedString(event, ["item", "id"]) ?? readString(event, "item_id"),
    itemType: readNestedString(event, ["item", "type"]),
    model: readString(event, "model"),
    provider: "codex",
    requestId: readString(event, "request_id") ?? readString(event, "requestId"),
    role: readString(event, "role") ?? readNestedString(event, ["item", "role"]),
    sessionId: readString(event, "session_id") ?? readString(event, "sessionId"),
    status: readString(event, "status"),
    toolName: extractToolName(event),
    turnId: readString(event, "turn_id") ?? readString(event, "turnId"),
    usage: sanitizeUsage(event.usage)
  });
}

function extractCodexText(event: Record<string, unknown>): string | undefined {
  const direct =
    readString(event, "message") ??
    readString(event, "text") ??
    readString(event, "delta") ??
    readString(event, "result") ??
    readString(event, "output_text");
  if (direct) {
    return direct;
  }

  const item = event.item;
  if (isRecord(item)) {
    const itemText =
      readString(item, "message") ??
      readString(item, "text") ??
      readString(item, "output_text") ??
      extractTextContent(item.content);
    if (itemText) {
      return itemText;
    }
  }

  return extractTextContent(event.content);
}

function extractTextContent(content: unknown): string | undefined {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return undefined;
  }

  const text = content
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }
      if (!isRecord(item)) {
        return undefined;
      }
      return readString(item, "text") ?? readString(item, "content") ?? readString(item, "output_text");
    })
    .filter((item): item is string => Boolean(item))
    .join("");

  return text || undefined;
}

function extractToolName(event: Record<string, unknown>): string | undefined {
  const directName = readString(event, "name") ?? readString(event, "tool_name") ?? readString(event, "toolName");
  if (directName) {
    return directName;
  }

  const tool = event.tool;
  if (isRecord(tool)) {
    return readString(tool, "name");
  }

  const item = event.item;
  return isRecord(item) ? readString(item, "name") ?? readString(item, "tool_name") : undefined;
}

function sanitizeUsage(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return compactPayload({
    cachedInputTokens: readNumber(value, "cached_input_tokens"),
    inputTokens: readNumber(value, "input_tokens"),
    outputTokens: readNumber(value, "output_tokens"),
    totalTokens: readNumber(value, "total_tokens")
  });
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function readNestedString(record: Record<string, unknown>, path: string[]): string | undefined {
  let current: unknown = record;
  for (const key of path) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[key];
  }

  return typeof current === "string" ? current : undefined;
}

function readNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" ? value : undefined;
}

function compactPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

import type { AgentEvent } from "@agentic-pm/agents";
import type { EventLevel } from "@agentic-pm/core";

export interface AgentEventSeverity {
  level: EventLevel;
  reason?: string;
}

export function classifyAgentEventSeverity(
  event: AgentEvent,
): AgentEventSeverity {
  if (event.type === "session.failed") {
    return {
      level: "error",
      reason: "session_failed",
    };
  }

  if (event.type !== "stderr") {
    return {
      level: "info",
    };
  }

  if (isKnownWarningStderr(event.message)) {
    return {
      level: "warn",
      reason: "known_stderr_warning",
    };
  }

  return {
    level: "error",
    reason: "stderr",
  };
}

export function buildAgentEventPayload(
  payload: Record<string, unknown> | undefined,
  severityReason: string | undefined,
): Record<string, unknown> | undefined {
  if (!severityReason) {
    return payload;
  }

  return {
    ...(payload ?? {}),
    severityReason,
  };
}

export function isKnownWarningStderr(message: string): boolean {
  const normalized = message.trim();
  if (!normalized) {
    return false;
  }

  const lower = normalized.toLowerCase();
  if (isKnownCodexOperationalWarning(lower)) {
    return true;
  }

  const warningPatternMatched =
    /^\s*(warning|warn):/im.test(normalized) ||
    /^\s*\[warn\]/im.test(normalized) ||
    /^\s*(npm|pnpm|yarn)\s+warn/im.test(normalized) ||
    /\b(deprecationwarning|experimentalwarning)\b/i.test(normalized) ||
    /^\s*browserslist: caniuse-lite is outdated/im.test(normalized);

  if (!warningPatternMatched) {
    return false;
  }

  const isWarningException =
    /\b(deprecationwarning|experimentalwarning)\b/i.test(normalized);
  return (
    isWarningException || !/\b(error|failed|fatal|exception)\b/.test(lower)
  );
}

function isKnownCodexOperationalWarning(lower: string): boolean {
  if (
    lower.includes("state_5.sqlite") ||
    /\/\.codex\/state_\d+\.sqlite\b/.test(lower)
  ) {
    return true;
  }

  return (
    lower.includes("codex") &&
    lower.includes("model") &&
    lower.includes("personality") &&
    !/\b(error|failed|fatal|exception)\b/.test(lower)
  );
}

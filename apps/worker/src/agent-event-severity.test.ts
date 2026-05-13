import { describe, expect, it } from "vitest";
import {
  buildAgentEventPayload,
  classifyAgentEventSeverity,
  isKnownWarningStderr,
} from "./agent-event-severity.js";

describe("agent event severity", () => {
  it("classifies non-stderr runtime events as info", () => {
    expect(
      classifyAgentEventSeverity({
        type: "stdout",
        message: "Codex assistant event",
      }),
    ).toEqual({ level: "info" });
  });

  it("classifies session failures as errors", () => {
    expect(
      classifyAgentEventSeverity({
        type: "session.failed",
        message: "Agent runtime exited with code 1",
      }),
    ).toEqual({ level: "error", reason: "session_failed" });
  });

  it("downgrades generic warning-shaped stderr to warn", () => {
    expect(isKnownWarningStderr("Warning: package metadata is deprecated")).toBe(
      true,
    );
    expect(
      classifyAgentEventSeverity({
        type: "stderr",
        message: "Warning: package metadata is deprecated",
      }),
    ).toEqual({ level: "warn", reason: "known_stderr_warning" });
  });

  it("downgrades known Codex local state migration chatter to warn", () => {
    expect(
      classifyAgentEventSeverity({
        type: "stderr",
        message:
          "Codex warning: could not migrate /Users/example/.codex/state_5.sqlite; continuing with local state",
      }),
    ).toEqual({ level: "warn", reason: "known_stderr_warning" });
  });

  it("downgrades known Codex model personality config chatter to warn", () => {
    expect(
      classifyAgentEventSeverity({
        type: "stderr",
        message:
          "Codex model personality setting is unavailable in this noninteractive run; continuing",
      }),
    ).toEqual({ level: "warn", reason: "known_stderr_warning" });
  });

  it("keeps real stderr failures as errors", () => {
    expect(
      classifyAgentEventSeverity({
        type: "stderr",
        message: "fatal: failed to write workspace patch",
      }),
    ).toEqual({ level: "error", reason: "stderr" });
  });

  it("adds severity reasons without dropping runtime payload fields", () => {
    expect(buildAgentEventPayload({ provider: "codex" }, "stderr")).toEqual({
      provider: "codex",
      severityReason: "stderr",
    });
  });
});

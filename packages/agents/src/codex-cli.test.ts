import { describe, expect, it } from "vitest";
import { buildCodexArgs, ensureCodexWorkspaceArg } from "./codex-cli.js";
import type { CodexCliRuntimeConfig } from "./codex-cli.js";

describe("Codex CLI argument builder", () => {
  it("injects headless approval and sandbox policy before exec", () => {
    expect(
      buildCodexArgs(
        codexConfig({
          args: ["exec", "--json", "-"],
          approvalPolicy: "never",
          sandboxMode: "workspace-write"
        }),
      ),
    ).toEqual([
      "--ask-for-approval",
      "never",
      "--sandbox",
      "workspace-write",
      "exec",
      "--json",
      "-"
    ]);
  });

  it("preserves explicit approval and sandbox args", () => {
    expect(
      buildCodexArgs(
        codexConfig({
          args: [
            "--ask-for-approval",
            "on-request",
            "--sandbox",
            "read-only",
            "exec",
            "--json",
            "-"
          ],
          approvalPolicy: "never",
          sandboxMode: "workspace-write"
        }),
      ),
    ).toEqual([
      "--ask-for-approval",
      "on-request",
      "--sandbox",
      "read-only",
      "exec",
      "--json",
      "-"
    ]);
  });

  it("injects skip git repo check as an exec option", () => {
    expect(
      buildCodexArgs(
        codexConfig({
          args: ["exec", "--json", "-"],
          skipGitRepoCheck: true
        }),
      ),
    ).toEqual(["exec", "--skip-git-repo-check", "--json", "-"]);
  });

  it("injects generated worktrees as cwd and writable directories", () => {
    expect(ensureCodexWorkspaceArg(["exec", "--json", "-"], "/tmp/workspace")).toEqual([
      "--add-dir",
      "/tmp/workspace",
      "--cd",
      "/tmp/workspace",
      "exec",
      "--json",
      "-",
    ]);
  });

  it("does not duplicate model, reasoning, or workspace args", () => {
    const args = buildCodexArgs(
      codexConfig({
        args: [
          "--cd",
          "/tmp/workspace",
          "--add-dir",
          "/tmp/workspace",
          "-c",
          "model_reasoning_effort=\"high\"",
          "exec",
          "-m",
          "existing-model",
          "--json",
          "-"
        ],
        model: "new-model",
        reasoningEffort: "medium"
      }),
    );

    expect(ensureCodexWorkspaceArg(args, "/tmp/other")).toEqual(args);
    expect(args.filter((arg) => arg === "--cd")).toHaveLength(1);
    expect(args.filter((arg) => arg === "--add-dir")).toHaveLength(1);
    expect(args.filter((arg) => arg === "-m")).toHaveLength(1);
    expect(args.filter((arg) => arg === "-c")).toHaveLength(1);
  });
});

function codexConfig(
  overrides: Partial<CodexCliRuntimeConfig>,
): CodexCliRuntimeConfig {
  return {
    args: [],
    command: "codex",
    turnTimeoutMs: 1000,
    ...overrides
  };
}

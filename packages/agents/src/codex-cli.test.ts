import { describe, expect, it } from "vitest";
import { buildCodexArgs, ensureCodexWorkspaceArg } from "./codex-cli.js";
import type { CodexCliRuntimeConfig } from "./codex-cli.js";

describe("Codex CLI argument builder", () => {
  it("injects headless approval before exec and sandbox policy as an exec option", () => {
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
      "exec",
      "--sandbox",
      "workspace-write",
      "--json",
      "-"
    ]);
  });

  it("normalizes explicit approval and sandbox args to the working sides of exec", () => {
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
      "exec",
      "--sandbox",
      "read-only",
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
      "exec",
      "--add-dir",
      "/tmp/workspace",
      "--cd",
      "/tmp/workspace",
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

  it("moves explicit top-level workspace args to exec options", () => {
    expect(
      ensureCodexWorkspaceArg(
        [
          "--sandbox",
          "workspace-write",
          "--add-dir",
          "/tmp/workspace",
          "--cd",
          "/tmp/workspace",
          "exec",
          "--json",
          "-"
        ],
        "/tmp/other",
      ),
    ).toEqual([
      "exec",
      "--sandbox",
      "workspace-write",
      "--add-dir",
      "/tmp/workspace",
      "--cd",
      "/tmp/workspace",
      "--json",
      "-",
    ]);
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

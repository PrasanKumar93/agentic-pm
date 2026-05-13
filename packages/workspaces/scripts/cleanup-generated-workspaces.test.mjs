#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test } from "node:test";
import assert from "node:assert/strict";

const execFileAsync = promisify(execFile);

test("workspace cleanup dry-run protects source repository caches", async () => {
  const root = await mkdtemp(join(tmpdir(), "agentic-pm-workspace-cleanup-"));
  const sourceRepository = join(root, "source-repositories", "test-linear-app");
  const oldWorktree = join(
    root,
    "linear-live-smoke",
    "test-linear-app",
    "pra-5-old-workspace",
  );
  const recentWorktree = join(
    root,
    "linear-live-smoke",
    "test-linear-app",
    "pra-9-recent-workspace",
  );

  await createGitRepository(sourceRepository);
  await createGitRepository(oldWorktree);
  await createGitRepository(recentWorktree);

  const oldTime = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
  await execFileAsync("touch", [
    "-mt",
    formatTouchTimestamp(oldTime),
    oldWorktree,
  ]);

  const summary = await runCleanup(["--root", root, "--json"]);

  assert.equal(summary.mode, "dry-run");
  assert.deepEqual(
    summary.candidates.map((candidate) => candidate.relativePath),
    ["linear-live-smoke/test-linear-app/pra-5-old-workspace"],
  );
  assert.equal(
    summary.skipped.find(
      (item) => item.relativePath === "source-repositories/test-linear-app",
    )?.reason,
    "protected_workspace_cache",
  );
  assert.equal(
    summary.skipped.find(
      (item) =>
        item.relativePath ===
        "linear-live-smoke/test-linear-app/pra-9-recent-workspace",
    )?.reason,
    "too_recent",
  );
});

async function createGitRepository(path) {
  await mkdir(path, { recursive: true });
  await git(["init"], path);
  await git(["config", "user.email", "workspace-cleanup@example.com"], path);
  await git(["config", "user.name", "Workspace Cleanup"], path);
  await writeFile(join(path, "README.md"), "cleanup fixture\n", "utf8");
  await git(["add", "README.md"], path);
  await git(["commit", "-m", "Initial commit"], path);
}

async function runCleanup(args) {
  const { stdout } = await execFileAsync(
    "node",
    [
      fileURLToPath(
        new URL("./cleanup-generated-workspaces.mjs", import.meta.url),
      ),
      ...args,
    ],
    { encoding: "utf8" },
  );
  return JSON.parse(stdout);
}

async function git(args, cwd) {
  await execFileAsync("git", args, { cwd });
}

function formatTouchTimestamp(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}.${pad(date.getSeconds())}`;
}

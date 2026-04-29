import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import type { Issue } from "@agentic-pm/core";
import { WorkspaceManager } from "./index.js";

const execFileAsync = promisify(execFile);

describe("WorkspaceManager", () => {
  it("materializes a selected local repository as a git worktree", async () => {
    const root = await mkdtemp(join(tmpdir(), "agentic-pm-workspace-test-"));
    const sourcePath = join(root, "source");
    const workspaceRoot = join(root, "workspaces");
    await mkdir(sourcePath);
    await git(["init"], sourcePath);
    await git(["config", "user.email", "workspace-test@example.com"], sourcePath);
    await git(["config", "user.name", "Workspace Test"], sourcePath);
    await writeFile(join(sourcePath, "README.md"), "hello workspace\n", "utf8");
    await git(["add", "README.md"], sourcePath);
    await git(["commit", "-m", "Initial commit"], sourcePath);

    const manager = new WorkspaceManager({
      root: workspaceRoot,
    });
    const issue: Issue = {
      id: "issue_test",
      tracker: "fake",
      externalId: "external_test",
      identifier: "TEST-1",
      title: "Materialize repository",
      state: "Ready for Agent",
      labels: [],
      blockedBy: [],
      repoRefs: ["repo_test"],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const workspacePath = await manager.prepareIssueWorkspace({
      projectSlug: "local",
      issue,
      repository: {
        id: "repo_test",
        name: "source",
        url: `file://${sourcePath}`,
        defaultBranch: "main",
        localPath: sourcePath,
      },
    });

    await expect(readFile(join(workspacePath, "README.md"), "utf8")).resolves.toBe(
      "hello workspace\n",
    );
    await expect(gitOutput(["rev-parse", "--is-inside-work-tree"], workspacePath))
      .resolves.toBe("true");
  });
});

async function git(args: string[], cwd: string): Promise<void> {
  await execFileAsync("git", args, {
    cwd,
  });
}

async function gitOutput(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    encoding: "utf8",
  });
  return stdout.trim();
}

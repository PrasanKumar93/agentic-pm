import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import {
  checkoutPullRequestBranch,
  updateGitHubPullRequestBranch,
} from "./index.js";

const execFileAsync = promisify(execFile);

describe("pull request branch updates", () => {
  it("checks out an existing PR branch and pushes a follow-up commit", async () => {
    const root = await mkdtemp(join(tmpdir(), "agentic-pm-git-test-"));
    const remotePath = join(root, "remote.git");
    const sourcePath = join(root, "source");
    const workspacePath = join(root, "workspace");
    const branchName = "agent/test-1-follow-up";

    await git(["init", "--bare", remotePath], root);
    await mkdir(sourcePath);
    await git(["init"], sourcePath);
    await configureGitIdentity(sourcePath);
    await git(["remote", "add", "origin", remotePath], sourcePath);
    await writeFile(join(sourcePath, "README.md"), "hello\n", "utf8");
    await git(["add", "README.md"], sourcePath);
    await git(["commit", "-m", "Initial commit"], sourcePath);
    await git(["branch", "-M", "main"], sourcePath);
    await git(["push", "-u", "origin", "main"], sourcePath);
    await git(["switch", "-c", branchName], sourcePath);
    await writeFile(join(sourcePath, "feature.txt"), "first pass\n", "utf8");
    await git(["add", "feature.txt"], sourcePath);
    await git(["commit", "-m", "Add first pass"], sourcePath);
    await git(["push", "-u", "origin", branchName], sourcePath);

    await git(["clone", remotePath, workspacePath], root);
    await configureGitIdentity(workspacePath);
    await checkoutPullRequestBranch({
      workspacePath,
      branchName,
      remoteName: "origin",
    });

    await writeFile(
      join(workspacePath, "feature.txt"),
      "first pass\nreview fix\n",
      "utf8",
    );
    const result = await updateGitHubPullRequestBranch({
      workspacePath,
      branchName,
      commitMessage: "Address review feedback",
      remoteName: "origin",
    });

    expect(result.branchName).toBe(branchName);
    expect(result.commitSha).toHaveLength(40);
    await git(["fetch", "origin", branchName], sourcePath);
    await expect(
      gitOutput(["show", `origin/${branchName}:feature.txt`], sourcePath),
    ).resolves.toBe("first pass\nreview fix");
  });
});

async function configureGitIdentity(cwd: string): Promise<void> {
  await git(["config", "user.email", "git-test@example.com"], cwd);
  await git(["config", "user.name", "Git Helper Test"], cwd);
}

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

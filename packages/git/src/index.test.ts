import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import {
  buildPullRequestDraft,
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

  it("pushes an existing self-committed follow-up from a clean workspace", async () => {
    const root = await mkdtemp(join(tmpdir(), "agentic-pm-git-test-"));
    const remotePath = join(root, "remote.git");
    const sourcePath = join(root, "source");
    const workspacePath = join(root, "workspace");
    const branchName = "agent/test-2-self-commit";

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

    const baseCommitSha = await gitOutput(["rev-parse", "HEAD"], workspacePath);
    await writeFile(
      join(workspacePath, "feature.txt"),
      "first pass\nself committed fix\n",
      "utf8",
    );
    await git(["add", "feature.txt"], workspacePath);
    await git(["commit", "-m", "Self-committed review fix"], workspacePath);
    const localCommitSha = await gitOutput(["rev-parse", "HEAD"], workspacePath);

    const draft = await buildPullRequestDraft({
      issueIdentifier: "TEST-2",
      issueTitle: "Self committed review fix",
      runId: "run_1234567890",
      workspacePath,
      baseBranch: "main",
      baseCommitSha,
      branchName,
      remoteName: "origin",
      artifacts: [],
    });

    expect(draft?.changeSource).toBe("committed_range");
    expect(draft?.changedFiles).toEqual(["feature.txt"]);

    const result = await updateGitHubPullRequestBranch({
      workspacePath,
      branchName,
      commitMessage: "Address review feedback",
      remoteName: "origin",
      allowExistingHead: true,
    });

    expect(result.branchName).toBe(branchName);
    expect(result.commitSha).toBe(localCommitSha);
    await git(["fetch", "origin", branchName], sourcePath);
    await expect(
      gitOutput(["show", `origin/${branchName}:feature.txt`], sourcePath),
    ).resolves.toBe("first pass\nself committed fix");
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

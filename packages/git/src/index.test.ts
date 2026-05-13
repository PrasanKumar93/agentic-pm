import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import {
  assertPullRequestMergeable,
  buildAgentBranchName,
  buildPullRequestDraft,
  checkRepositoryConnectivity,
  checkoutPullRequestBranch,
  commitPullRequestConflictResolution,
  preparePullRequestConflictResolution,
  PullRequestMergeConflictError,
  updateGitHubPullRequestBranch,
} from "./index.js";

const execFileAsync = promisify(execFile);

describe("agent PR branch names", () => {
  it("keeps the default agent prefix and run suffix", () => {
    expect(
      buildAgentBranchName(
        "PRA-9",
        "Codex webhook smoke: add status CLI",
        "ec394304",
      ),
    ).toBe("agent/pra-9-codex-webhook-smoke-add-status-cli-ec394304");
  });

  it("applies repository branch policy and preserves the unique suffix when truncated", () => {
    const branchName = buildAgentBranchName(
      "PRA-10",
      "Add a very long command palette workflow for repeated repository review requests",
      "20260513t173000-abcdef12",
      {
        prefix: "symphony",
        maxLength: 64,
      },
    );

    expect(branchName).toHaveLength(64);
    expect(branchName.startsWith("symphony/pra-10-add-a-very-long-command")).toBe(
      true,
    );
    expect(branchName.endsWith("-abcdef12")).toBe(true);
  });
});

describe("repository connectivity checks", () => {
  it("passes for a local repo with a reachable draft PR remote", async () => {
    const root = await mkdtemp(join(tmpdir(), "agentic-pm-git-check-"));
    const remotePath = join(root, "remote.git");
    const sourcePath = join(root, "source");

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

    const result = await checkRepositoryConnectivity({
      url: remotePath,
      defaultBranch: "main",
      localPath: sourcePath,
      pullRequest: {
        mode: "github_draft",
        remoteName: "origin",
        baseBranch: "main",
      },
    });

    expect(result.status).toBe("ok");
    expect(result.checks.map((check) => check.status)).toEqual([
      "ok",
      "ok",
      "ok",
    ]);
  });

  it("warns when clone access works but no local path is configured", async () => {
    const root = await mkdtemp(join(tmpdir(), "agentic-pm-git-check-"));
    const remotePath = join(root, "remote.git");
    const sourcePath = join(root, "source");

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

    const result = await checkRepositoryConnectivity({
      url: remotePath,
      defaultBranch: "main",
      pullRequest: {
        mode: "local_draft",
      },
    });

    expect(result.status).toBe("warn");
    expect(result.checks.find((check) => check.name === "local_path")?.status).toBe(
      "warn",
    );
    expect(
      result.checks.find((check) => check.name === "repository_url")?.status,
    ).toBe("ok");
  });

  it("fails when a GitHub draft PR base branch is missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "agentic-pm-git-check-"));
    const remotePath = join(root, "remote.git");
    const sourcePath = join(root, "source");

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

    const result = await checkRepositoryConnectivity({
      url: remotePath,
      defaultBranch: "main",
      localPath: sourcePath,
      pullRequest: {
        mode: "github_draft",
        remoteName: "origin",
        baseBranch: "release",
      },
    });

    expect(result.status).toBe("error");
    expect(result.checks.find((check) => check.name === "pr_remote")?.status).toBe(
      "error",
    );
  });
});

describe("pull request branch updates", () => {
  it("verifies a PR branch is mergeable with the remote base", async () => {
    const root = await mkdtemp(join(tmpdir(), "agentic-pm-git-test-"));
    const remotePath = join(root, "remote.git");
    const sourcePath = join(root, "source");
    const branchName = "agent/test-mergeable";

    await git(["init", "--bare", remotePath], root);
    await mkdir(sourcePath);
    await git(["init"], sourcePath);
    await configureGitIdentity(sourcePath);
    await git(["remote", "add", "origin", remotePath], sourcePath);
    await writeFile(join(sourcePath, "README.md"), "base\n", "utf8");
    await git(["add", "README.md"], sourcePath);
    await git(["commit", "-m", "Initial commit"], sourcePath);
    await git(["branch", "-M", "main"], sourcePath);
    await git(["push", "-u", "origin", "main"], sourcePath);
    await git(["switch", "-c", branchName], sourcePath);
    await writeFile(join(sourcePath, "feature.txt"), "feature\n", "utf8");
    await git(["add", "feature.txt"], sourcePath);
    await git(["commit", "-m", "Add feature"], sourcePath);

    const result = await assertPullRequestMergeable({
      workspacePath: sourcePath,
      baseBranch: "main",
      branchName,
      remoteName: "origin",
    });

    expect(result.branchName).toBe(branchName);
    expect(result.baseBranch).toBe("main");
    expect(result.headSha).toHaveLength(40);
    expect(result.mergeTreeSha).toHaveLength(40);
  });

  it("rejects a PR branch that conflicts with the remote base", async () => {
    const root = await mkdtemp(join(tmpdir(), "agentic-pm-git-test-"));
    const remotePath = join(root, "remote.git");
    const sourcePath = join(root, "source");
    const branchName = "agent/test-conflict";

    await git(["init", "--bare", remotePath], root);
    await mkdir(sourcePath);
    await git(["init"], sourcePath);
    await configureGitIdentity(sourcePath);
    await git(["remote", "add", "origin", remotePath], sourcePath);
    await writeFile(join(sourcePath, "README.md"), "base\n", "utf8");
    await git(["add", "README.md"], sourcePath);
    await git(["commit", "-m", "Initial commit"], sourcePath);
    await git(["branch", "-M", "main"], sourcePath);
    await git(["push", "-u", "origin", "main"], sourcePath);
    await git(["switch", "-c", branchName], sourcePath);
    await writeFile(join(sourcePath, "README.md"), "feature\n", "utf8");
    await git(["commit", "-am", "Feature edit"], sourcePath);
    await git(["switch", "main"], sourcePath);
    await writeFile(join(sourcePath, "README.md"), "main\n", "utf8");
    await git(["commit", "-am", "Main edit"], sourcePath);
    await git(["push", "origin", "main"], sourcePath);
    await git(["switch", branchName], sourcePath);

    await expect(
      assertPullRequestMergeable({
        workspacePath: sourcePath,
        baseBranch: "main",
        branchName,
        remoteName: "origin",
      }),
    ).rejects.toBeInstanceOf(PullRequestMergeConflictError);
  });

  it("prepares conflict markers and commits a resolved PR branch", async () => {
    const root = await mkdtemp(join(tmpdir(), "agentic-pm-git-test-"));
    const remotePath = join(root, "remote.git");
    const sourcePath = join(root, "source");
    const branchName = "agent/test-conflict-resolution";

    await git(["init", "--bare", remotePath], root);
    await mkdir(sourcePath);
    await git(["init"], sourcePath);
    await configureGitIdentity(sourcePath);
    await git(["remote", "add", "origin", remotePath], sourcePath);
    await writeFile(join(sourcePath, "README.md"), "base\n", "utf8");
    await git(["add", "README.md"], sourcePath);
    await git(["commit", "-m", "Initial commit"], sourcePath);
    await git(["branch", "-M", "main"], sourcePath);
    await git(["push", "-u", "origin", "main"], sourcePath);
    await git(["switch", "-c", branchName], sourcePath);
    await writeFile(join(sourcePath, "README.md"), "feature\n", "utf8");
    await git(["commit", "-am", "Feature edit"], sourcePath);
    await git(["switch", "main"], sourcePath);
    await writeFile(join(sourcePath, "README.md"), "main\n", "utf8");
    await git(["commit", "-am", "Main edit"], sourcePath);
    await git(["push", "origin", "main"], sourcePath);
    await git(["switch", branchName], sourcePath);

    const prepared = await preparePullRequestConflictResolution({
      workspacePath: sourcePath,
      baseBranch: "main",
      branchName,
      remoteName: "origin",
    });

    expect(prepared.conflictedFiles).toEqual(["README.md"]);
    await expect(gitOutput(["status", "--porcelain=v1"], sourcePath)).resolves.toContain(
      "UU README.md",
    );

    await writeFile(join(sourcePath, "README.md"), "main\nfeature\n", "utf8");
    const result = await commitPullRequestConflictResolution({
      workspacePath: sourcePath,
      baseBranch: "main",
      branchName,
      commitMessage: "Resolve merge conflict",
      remoteName: "origin",
    });

    expect(result.branchName).toBe(branchName);
    expect(result.commitSha).toHaveLength(40);
    expect(result.mergeability.mergeTreeSha).toHaveLength(40);
  });

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

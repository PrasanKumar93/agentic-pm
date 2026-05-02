import { execFile } from "node:child_process";
import { mkdtemp, realpath, rm, stat, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { slugify, type PullRequestMode } from "@agentic-pm/core";

const execFileAsync = promisify(execFile);

export interface PullRequestDraftInput {
  issueIdentifier: string;
  issueTitle: string;
  runId: string;
  workspacePath: string;
  baseCommitSha?: string;
  baseBranch?: string;
  branchName?: string;
  remoteName?: string;
  artifacts: Array<{
    id: string;
    type: string;
    summary?: string;
    uri: string;
  }>;
}

export interface PullRequestDraft {
  baseBranch: string;
  branchName: string;
  changedFiles: string[];
  changeSource: "committed_range" | "working_tree";
  commitMessage: string;
  markdown: string;
  remoteUrl?: string;
  title: string;
}

export interface GitHubPullRequestInput {
  workspacePath: string;
  draft: PullRequestDraft;
  remoteName: string;
  ghCommand?: string;
  draftPr?: boolean;
  bodyMarkdown?: string;
}

export interface GitHubPullRequestResult {
  baseBranch: string;
  branchName: string;
  commitSha: string;
  draft: boolean;
  remoteName: string;
  remotePrUrl?: string;
  stdout: string;
}

export interface GitHubPullRequestUpdateInput {
  workspacePath: string;
  branchName: string;
  commitMessage: string;
  remoteName: string;
  allowExistingHead?: boolean;
}

export interface GitHubPullRequestUpdateResult {
  branchName: string;
  commitSha: string;
  remoteName: string;
  stdout: string;
}

export type RepositoryConnectivityStatus = "ok" | "warn" | "error";

export type RepositoryConnectivityCheckName =
  | "local_path"
  | "repository_url"
  | "pr_remote";

export interface RepositoryConnectivityCheck {
  name: RepositoryConnectivityCheckName;
  label: string;
  status: RepositoryConnectivityStatus;
  message: string;
  details?: string;
}

export interface RepositoryConnectivityInput {
  url: string;
  defaultBranch?: string;
  localPath?: string;
  pullRequest?: {
    baseBranch?: string;
    mode?: PullRequestMode;
    remoteName?: string;
  };
  timeoutMs?: number;
}

export interface RepositoryConnectivityResult {
  status: RepositoryConnectivityStatus;
  checks: RepositoryConnectivityCheck[];
}

export function buildAgentBranchName(issueIdentifier: string, title: string, suffix?: string): string {
  const slug = slugify(title);
  const suffixPart = suffix ? `-${slugify(suffix)}` : "";
  return `agent/${issueIdentifier.toLowerCase()}-${slug}${suffixPart}`.slice(0, 120);
}

export function isProtectedBranch(branch: string): boolean {
  return ["main", "master", "develop", "production"].includes(branch);
}

export async function checkRepositoryConnectivity(
  input: RepositoryConnectivityInput,
): Promise<RepositoryConnectivityResult> {
  const timeoutMs = Math.min(Math.max(input.timeoutMs ?? 5_000, 1_000), 30_000);
  const defaultBranch = input.defaultBranch?.trim() || "main";
  const checks = await Promise.all([
    checkLocalPath(input.localPath),
    checkRepositoryUrl(input.url, defaultBranch, timeoutMs),
    checkPullRequestRemote(input, defaultBranch, timeoutMs),
  ]);

  return {
    status: summarizeConnectivityChecks(checks),
    checks,
  };
}

export async function buildPullRequestDraft(input: PullRequestDraftInput): Promise<PullRequestDraft | undefined> {
  const gitRoot = await readGitRoot(input.workspacePath);
  if (!gitRoot || (await normalizePath(gitRoot)) !== (await normalizePath(input.workspacePath))) {
    return undefined;
  }

  const workingTreeFiles = await readChangedFiles(input.workspacePath);
  const committedRangeFiles =
    workingTreeFiles.length === 0 && input.baseCommitSha
      ? await readChangedFilesSinceCommit(
          input.workspacePath,
          input.baseCommitSha,
        )
      : [];
  const changedFiles = workingTreeFiles.length
    ? workingTreeFiles
    : committedRangeFiles;
  if (changedFiles.length === 0) {
    return undefined;
  }
  const changeSource = workingTreeFiles.length
    ? "working_tree"
    : "committed_range";

  const baseBranch = input.baseBranch ?? (await readCurrentBranch(input.workspacePath));
  const branchName = input.branchName ?? buildAgentBranchName(input.issueIdentifier, input.issueTitle, input.runId.slice(-8));
  const title = `${input.issueIdentifier}: ${input.issueTitle}`;
  const commitMessage = `${input.issueIdentifier}: ${input.issueTitle}`;
  const remoteUrl = await readRemoteUrl(input.workspacePath, input.remoteName);
  const markdown = buildPullRequestMarkdown({
    ...input,
    baseBranch,
    branchName,
    changedFiles,
    changeSource,
    commitMessage,
    remoteUrl,
    title
  });

  return {
    baseBranch,
    branchName,
    changedFiles,
    changeSource,
    commitMessage,
    markdown,
    remoteUrl,
    title
  };
}

export async function createGitHubPullRequest(input: GitHubPullRequestInput): Promise<GitHubPullRequestResult> {
  const gitRoot = await readGitRoot(input.workspacePath);
  if (!gitRoot || (await normalizePath(gitRoot)) !== (await normalizePath(input.workspacePath))) {
    throw new Error("GitHub PR creation requires the workspace path to be a git repository root");
  }

  if (!input.remoteName.trim()) {
    throw new Error("GitHub PR creation requires an explicit remote name");
  }

  const bodyDir = await mkdtemp(join(tmpdir(), "agentic-pm-pr-"));
  const bodyFile = join(bodyDir, "pull-request.md");
  const ghCommand = input.ghCommand ?? "gh";
  const draft = input.draftPr ?? true;

  try {
    await writeFile(bodyFile, input.bodyMarkdown ?? input.draft.markdown, "utf8");
    await runGit(input.workspacePath, ["switch", "-c", input.draft.branchName]);
    await runGit(input.workspacePath, ["add", "-A"]);
    await runGit(input.workspacePath, ["commit", "-m", input.draft.commitMessage]);
    const commitSha = (await runGit(input.workspacePath, ["rev-parse", "HEAD"])).trim();
    await runGit(input.workspacePath, ["push", "-u", input.remoteName, input.draft.branchName]);

    const ghArgs = [
      "pr",
      "create",
      ...(draft ? ["--draft"] : []),
      "--base",
      input.draft.baseBranch,
      "--head",
      input.draft.branchName,
      "--title",
      input.draft.title,
      "--body-file",
      bodyFile
    ];
    const { stdout } = await execFileAsync(ghCommand, ghArgs, {
      cwd: input.workspacePath,
      maxBuffer: 10 * 1024 * 1024
    });

    return {
      baseBranch: input.draft.baseBranch,
      branchName: input.draft.branchName,
      commitSha,
      draft,
      remoteName: input.remoteName,
      remotePrUrl: extractFirstUrl(stdout),
      stdout: stdout.trim()
    };
  } finally {
    await rm(bodyDir, { recursive: true, force: true });
  }
}

export async function checkoutPullRequestBranch(input: {
  workspacePath: string;
  branchName: string;
  remoteName?: string;
}): Promise<void> {
  const gitRoot = await readGitRoot(input.workspacePath);
  if (!gitRoot || (await normalizePath(gitRoot)) !== (await normalizePath(input.workspacePath))) {
    throw new Error("PR branch checkout requires the workspace path to be a git repository root");
  }

  const branchName = input.branchName.trim();
  if (!branchName || isProtectedBranch(branchName)) {
    throw new Error(`Refusing to checkout unsafe PR branch: ${input.branchName}`);
  }

  const remoteName = input.remoteName?.trim();
  if (remoteName) {
    await runGit(input.workspacePath, ["fetch", remoteName, branchName]);
    try {
      await runGit(input.workspacePath, ["switch", branchName]);
    } catch {
      await runGit(input.workspacePath, ["switch", "-c", branchName, "FETCH_HEAD"]);
    }
    await runGit(input.workspacePath, ["pull", "--ff-only", remoteName, branchName]);
    return;
  }

  await runGit(input.workspacePath, ["switch", branchName]);
}

export async function updateGitHubPullRequestBranch(
  input: GitHubPullRequestUpdateInput,
): Promise<GitHubPullRequestUpdateResult> {
  const gitRoot = await readGitRoot(input.workspacePath);
  if (!gitRoot || (await normalizePath(gitRoot)) !== (await normalizePath(input.workspacePath))) {
    throw new Error("GitHub PR update requires the workspace path to be a git repository root");
  }

  if (!input.remoteName.trim()) {
    throw new Error("GitHub PR update requires an explicit remote name");
  }

  if (!input.branchName.trim() || isProtectedBranch(input.branchName)) {
    throw new Error(`Refusing to update unsafe PR branch: ${input.branchName}`);
  }

  await runGit(input.workspacePath, ["switch", input.branchName]);
  await runGit(input.workspacePath, ["add", "-A"]);
  const changedFiles = await readChangedFiles(input.workspacePath);
  if (changedFiles.length > 0) {
    await runGit(input.workspacePath, ["commit", "-m", input.commitMessage]);
  } else if (!input.allowExistingHead) {
    throw new Error("No workspace changes to commit for PR update");
  }
  const commitSha = (await runGit(input.workspacePath, ["rev-parse", "HEAD"])).trim();
  const stdout = await runGit(input.workspacePath, ["push", input.remoteName, input.branchName]);

  return {
    branchName: input.branchName,
    commitSha,
    remoteName: input.remoteName,
    stdout: stdout.trim(),
  };
}

async function checkLocalPath(
  localPath: string | undefined,
): Promise<RepositoryConnectivityCheck> {
  const path = localPath?.trim();
  if (!path) {
    return {
      name: "local_path",
      label: "Local path",
      status: "warn",
      message: "No local path configured; workers will clone from the repository URL.",
    };
  }

  const resolvedPath = resolveShellPath(path);
  try {
    const pathStat = await stat(resolvedPath);
    if (!pathStat.isDirectory()) {
      return {
        name: "local_path",
        label: "Local path",
        status: "error",
        message: "Local path exists but is not a directory.",
        details: resolvedPath,
      };
    }
  } catch {
    return {
      name: "local_path",
      label: "Local path",
      status: "error",
      message: "Local path does not exist.",
      details: resolvedPath,
    };
  }

  const gitRoot = await readGitRoot(resolvedPath);
  if (!gitRoot) {
    return {
      name: "local_path",
      label: "Local path",
      status: "error",
      message: "Local path is not inside a git repository.",
      details: resolvedPath,
    };
  }

  const currentBranch = await readCurrentBranch(resolvedPath);
  return {
    name: "local_path",
    label: "Local path",
    status: "ok",
    message: `Local git repository found on ${currentBranch}.`,
    details: gitRoot,
  };
}

async function checkRepositoryUrl(
  url: string,
  defaultBranch: string,
  timeoutMs: number,
): Promise<RepositoryConnectivityCheck> {
  const repositoryUrl = url.trim();
  if (!repositoryUrl) {
    return {
      name: "repository_url",
      label: "Repository URL",
      status: "error",
      message: "Repository URL is required.",
    };
  }

  const lsRemote = await runGitForCheck(
    tmpdir(),
    ["ls-remote", repositoryUrl],
    timeoutMs,
  );
  if (!lsRemote.ok) {
    return {
      name: "repository_url",
      label: "Repository URL",
      status: "error",
      message: `Repository URL is not reachable: ${lsRemote.message}`,
      details: repositoryUrl,
    };
  }

  const branchCheck = await runGitForCheck(
    tmpdir(),
    ["ls-remote", "--heads", repositoryUrl, defaultBranch],
    timeoutMs,
  );
  if (branchCheck.ok && branchCheck.stdout.trim()) {
    return {
      name: "repository_url",
      label: "Repository URL",
      status: "ok",
      message: `Repository is reachable and ${defaultBranch} exists.`,
      details: repositoryUrl,
    };
  }

  return {
    name: "repository_url",
    label: "Repository URL",
    status: "warn",
    message: `Repository is reachable, but ${defaultBranch} was not found.`,
    details: repositoryUrl,
  };
}

async function checkPullRequestRemote(
  input: RepositoryConnectivityInput,
  defaultBranch: string,
  timeoutMs: number,
): Promise<RepositoryConnectivityCheck> {
  if (input.pullRequest?.mode !== "github_draft") {
    return {
      name: "pr_remote",
      label: "PR remote",
      status: "ok",
      message: "Remote PR creation is not required for this PR mode.",
    };
  }

  const remoteName = input.pullRequest.remoteName?.trim() || "origin";
  const baseBranch = input.pullRequest.baseBranch?.trim() || defaultBranch;
  const localPath = input.localPath?.trim();

  if (localPath) {
    const resolvedPath = resolveShellPath(localPath);
    const gitRoot = await readGitRoot(resolvedPath);
    if (gitRoot) {
      const remoteUrl = await readRemoteUrl(resolvedPath, remoteName);
      if (!remoteUrl) {
        return {
          name: "pr_remote",
          label: "PR remote",
          status: "error",
          message: `Remote ${remoteName} is not configured in the local repo.`,
          details: resolvedPath,
        };
      }

      const remoteBranch = await runGitForCheck(
        resolvedPath,
        ["ls-remote", "--heads", remoteName, baseBranch],
        timeoutMs,
      );
      if (remoteBranch.ok && remoteBranch.stdout.trim()) {
        return {
          name: "pr_remote",
          label: "PR remote",
          status: "ok",
          message: `Remote ${remoteName}/${baseBranch} is reachable for draft PRs.`,
          details: remoteUrl,
        };
      }

      return {
        name: "pr_remote",
        label: "PR remote",
        status: "error",
        message: remoteBranch.ok
          ? `Remote ${remoteName}/${baseBranch} was not found.`
          : `Remote ${remoteName} is not reachable: ${remoteBranch.message}`,
        details: remoteUrl,
      };
    }
  }

  const remoteBranch = await runGitForCheck(
    tmpdir(),
    ["ls-remote", "--heads", input.url.trim(), baseBranch],
    timeoutMs,
  );
  if (remoteBranch.ok && remoteBranch.stdout.trim()) {
    return {
      name: "pr_remote",
      label: "PR remote",
      status: "ok",
      message: `Repository URL has ${baseBranch} for draft PRs.`,
      details: input.url.trim(),
    };
  }

  return {
    name: "pr_remote",
    label: "PR remote",
    status: "error",
    message: remoteBranch.ok
      ? `Repository URL does not expose PR base branch ${baseBranch}.`
      : `Repository URL cannot verify PR base branch: ${remoteBranch.message}`,
    details: input.url.trim(),
  };
}

function summarizeConnectivityChecks(
  checks: RepositoryConnectivityCheck[],
): RepositoryConnectivityStatus {
  if (checks.some((check) => check.status === "error")) {
    return "error";
  }

  if (checks.some((check) => check.status === "warn")) {
    return "warn";
  }

  return "ok";
}

function resolveShellPath(path: string): string {
  if (path === "~") {
    return homedir();
  }

  if (path.startsWith("~/")) {
    return join(homedir(), path.slice(2));
  }

  if (path.startsWith("file://")) {
    try {
      return fileURLToPath(path);
    } catch {
      return resolve(path);
    }
  }

  return resolve(path);
}

async function runGitForCheck(
  cwd: string,
  args: string[],
  timeoutMs: number,
): Promise<{ ok: true; stdout: string } | { ok: false; message: string }> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
      timeout: timeoutMs,
    });
    return { ok: true, stdout };
  } catch (error) {
    return {
      ok: false,
      message: formatGitCheckError(error),
    };
  }
}

function formatGitCheckError(error: unknown): string {
  const gitError = error as {
    code?: unknown;
    killed?: boolean;
    message?: string;
    signal?: string;
    stderr?: string;
  };
  if (gitError.killed || gitError.signal === "SIGTERM") {
    return "timed out";
  }

  const stderr = gitError.stderr?.trim();
  if (stderr) {
    return stderr.split(/\r?\n/).at(-1) ?? stderr;
  }

  return gitError.message ?? "git command failed";
}

async function readHeadSha(workspacePath: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
      cwd: workspacePath
    });
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

async function normalizePath(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    return resolve(path);
  }
}

async function readGitRoot(workspacePath: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--show-toplevel"], {
      cwd: workspacePath
    });
    return stdout.trim();
  } catch {
    return undefined;
  }
}

async function readCurrentBranch(workspacePath: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: workspacePath
    });
    return stdout.trim() || "HEAD";
  } catch {
    return "HEAD";
  }
}

async function readRemoteUrl(workspacePath: string, remoteName = "origin"): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync("git", ["remote", "get-url", remoteName], {
      cwd: workspacePath
    });
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

async function readChangedFiles(workspacePath: string): Promise<string[]> {
  const { stdout } = await execFileAsync("git", ["status", "--porcelain=v1"], {
    cwd: workspacePath
  });

  return stdout
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => line.slice(3).split(" -> ").pop()?.trim())
    .filter((file): file is string => Boolean(file));
}

async function readChangedFilesSinceCommit(
  workspacePath: string,
  baseCommitSha: string,
): Promise<string[]> {
  const baseCommit = baseCommitSha.trim();
  if (!baseCommit) {
    return [];
  }

  const headCommit = await readHeadSha(workspacePath);
  if (!headCommit || headCommit === baseCommit) {
    return [];
  }

  try {
    const { stdout } = await execFileAsync(
      "git",
      ["diff", "--name-only", baseCommit, "HEAD"],
      {
        cwd: workspacePath,
      },
    );
    return [
      ...new Set(
        stdout
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean),
      ),
    ];
  } catch {
    return [];
  }
}

async function runGit(workspacePath: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd: workspacePath,
    maxBuffer: 20 * 1024 * 1024
  });
  return stdout;
}

function extractFirstUrl(output: string): string | undefined {
  const match = output.match(/https?:\/\/\S+/);
  return match?.[0] ?? undefined;
}

type PullRequestMarkdownInput = PullRequestDraftInput & Omit<PullRequestDraft, "markdown">;

function buildPullRequestMarkdown(input: PullRequestMarkdownInput): string {
  const artifactLines = input.artifacts.length
    ? input.artifacts.map((artifact) => `- ${artifact.type}: ${artifact.summary ?? artifact.uri}`).join("\n")
    : "- No supporting artifacts were captured before PR draft generation.";
  const changedFileLines = input.changedFiles.map((file) => `- ${file}`).join("\n");
  const remoteName = input.remoteName ?? "origin";
  const remoteLine = input.remoteUrl ? `Remote: ${input.remoteUrl}` : "Remote: not configured";
  const protectedBaseNote = isProtectedBranch(input.baseBranch)
    ? "- Base branch appears protected. Keep merge manual and require normal repository review checks."
    : "- Confirm the intended base branch before opening or merging the PR.";

  return `# Pull Request Draft

Title: ${input.title}
Run: ${input.runId}
Workspace: ${input.workspacePath}
Base branch: ${input.baseBranch}
Agent branch: ${input.branchName}
${remoteLine}

## Manual Merge Gate

- This artifact does not merge code automatically.
- A human must inspect the workspace diff, create or review the PR, wait for required checks, and merge outside Symphony.
${protectedBaseNote}

## Suggested Commands

\`\`\`sh
git switch -c ${input.branchName}
git add -A
git commit -m "${input.commitMessage.replaceAll("\"", "\\\"")}"
git push -u ${remoteName} ${input.branchName}
gh pr create --draft --base ${input.baseBranch} --head ${input.branchName} --title "${input.title.replaceAll("\"", "\\\"")}" --body-file pull-request.md
\`\`\`

## Changed Files

${changedFileLines}

## Supporting Artifacts

${artifactLines}
`;
}

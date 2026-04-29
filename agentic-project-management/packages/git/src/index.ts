import { execFile } from "node:child_process";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { slugify } from "@agentic-pm/core";

const execFileAsync = promisify(execFile);

export interface PullRequestDraftInput {
  issueIdentifier: string;
  issueTitle: string;
  runId: string;
  workspacePath: string;
  baseBranch?: string;
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

export function buildAgentBranchName(issueIdentifier: string, title: string, suffix?: string): string {
  const slug = slugify(title);
  const suffixPart = suffix ? `-${slugify(suffix)}` : "";
  return `agent/${issueIdentifier.toLowerCase()}-${slug}${suffixPart}`.slice(0, 120);
}

export function isProtectedBranch(branch: string): boolean {
  return ["main", "master", "develop", "production"].includes(branch);
}

export async function buildPullRequestDraft(input: PullRequestDraftInput): Promise<PullRequestDraft | undefined> {
  const gitRoot = await readGitRoot(input.workspacePath);
  if (!gitRoot || (await normalizePath(gitRoot)) !== (await normalizePath(input.workspacePath))) {
    return undefined;
  }

  const changedFiles = await readChangedFiles(input.workspacePath);
  if (changedFiles.length === 0) {
    return undefined;
  }

  const baseBranch = input.baseBranch ?? (await readCurrentBranch(input.workspacePath));
  const branchName = buildAgentBranchName(input.issueIdentifier, input.issueTitle, input.runId.slice(-8));
  const title = `${input.issueIdentifier}: ${input.issueTitle}`;
  const commitMessage = `${input.issueIdentifier}: ${input.issueTitle}`;
  const remoteUrl = await readRemoteUrl(input.workspacePath, input.remoteName);
  const markdown = buildPullRequestMarkdown({
    ...input,
    baseBranch,
    branchName,
    changedFiles,
    commitMessage,
    remoteUrl,
    title
  });

  return {
    baseBranch,
    branchName,
    changedFiles,
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

import { realpath } from "node:fs/promises";
import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { slugify } from "@agentic-pm/core";

const execFileAsync = promisify(execFile);

export interface PullRequestDraftInput {
  issueIdentifier: string;
  issueTitle: string;
  runId: string;
  workspacePath: string;
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

  const baseBranch = await readCurrentBranch(input.workspacePath);
  const branchName = buildAgentBranchName(input.issueIdentifier, input.issueTitle, input.runId.slice(-8));
  const title = `${input.issueIdentifier}: ${input.issueTitle}`;
  const commitMessage = `${input.issueIdentifier}: ${input.issueTitle}`;
  const remoteUrl = await readRemoteUrl(input.workspacePath);
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

async function readRemoteUrl(workspacePath: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync("git", ["remote", "get-url", "origin"], {
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

type PullRequestMarkdownInput = PullRequestDraftInput & Omit<PullRequestDraft, "markdown">;

function buildPullRequestMarkdown(input: PullRequestMarkdownInput): string {
  const artifactLines = input.artifacts.length
    ? input.artifacts.map((artifact) => `- ${artifact.type}: ${artifact.summary ?? artifact.uri}`).join("\n")
    : "- No supporting artifacts were captured before PR draft generation.";
  const changedFileLines = input.changedFiles.map((file) => `- ${file}`).join("\n");
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
git push -u origin ${input.branchName}
gh pr create --draft --base ${input.baseBranch} --head ${input.branchName} --title "${input.title.replaceAll("\"", "\\\"")}" --body-file pull-request.md
\`\`\`

## Changed Files

${changedFileLines}

## Supporting Artifacts

${artifactLines}
`;
}

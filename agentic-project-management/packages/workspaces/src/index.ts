import { access, mkdir, readdir } from "node:fs/promises";
import { exec, execFile } from "node:child_process";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { slugify, type Issue, type RepositorySummary } from "@agentic-pm/core";
import type { EventSink } from "@agentic-pm/observability";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
const gitTimeoutMs = 10 * 60_000;

export interface WorkspaceHooks {
  after_create?: string;
  before_run?: string;
  after_run?: string;
  before_remove?: string;
}

export interface WorkspaceManagerOptions {
  root: string;
  eventSink?: EventSink;
  hookTimeoutMs?: number;
  env?: NodeJS.ProcessEnv;
}

export type WorkspaceMaterializationStrategy =
  | "empty"
  | "existing"
  | "git_clone"
  | "git_worktree";

export interface WorkspaceMaterialization {
  strategy: WorkspaceMaterializationStrategy;
  workspacePath: string;
  repository?: Pick<
    RepositorySummary,
    "id" | "name" | "url" | "defaultBranch" | "localPath"
  >;
}

export class WorkspaceManager {
  constructor(private readonly options: WorkspaceManagerOptions) {}

  getIssueWorkspacePath(
    projectSlug: string,
    issue: Issue,
    repositoryName?: string,
  ): string {
    const workspaceName = `${issue.identifier.toLowerCase()}-${slugify(issue.title)}`;
    const projectPath = slugify(projectSlug);
    const repositoryPath = repositoryName ? slugify(repositoryName) : undefined;
    return repositoryPath
      ? join(this.options.root, projectPath, repositoryPath, workspaceName)
      : join(this.options.root, projectPath, workspaceName);
  }

  async prepareIssueWorkspace(input: {
    projectSlug: string;
    issue: Issue;
    repositoryName?: string;
    repository?: Pick<
      RepositorySummary,
      "id" | "name" | "url" | "defaultBranch" | "localPath"
    >;
    hooks?: WorkspaceHooks;
  }): Promise<string> {
    const path = this.getIssueWorkspacePath(
      input.projectSlug,
      input.issue,
      input.repository?.name ?? input.repositoryName,
    );
    await this.materializeWorkspace(path, input.repository);

    if (input.hooks?.after_create) {
      await this.runHook("after_create", input.hooks.after_create, path);
    }

    if (input.hooks?.before_run) {
      await this.runHook("before_run", input.hooks.before_run, path);
    }

    return path;
  }

  async runHook(
    name: keyof WorkspaceHooks,
    command: string,
    cwd: string,
  ): Promise<void> {
    await this.options.eventSink?.emit({
      type: "workspace.hook.started",
      level: "info",
      message: `Running ${name} hook`,
      payload: { cwd },
    });

    const { stdout, stderr } = await execAsync(command, {
      cwd,
      env: this.options.env ?? process.env,
      timeout: this.options.hookTimeoutMs ?? 15 * 60_000,
    });

    await this.options.eventSink?.emit({
      type: "workspace.hook.completed",
      level: stderr ? "warn" : "info",
      message: `${name} hook completed`,
      payload: { stdout, stderr },
    });
  }

  private async materializeWorkspace(
    workspacePath: string,
    repository?: Pick<
      RepositorySummary,
      "id" | "name" | "url" | "defaultBranch" | "localPath"
    >,
  ): Promise<WorkspaceMaterialization> {
    if (await hasDirectoryEntries(workspacePath)) {
      const materialization: WorkspaceMaterialization = {
        strategy: "existing",
        workspacePath,
        repository,
      };
      await this.emitMaterialization(materialization);
      return materialization;
    }

    if (!repository) {
      await mkdir(workspacePath, { recursive: true });
      const materialization: WorkspaceMaterialization = {
        strategy: "empty",
        workspacePath,
      };
      await this.emitMaterialization(materialization);
      return materialization;
    }

    await mkdir(dirname(workspacePath), { recursive: true });

    if (repository.localPath && (await isAccessiblePath(repository.localPath))) {
      try {
        await this.addGitWorktree(workspacePath, repository);
        const materialization: WorkspaceMaterialization = {
          strategy: "git_worktree",
          workspacePath,
          repository,
        };
        await this.emitMaterialization(materialization);
        return materialization;
      } catch (error) {
        await this.options.eventSink?.emit({
          type: "workspace.repository.worktree_failed",
          level: "warn",
          message: "Could not create repository worktree",
          payload: {
            detail: error instanceof Error ? error.message : String(error),
            repositoryId: repository.id,
            repositoryName: repository.name,
            workspacePath,
          },
        });
      }
    }

    await this.cloneRepository(workspacePath, repository);
    const materialization: WorkspaceMaterialization = {
      strategy: "git_clone",
      workspacePath,
      repository,
    };
    await this.emitMaterialization(materialization);
    return materialization;
  }

  private async addGitWorktree(
    workspacePath: string,
    repository: Pick<
      RepositorySummary,
      "id" | "name" | "url" | "defaultBranch" | "localPath"
    >,
  ): Promise<void> {
    if (!repository.localPath) {
      throw new Error(`Repository ${repository.name} does not have localPath`);
    }

    const sourceRoot = await gitOutput([
      "-C",
      repository.localPath,
      "rev-parse",
      "--show-toplevel",
    ]);
    const ref = await resolveWorktreeRef(
      sourceRoot.trim(),
      repository.defaultBranch,
    );
    await git([
      "-C",
      sourceRoot.trim(),
      "worktree",
      "add",
      "--detach",
      workspacePath,
      ref,
    ]);
  }

  private async cloneRepository(
    workspacePath: string,
    repository: Pick<
      RepositorySummary,
      "id" | "name" | "url" | "defaultBranch" | "localPath"
    >,
  ): Promise<void> {
    const repositoryUrl = repository.url?.trim();
    if (!repositoryUrl) {
      throw new Error(`Repository ${repository.name} does not have a URL`);
    }

    await git(["clone", repositoryUrl, workspacePath]);
  }

  private async emitMaterialization(
    materialization: WorkspaceMaterialization,
  ): Promise<void> {
    await this.options.eventSink?.emit({
      type: "workspace.repository.materialized",
      level: "info",
      message:
        materialization.strategy === "existing"
          ? "Reusing existing workspace"
          : "Prepared repository workspace",
      payload: {
        repository: materialization.repository,
        strategy: materialization.strategy,
        workspacePath: materialization.workspacePath,
      },
    });
  }
}

async function resolveWorktreeRef(
  sourceRoot: string,
  defaultBranch?: string,
): Promise<string> {
  const branch = defaultBranch?.trim();
  const candidates = [
    branch,
    branch ? `origin/${branch}` : undefined,
    branch ? `refs/remotes/origin/${branch}` : undefined,
    "HEAD",
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    try {
      await git([
        "-C",
        sourceRoot,
        "rev-parse",
        "--verify",
        `${candidate}^{commit}`,
      ]);
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }

  return "HEAD";
}

async function git(args: string[]): Promise<void> {
  await execFileAsync("git", args, {
    maxBuffer: 20 * 1024 * 1024,
    timeout: gitTimeoutMs,
  });
}

async function gitOutput(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    timeout: gitTimeoutMs,
  });
  return stdout;
}

async function hasDirectoryEntries(path: string): Promise<boolean> {
  try {
    const entries = await readdir(path);
    return entries.length > 0;
  } catch {
    return false;
  }
}

async function isAccessiblePath(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

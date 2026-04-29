import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { slugify, type Issue } from "@agentic-pm/core";
import type { EventSink } from "@agentic-pm/observability";

const execAsync = promisify(exec);

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
    hooks?: WorkspaceHooks;
  }): Promise<string> {
    const path = this.getIssueWorkspacePath(
      input.projectSlug,
      input.issue,
      input.repositoryName,
    );
    await mkdir(path, { recursive: true });

    if (input.hooks?.after_create) {
      await this.runHook("after_create", input.hooks.after_create, path);
    }

    if (input.hooks?.before_run) {
      await this.runHook("before_run", input.hooks.before_run, path);
    }

    return path;
  }

  async runHook(name: keyof WorkspaceHooks, command: string, cwd: string): Promise<void> {
    await this.options.eventSink?.emit({
      type: "workspace.hook.started",
      level: "info",
      message: `Running ${name} hook`,
      payload: { cwd }
    });

    const { stdout, stderr } = await execAsync(command, {
      cwd,
      env: this.options.env ?? process.env,
      timeout: this.options.hookTimeoutMs ?? 15 * 60_000
    });

    await this.options.eventSink?.emit({
      type: "workspace.hook.completed",
      level: stderr ? "warn" : "info",
      message: `${name} hook completed`,
      payload: { stdout, stderr }
    });
  }
}

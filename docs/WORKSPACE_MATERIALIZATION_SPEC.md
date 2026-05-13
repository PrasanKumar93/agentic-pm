# Workspace Materialization Spec

Status: Implemented
Date: 2026-04-29

## Goal

When a worker claims a repository-backed work item, Symphony prepares a real repository checkout before starting Codex, Cursor, fake, or generic runtimes. Agents should run inside an isolated workspace that contains the selected repository, not an empty folder.

## Inputs

The worker resolves the selected repository from:

1. `work_items.repositoryId`
2. `issues.repoRefs[0]` fallback

It passes this repository to `WorkspaceManager.prepareIssueWorkspace`:

```ts
{
  id: "repo_local",
  name: "agentic-project-management",
  url: "file:///path/to/repo",
  defaultBranch: "main",
  localPath: "/path/to/repo"
}
```

## Workspace Path

Repository-backed workspaces include the repository slug:

```text
$AGENTIC_PM_WORKSPACE_ROOT/<project-slug>/<repository-slug>/<issue-slug>
```

The resolved workspace path must be absolute before git materialization or runtime execution. This keeps `git worktree add` and the spawned agent process aligned even when the source repository's git root is above the configured repository local path.

Example:

```text
workspaces/local/agentic-project-management/local-1-add-intake-validation
```

This keeps multiple repositories in one project separated while preserving the previous issue-based workspace naming.

## Strategy

`WorkspaceManager` uses this order:

1. **Existing workspace reuse**
   - If the workspace path already has files, it is reused.
   - No clone or worktree operation runs.

2. **Local git worktree**
   - If `repository.localPath` exists and is a git repository, the manager runs:

     ```bash
     git -C <localPath> worktree add --detach <workspacePath> <ref>
     ```

   - The ref resolution tries:
     - `repository.defaultBranch`
     - `origin/<defaultBranch>`
     - `refs/remotes/origin/<defaultBranch>`
     - `HEAD`

3. **Git clone**
   - If local worktree creation is unavailable or fails, the manager runs:

     ```bash
     git clone <repository.url> <workspacePath>
     ```

4. **Empty workspace**
   - Used only when no repository is provided.

All git operations use `execFile` argument arrays, not shell string interpolation.

## Events

The workspace manager emits console sink events:

- `workspace.repository.materialized`
- `workspace.repository.worktree_failed`
- existing hook events:
  - `workspace.hook.started`
  - `workspace.hook.completed`

The worker still records the durable `run.started` event after run creation, including repository id, name, URL, default branch, and workspace path.

## Hooks

Hooks run after repository materialization:

1. materialize or reuse workspace
2. `after_create`
3. `before_run`
4. start runtime

This means `before_run` can install dependencies from the checked-out repository.

## Failure Behavior

- Worktree failure falls back to clone.
- Clone failure bubbles to the worker setup failure path.
- Setup failure marks the work item failed and records `run.setup_failed`.

## Generated Workspace Cleanup

Operators can inspect and prune old generated workspaces with:

```bash
pnpm cleanup:workspaces
pnpm cleanup:workspaces -- --apply
```

Dry-run is the default. The command scans `AGENTIC_PM_WORKSPACE_ROOT`, or
`<repo-root>/workspaces` when the env var is missing, and only treats leaf
directories at the generated workspace layout depth as candidates. A candidate
must be a git workspace whose git root is the candidate directory itself.

Safety behavior:

- Defaults to workspaces older than `7d`.
- Skips dirty git workspaces unless `--include-dirty` is passed.
- Supports `--project` and `--repository` filters using folder slugs.
- Uses `git worktree remove --force` for linked worktrees and recursive removal
  for clone fallback workspaces.
- Refuses to treat the source repo root or its parent as a generated workspace
  root.

## Pull Request Branch Policy

New PR drafts use the repository PR branch policy when present, then fall back
to env policy, then defaults:

- `pullRequest.branch.prefix` / `AGENTIC_PM_PR_BRANCH_PREFIX`: default `agent`.
- `pullRequest.branch.maxLength` / `AGENTIC_PM_PR_BRANCH_MAX_LENGTH`: default
  `120`, clamped to `32..240`.
- `pullRequest.branch.includeTimestamp` /
  `AGENTIC_PM_PR_BRANCH_INCLUDE_TIMESTAMP`: default false.

The generated branch format is
`<prefix>/<issue identifier>-<title slug>-<optional timestamp>-<run suffix>`.
Truncation preserves the unique suffix. Review change-request reruns do not
generate a new branch; they check out and push the existing branch from the
prior PR artifact.

## Acceptance

- `@agentic-pm/workspaces` test creates a throwaway git repository and verifies `prepareIssueWorkspace` materializes it as a git worktree.
- `@agentic-pm/git` tests verify default branch names and repository policy truncation.
- `pnpm cleanup:workspaces -- --json` reports candidate/skipped generated workspaces without removing them.
- `pnpm --filter @agentic-pm/workspaces test` passes.
- `pnpm typecheck` passes.
- `pnpm build` passes.

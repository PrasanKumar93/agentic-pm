# Repository Selection Spec

Status: Implemented
Date: 2026-04-29

## Goal

Operators can create a local work item against a specific managed repository. The selected repository is persisted with the work item, shown on the work board, and passed into the worker prompt/runtime path when Codex, Cursor, fake, or generic workers claim the item.

## Data Contract

- `projects.repositoryIds` records repositories managed by the project.
- `repositories` stores `RepositoryRef` records:
  - `id`
  - `projectId`
  - `name`
  - `url`
  - `defaultBranch`
  - `localPath`
  - `pullRequest`
  - `archivedAt`, `archivedBy`, and `archiveReason` when soft-archived
- `issues.repoRefs` stores the selected repository id for local intake issues.
- `work_items.repositoryId` stores the repository selected for dispatch.
- `WorkItemSummary.repository` exposes repository name, URL, default branch, and local path to the dashboard.

At API startup, the default project is ensured and a default repository is registered from environment variables only when the project has no repository records yet:

```bash
AGENTIC_PM_PROJECT_ID=project_local
AGENTIC_PM_PROJECT_SLUG=local
AGENTIC_PM_PROJECT_NAME="Local project"
AGENTIC_PM_REPOSITORY_ID=repo_local
AGENTIC_PM_REPOSITORY_NAME=agentic-project-management
AGENTIC_PM_REPOSITORY_URL=file:///path/to/repo
AGENTIC_PM_REPOSITORY_DEFAULT_BRANCH=main
AGENTIC_PM_REPOSITORY_LOCAL_PATH=/path/to/repo
```

If repository environment variables are omitted and no repository records exist, the API registers the current monorepo as a local `file://` repository.

## API

### `GET /repositories?projectId=<id>`

Returns active repository options for the project. Archived repositories stay in MongoDB for history and explicit reruns, but they are hidden from this response and cannot be selected for new local work items.

```json
{
  "data": [
    {
      "id": "repo_local",
      "projectId": "project_local",
      "name": "agentic-project-management",
      "url": "file:///repo",
      "defaultBranch": "main",
      "localPath": "/repo",
      "pullRequest": {
        "mode": "local_draft",
        "remoteName": "origin",
        "baseBranch": "main",
        "draft": true
      },
      "workItemCount": 3,
      "isDefault": true
    }
  ],
  "meta": {
    "projectId": "project_local",
    "defaultRepositoryId": "repo_local",
    "generatedAt": "2026-04-29T00:00:00.000Z"
  }
}
```

### `POST /work-items`

Creates a local tracker-backed issue and queued work item.

Request:

```json
{
  "projectId": "project_local",
  "repositoryId": "repo_local",
  "title": "Add intake validation",
  "description": "Keep validation close to the API boundary.",
  "desiredRuntime": "codex",
  "actorId": "dashboard"
}
```

Response:

```json
{
  "data": {
    "id": "work_...",
    "status": "queued",
    "desiredRuntime": "codex",
    "repository": {
      "id": "repo_local",
      "projectId": "project_local",
      "name": "agentic-project-management",
      "url": "file:///repo",
      "defaultBranch": "main",
      "localPath": "/repo",
      "pullRequest": {
        "mode": "local_draft",
        "remoteName": "origin",
        "baseBranch": "main",
        "draft": true
      }
    },
    "issue": {
      "id": "issue_...",
      "identifier": "LOCAL-1",
      "title": "Add intake validation",
      "state": "Ready for Agent"
    }
  },
  "meta": {
    "action": "work_item.create",
    "generatedAt": "2026-04-29T00:00:00.000Z"
  }
}
```

Validation:

- `title` is required and capped at 180 characters.
- `description` is optional and capped at 8,000 characters.
- `repositoryId` must match a repository in the selected project.
- `desiredRuntime` may be `default`, `codex`, `cursor`, `fake`, or `generic`.

Repository metadata and PR settings can be edited from the Config view through `PATCH /repositories/:repositoryId`; existing work items keep their `repositoryId` binding while future workspace materialization reads the latest repository settings. Repositories can also be soft-archived from the Config view with typed confirmation; archived repositories are removed from future routing/default selection but remain readable on historical work item summaries.

## Dashboard

- The work view includes a compact `New work item` panel above the board.
- The form captures title, repository, desired runtime, and description.
- On success, the dashboard redirects to the queued lane and selects the new work item.
- The work board includes a `Repo` column so routing is visible after creation.

## Worker

When a worker claims a work item:

- It resolves `work_items.repositoryId`, falling back to `issues.repoRefs[0]`.
- The workspace path includes the repository name when available.
- The `run.started` event payload includes repository id, name, URL, and default branch.
- The workflow prompt receives:
  - `repository.name`
  - `repository.url`
  - `repository.defaultBranch`

## Acceptance

- `pnpm typecheck` passes.
- `pnpm build` passes.
- `GET /repositories` returns the bootstrapped default repository.
- `POST /work-items` creates a queued local work item with a repository summary.
- The dashboard renders the intake panel and repository column in full-width view.

## Follow-Up

Repository selection now controls routing metadata, prompt context, and workspace materialization. See `WORKSPACE_MATERIALIZATION_SPEC.md` for the worktree/clone behavior used before running Codex or Cursor.

# Repository Config Spec

Status: Implemented
Date: 2026-04-30

## Goal

Operators can register managed repositories from the dashboard without editing environment variables or MongoDB directly. Registered repositories become available in the local work item intake selector and in worker-side workspace materialization.

## API

### `POST /repositories`

Registers a repository for a project.

Request:

```json
{
  "projectId": "project_local",
  "name": "agentic-project-management",
  "url": "file:///path/to/repo",
  "defaultBranch": "main",
  "localPath": "/path/to/repo",
  "pullRequest": {
    "mode": "github_draft",
    "remoteName": "origin",
    "baseBranch": "main",
    "draft": true
  },
  "actorId": "dashboard"
}
```

Behavior:

- Ensures the project exists.
- Ensures a default repository exists for the project only when it has no repository records yet.
- Creates a deterministic repository id from project id and repository name when `id` is omitted.
- Upserts the repository reference and reactivates it if the same id was previously archived.
- Appends a `repository.configured` event.
- Returns the repository option used by `GET /repositories`.

### `PATCH /repositories/:repositoryId`

Updates an existing repository for a project.

Request body matches `POST /repositories`, except the repository id is taken from the URL. The endpoint:

- Requires the repository to already exist in the selected project.
- Preserves the original `id` and `createdAt`.
- Updates name, URL, default branch, local path, and PR settings.
- Appends a `repository.configured` event with an update message.
- Returns the refreshed repository option used by `GET /repositories`.

### `POST /repositories/:repositoryId/archive`

Soft-archives an active repository for a project.

Request:

```json
{
  "projectId": "project_local",
  "confirmationName": "agentic-project-management",
  "reason": "Moved routing to test-linear-app",
  "actorId": "dashboard"
}
```

Behavior:

- Requires the repository to already exist and be active in the selected project.
- Requires `confirmationName` to exactly match the stored repository name.
- Sets `archivedAt`, `archivedBy`, and optional `archiveReason` on the repository record.
- Pulls the repository id from `projects.repositoryIds` so it is no longer a default routing candidate.
- Hides the repository from `GET /repositories`, the local intake selector, and future default routing.
- Keeps historical work items, run summaries, artifacts, and explicit worker reruns readable.
- Appends `repository.archive` to operator actions and `repository.archived` to the audit/event stream.

Validation:

- `name` is required and capped at 120 characters.
- `url` is required and capped at 2,000 characters.
- `defaultBranch` defaults to `main`.
- `localPath` is optional and capped at 2,000 characters.
- `pullRequest.mode` may be `disabled`, `local_draft`, or `github_draft`.
- `pullRequest.remoteName` defaults to `origin` in worker repository mode.
- `pullRequest.baseBranch` falls back to the repository default branch.
- `pullRequest.draft` defaults to `true`.

## Dashboard

The sidebar `Config` item now opens `?view=config`.

The Config view contains:

- repository count metrics
- a registration form for name, URL, default branch, local path, and PR settings
- managed repository cards showing id, URL, local path, default branch, PR mode, PR target, and routed work item count
- inline edit forms on each managed repository card for updating name, URL, default branch, local path, and PR settings without re-registering the repository
- typed archive controls on each managed repository card for removing a repository from future routing without deleting history

The form posts through a server action and returns an action banner on success or failure.

## Acceptance

- `pnpm typecheck` passes.
- `pnpm build` passes.
- `POST /repositories` creates a repository option for a temporary project.
- `PATCH /repositories/:repositoryId` updates an existing repository option.
- `POST /repositories/:repositoryId/archive` hides an active repository from repository options and records an audit event.
- The Config view renders in full-width dashboard QA.

## Follow-Up

- Add validation that can test local path and remote clone access before saving.

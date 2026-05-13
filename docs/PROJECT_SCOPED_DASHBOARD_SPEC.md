# Project-Scoped Dashboard Spec

Status: Draft v0.1
Date: 2026-04-29

## 1. Purpose

The dashboard must not mix unrelated local smoke runs, webhook tests, and active project work into one board by default.

Project scoping gives the operator a single selected project context. Work items, dispatch state, and webhook audit rows all follow that context.

## 2. API Contract

### List Projects

```txt
GET /projects
```

Response:

```json
{
  "data": [
    {
      "id": "project_local",
      "name": "Local project",
      "workItemCount": 0,
      "isDefault": true
    }
  ],
  "meta": {
    "defaultProjectId": "project_local",
    "generatedAt": "2026-04-29T12:00:00.000Z"
  }
}
```

Project options include the configured default project and any observed project IDs from work items, run events, operator actions, dispatch controls, or webhook deliveries.

### Scoped Work Items

```txt
GET /work-items?projectId=project_local&limit=50
```

The `projectId` query parameter scopes returned work item summaries. If it is omitted, the endpoint keeps its all-project behavior for diagnostics and scripts.

Response metadata includes:

```json
{
  "projectId": "project_local",
  "defaultProjectId": "project_local"
}
```

### Scoped Dispatch

```txt
GET /dispatch-control?projectId=project_local
POST /dispatch-control/actions/pause
```

Dispatch action body:

```json
{
  "actorId": "dashboard",
  "projectId": "project_local"
}
```

The dashboard always sends the selected project ID, so pause and resume affect
the visible project. Retry/requeue is task-level only.

### Scoped Webhook Audit

```txt
GET /webhook-deliveries?projectId=project_local&limit=50
```

The audit view uses the same selected project as the work board.

## 3. UI Behavior

The toolbar includes a project switcher showing:

- Project name
- Project ID
- Work item count per project

Switching projects preserves the current dashboard view and status filter but clears the selected work item. This avoids selecting a run from a different project.

The live-data notice includes the selected project name. Status metrics and filter counts are derived only from the selected project.

## 4. Validation

Required checks:

- `pnpm typecheck`
- `pnpm build`
- API smoke test for `/projects`
- API smoke test for `/work-items?projectId=<id>`
- Full-width browser smoke test for work and audit views

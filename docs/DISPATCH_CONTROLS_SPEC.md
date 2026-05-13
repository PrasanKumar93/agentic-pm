# Dispatch Controls Spec

Status: Draft v0.2
Date: 2026-04-29

## 1. Purpose

Dispatch controls let the operator steer the whole local project queue from the dashboard toolbar.

This is project-level control. Row-level retry/requeue actions remain in
`OPERATOR_ACTIONS_SPEC.md`.

## 2. API Contract

### Read Dispatch Control

```txt
GET /dispatch-control
```

Success response:

```json
{
  "data": {
    "projectId": "project_local",
    "paused": false,
    "createdAt": "2026-04-29T12:00:00.000Z",
    "updatedAt": "2026-04-29T12:00:00.000Z"
  },
  "meta": {
    "projectId": "project_local",
    "generatedAt": "2026-04-29T12:00:00.000Z"
  }
}
```

If no dispatch control document exists, the API returns an unpaused default.

### Perform Dispatch Action

```txt
POST /dispatch-control/actions/:action
```

Allowed `:action` values:

- `pause`
- `resume`

Request body:

```json
{
  "actorId": "dashboard",
  "reason": "optional operator note"
}
```

Success response:

```json
{
  "data": {
    "action": "pause",
    "dispatch": {
      "projectId": "project_local",
      "paused": true,
      "createdAt": "2026-04-29T12:00:00.000Z",
      "updatedAt": "2026-04-29T12:00:00.000Z"
    },
    "affectedWorkItemCount": 0,
    "message": "Dispatch paused"
  },
  "meta": {
    "action": "pause",
    "generatedAt": "2026-04-29T12:00:00.000Z"
  }
}
```

Unknown actions return `400 Bad Request`.

## 3. Behavior

### Pause Dispatch

`pause` stores `paused: true` for the project. Workers must check this before claiming queued work items.

Pausing does not stop a currently running agent session. Active cancellation belongs to the worker-side cancellation slice.

### Resume Dispatch

`resume` stores `paused: false` and clears pause metadata.

### Task-Level Recovery

Bulk project-level requeue is intentionally not exposed. Recovering `paused`,
`blocked`, `failed`, or `cancelled` work must happen from the selected work item
using row/detail actions, so an operator retries exactly one task after fixing
the underlying issue.

## 4. Auditing

Every successful dispatch action writes:

- An `operator_actions` document with action `dispatch.<action>`.
- A `run_events` document with type `dispatch.<action>`.

Event payload includes:

- `actorId`
- `reason`
- `affectedWorkItemCount`

## 5. Dashboard Behavior

The toolbar shows:

- `Refresh data` to reload the current dashboard, selected run, feedback, and PR readiness data.
- `Pause project queue` when dispatch is active.
- `Resume project queue` when dispatch is paused.

The live-data notice adds `dispatch paused` when the project is paused.

## 6. Validation

Required checks:

- `pnpm typecheck`
- `pnpm build`
- API smoke test for pause and resume
- Browser smoke test at `http://localhost:3000`

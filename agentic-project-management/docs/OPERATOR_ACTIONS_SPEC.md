# Operator Actions Spec

Status: Draft v0.1
Date: 2026-04-29

## 1. Purpose

Operator actions let a human steer the orchestration queue from the dashboard without editing MongoDB directly. This is the first control-plane slice after the live dashboard.

The MVP actions are:

- `start`: make a non-running work item dispatchable now.
- `retry`: queue a new attempt after a failed, cancelled, paused, or review-state item.
- `pause`: keep a work item out of dispatch.
- `resume`: move a paused or blocked item back to the queue.
- `cancel`: mark a work item as cancelled and cancel its active run record when present.

## 2. API Contract

### Endpoint Shape

```txt
POST /work-items/:workItemId/actions/:action
```

Allowed `:action` values:

- `start`
- `retry`
- `pause`
- `resume`
- `cancel`

### Request Body

```json
{
  "actorId": "local-operator",
  "reason": "optional operator note"
}
```

Both fields are optional. The API defaults `actorId` to `local-operator`.

### Success Response

```json
{
  "data": {
    "id": "work_123",
    "status": "queued",
    "issue": {
      "id": "issue_123",
      "identifier": "ENG-1",
      "title": "Wire the first local agent run",
      "state": "Ready for Agent"
    },
    "latestRun": {
      "id": "run_123",
      "status": "waiting_for_review",
      "agentRuntime": "fake-agent",
      "workspacePath": "workspaces/local/eng-1-wire-first-local-agent-run",
      "startedAt": "2026-04-29T12:00:00.000Z",
      "endedAt": "2026-04-29T12:01:00.000Z"
    },
    "eventCount": 6,
    "lastEvent": {
      "type": "operator.retry",
      "level": "info",
      "message": "local-operator requested retry",
      "createdAt": "2026-04-29T12:05:00.000Z"
    },
    "retryCount": 1,
    "updatedAt": "2026-04-29T12:05:00.000Z"
  },
  "meta": {
    "action": "retry",
    "generatedAt": "2026-04-29T12:05:00.000Z"
  }
}
```

### Error Response

```json
{
  "error": "Cannot retry a running work item"
}
```

Invalid state transitions return `409 Conflict`.

Unknown actions return `400 Bad Request`.

Missing work items return `404 Not Found`.

## 3. State Transitions

| Current status | start | retry | pause | resume | cancel |
| --- | --- | --- | --- | --- | --- |
| `queued` | no-op queued | no-op queued | paused | no-op queued | cancelled |
| `running` | conflict | conflict | paused | conflict | cancelled |
| `waiting_for_review` | queued | queued + retryCount | paused | conflict | cancelled |
| `blocked` | queued | queued + retryCount | paused | queued | cancelled |
| `paused` | queued | queued + retryCount | no-op paused | queued | cancelled |
| `failed` | queued | queued + retryCount | paused | conflict | cancelled |
| `cancelled` | queued | queued + retryCount | conflict | conflict | no-op cancelled |
| `completed` | conflict | conflict | conflict | conflict | conflict |

Notes:

- `retry` increments `retryCount` once.
- `start` does not increment `retryCount`; it only makes the item dispatchable.
- `cancel` updates the latest active run to `cancelled` when that run is still running/preparing/stalled/retrying.
- Long-running process termination is not handled by this API yet. The future worker-control slice will watch desired state and stop active agent processes.

## 4. Auditing

Every successful action writes:

- An `operator_actions` document.
- A `run_events` document with type `operator.<action>`.

Event payload includes:

- `actorId`
- `reason`
- `fromStatus`
- `toStatus`

## 5. Dashboard Behavior

The dashboard shows compact row-level actions:

- `queued`: pause, cancel
- `running`: pause, cancel
- `waiting_for_review`: retry, cancel
- `paused`: resume, cancel
- `blocked`: resume, cancel
- `failed`: retry, cancel
- `cancelled`: start, retry
- `completed`: no action

Action buttons submit through server-side form actions, call the API, and revalidate `/`.

## 6. Validation

Required checks:

- `pnpm typecheck`
- `pnpm build`
- API action smoke test against local MongoDB
- Browser smoke test at `http://localhost:3000`

## 7. Future Work

- Add global `start eligible`.
- Add confirmation modals for high-impact actions once real repos/PRs are connected.
- Add worker-side cancellation for active agent sessions.
- Add action to request changes and comment back to Linear.
- Add action result banners/toasts in the dashboard.

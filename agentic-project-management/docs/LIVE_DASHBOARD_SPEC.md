# Live Dashboard Spec

Status: Draft v0.5
Date: 2026-04-29

## 1. Purpose

The dashboard is the operator surface for the agentic project management system. It should show real orchestration state from the API/MongoDB layer, not static demo data.

This spec covers the first live data slice:

- API returns work items joined with issue and latest run metadata.
- API returns integration health without exposing secrets.
- Web dashboard fetches the API at request time.
- UI renders empty, error, and live-data states.
- Operator actions are submitted through server actions.
- Run artifacts include PR draft or remote PR affordances when available.
- Work board status filters are URL-backed and preserve operator context after actions.
- The Audit nav exposes recent webhook delivery attempts and replay outcomes.
- Project selection scopes work items, dispatch controls, and webhook audit rows.
- Work item runtime selection lets the operator route queued work to Codex, Cursor, fake, or generic workers.

## 2. Contract

### Endpoint

`GET /work-items?limit=50`

`GET /work-items?projectId=project_local&limit=50`

`GET /projects`

`GET /integrations/health`

`GET /webhook-deliveries?limit=50`

`GET /webhook-deliveries?projectId=project_local&limit=50`

### Response

```json
{
  "data": [
    {
      "id": "work_123",
      "status": "waiting_for_review",
      "issue": {
        "id": "issue_123",
        "identifier": "ENG-1",
        "title": "Wire the first local agent run",
        "state": "Human Review",
        "url": "https://linear.app/example/issue/ENG-1"
      },
      "latestRun": {
        "id": "run_123",
        "status": "waiting_for_review",
        "agentRuntime": "fake-agent",
        "workspacePath": "workspaces/local/eng-1-wire-first-local-agent-run",
        "startedAt": "2026-04-29T12:00:00.000Z",
        "endedAt": "2026-04-29T12:01:00.000Z"
      },
      "eventCount": 5,
      "lastEvent": {
        "type": "agent.session.completed",
        "level": "info",
        "message": "Fake agent session completed",
        "createdAt": "2026-04-29T12:01:00.000Z"
      },
      "claimedBy": "worker_local",
      "retryCount": 0,
      "updatedAt": "2026-04-29T12:01:00.000Z"
    }
  ],
  "meta": {
    "limit": 50,
    "count": 1,
    "projectId": "project_local",
    "defaultProjectId": "project_local",
    "generatedAt": "2026-04-29T12:01:05.000Z"
  }
}
```

Projects response:

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
    "generatedAt": "2026-04-29T12:01:05.000Z"
  }
}
```

Integration health response:

```json
{
  "data": {
    "tracker": {
      "kind": "linear",
      "status": "warn",
      "message": "Linear polling configured; webhook secret missing"
    },
    "linear": {
      "enabled": true,
      "status": "warn",
      "apiKeyConfigured": true,
      "teamKeyConfigured": true,
      "webhookSecretConfigured": false,
      "activeStates": ["Ready for Agent", "Changes Requested"],
      "runningState": "Agent Running",
      "reviewState": "Human Review",
      "failureState": "Changes Requested",
      "doneState": "Done",
      "cancelledState": "Cancelled"
    }
  }
}
```

Webhook delivery response:

```json
{
  "data": [
    {
      "id": "whd_123",
      "projectId": "project_local",
      "provider": "linear",
      "deliveryId": "linear-delivery-id",
      "event": "Issue",
      "action": "update",
      "type": "Issue",
      "status": "processed",
      "result": {
        "status": "reconciled",
        "issueIdentifier": "ENG-1",
        "state": "Ready for Agent",
        "workItemId": "work_123"
      },
      "attemptCount": 2,
      "firstReceivedAt": "2026-04-29T12:00:00.000Z",
      "lastReceivedAt": "2026-04-29T12:00:10.000Z",
      "processedAt": "2026-04-29T12:00:01.000Z",
      "createdAt": "2026-04-29T12:00:00.000Z",
      "updatedAt": "2026-04-29T12:00:10.000Z"
    }
  ],
  "meta": {
    "limit": 50,
    "projectId": "all",
    "generatedAt": "2026-04-29T12:01:05.000Z"
  }
}
```

## 3. UI Behavior

### Metrics

The metrics cards are derived from returned work items:

- `Queued`: `status === "queued"`
- `Running`: `status === "running"`
- `Paused`: `status === "paused"`
- `Review`: `status === "waiting_for_review"`
- `Blocked`: `status === "blocked"`

### Integration Health

The topbar shows a compact tracker health badge:

- `ok`: fake tracker, or Linear polling and webhook config are present.
- `warn`: Linear polling config is present but webhook secret is missing.
- `error`: required Linear polling config is missing or the health endpoint is unavailable.

The badge never renders API keys or secrets; it only shows configured/missing booleans and state names.

### Project Selector

The toolbar project switcher lists the configured default project plus observed project IDs from local orchestration data.

Selecting a project writes `?projectId=<id>` to the URL and scopes:

- Work item rows and metrics
- Dispatch control state and actions
- Webhook audit rows

Switching projects preserves the active view and status filter, but clears the selected work item.

### Work Board

The work board exposes status filter tabs backed by `?projectId=<project_id>&status=<work_item_status>`. Supported filters are:

- `all`
- `queued`
- `running`
- `waiting_for_review`
- `paused`
- `blocked`
- `failed`
- `completed`
- `cancelled`

Each tab shows the count from the selected project's `/work-items` response. Filtering is applied in the dashboard render, so metrics remain selected-project totals while the table narrows to the selected lane.

Each row shows:

- Issue identifier
- Issue title
- Work item status
- Desired runtime selector
- Claimed worker or `unclaimed`
- Relative updated time
- An inspect action that selects the row for the run detail panel via `?workItemId=<id>`

Inspect links preserve the active status filter. Dashboard action redirects preserve the active filter and selected work item when possible.

Runtime selector submissions also preserve the active project, status filter, and selected work item.

If no work items exist, show an empty state that tells the operator to run the worker or connect a tracker.

### Run Detail

The run detail panel uses `?workItemId=<id>` when present. Without an explicit selection, it uses the first non-terminal/high-priority row, falling back to the newest row.

It shows:

- Issue identifier and runtime
- Workspace path
- Run status
- Manual merge gate policy
- Last event message
- Event count
- Latest run event timeline, newest-first and scrollable for long runs
- Latest run artifacts, scrollable when many proof files are captured

For artifact rows, the dashboard exposes readable proof files:

- `Open PR` when artifact metadata contains a remote GitHub PR URL.
- `Open draft` when the artifact is a local draft; the link opens `GET /artifacts/:artifactId/content`.
- `Open log`, `Open patch`, `Open report`, `Open packet`, or `Open plan` for other readable local text artifacts.

If no work item is selected, show a quiet empty state.

### Audit View

The sidebar Audit nav opens `?projectId=<project_id>&view=audit`.

The audit view shows:

- Recent `webhook_deliveries` rows for the selected project.
- Counts for deliveries, replayed deliveries, failures, and processing deliveries.
- Delivery id, provider, event, action, delivery status, attempt count, normalization result, and relative receive/process times.

The view is read-only. It does not delete, replay, or mutate webhook data.

### Error State

If the API cannot be reached, the dashboard should still render and show:

- Zeroed metrics
- Empty table
- A concise connection notice

## 4. Non-Goals

This slice does not implement:

- Live streaming logs.
- Authentication.

Operator actions are covered in `OPERATOR_ACTIONS_SPEC.md`.
Run event timeline behavior is covered in `RUN_DETAIL_TIMELINE_SPEC.md`.

## 5. Validation

Required checks:

- `pnpm typecheck`
- `pnpm build`
- API health smoke test
- Worker fake one-shot smoke test
- Browser smoke test at `http://localhost:3000`

## 6. Next Spec Slices

- `OPERATOR_ACTIONS_SPEC.md`: retry, cancel, pause, resume, start-now endpoints.
- `RUN_DETAIL_TIMELINE_SPEC.md`: selected run event timeline and failure states.
- `LINEAR_INTEGRATION_SPEC.md`: Linear setup, webhook security, state transitions, comments.
- `RUN_EVENTS_SPEC.md`: event streaming, pagination, and artifact drill-down.

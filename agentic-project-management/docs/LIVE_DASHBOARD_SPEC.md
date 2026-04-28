# Live Dashboard Spec

Status: Draft v0.1
Date: 2026-04-29

## 1. Purpose

The dashboard is the operator surface for the agentic project management system. It should show real orchestration state from the API/MongoDB layer, not static demo data.

This spec covers the first live data slice:

- API returns work items joined with issue and latest run metadata.
- Web dashboard fetches the API at request time.
- UI renders empty, error, and live-data states.
- Operator actions remain visually present but disabled until action endpoints are implemented.

## 2. Contract

### Endpoint

`GET /work-items?limit=50`

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
    "generatedAt": "2026-04-29T12:01:05.000Z"
  }
}
```

## 3. UI Behavior

### Metrics

The metrics cards are derived from returned work items:

- `Queued`: `status === "queued"`
- `Running`: `status === "running"`
- `Review`: `status === "waiting_for_review"`
- `Blocked`: `status === "blocked"`

### Work Board

Each row shows:

- Issue identifier
- Issue title
- Work item status
- Claimed worker or `unclaimed`
- Relative updated time

If no work items exist, show an empty state that tells the operator to run the worker or connect a tracker.

### Run Detail

The run detail panel uses the first non-terminal/high-priority row, falling back to the newest row.

It shows:

- Issue identifier and runtime
- Workspace path
- Run status
- Manual merge gate policy
- Last event message
- Event count

If no work item is selected, show a quiet empty state.

### Error State

If the API cannot be reached, the dashboard should still render and show:

- Zeroed metrics
- Empty table
- A concise connection notice

## 4. Non-Goals

This slice does not implement:

- Operator actions such as retry/cancel/start.
- Live streaming logs.
- Authentication.
- Full run-event drill-down.
- Linear webhook signature verification.

## 5. Validation

Required checks:

- `pnpm typecheck`
- `pnpm build`
- API health smoke test
- Worker fake one-shot smoke test
- Browser smoke test at `http://localhost:3000`

## 6. Next Spec Slices

- `OPERATOR_ACTIONS_SPEC.md`: retry, cancel, pause, resume, start-now endpoints.
- `LINEAR_INTEGRATION_SPEC.md`: webhook security, state transitions, comments.
- `RUN_EVENTS_SPEC.md`: event streaming, pagination, and artifact drill-down.

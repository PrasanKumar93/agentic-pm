# Run Detail Timeline Spec

Status: Draft v0.1
Date: 2026-04-29

## 1. Purpose

The run detail timeline gives the operator a compact explanation of what the selected agent run has done, without opening MongoDB or tailing a worker process.

This slice is read-only. It does not stream yet; it fetches the latest event list whenever the dashboard is rendered or refreshed.

## 2. API Contract

### Endpoint Shape

```txt
GET /runs/:runId/events
```

### Success Response

```json
{
  "data": [
    {
      "id": "evt_123",
      "projectId": "project_local",
      "workItemId": "work_123",
      "runId": "run_123",
      "type": "agent.stdout",
      "level": "info",
      "message": "Fake agent completed review packet",
      "createdAt": "2026-04-29T12:00:00.000Z"
    }
  ]
}
```

Events are returned in ascending `createdAt` order from the repository. The dashboard renders the latest eight events newest-first.

## 3. Dashboard Behavior

The selected run is the same run shown in the detail panel:

- Prefer a running work item.
- Otherwise prefer a work item waiting for review.
- Otherwise use the first work item in the board.

When the selected work item has a latest run, the dashboard fetches `/runs/:runId/events` and shows:

- Event type.
- Relative event time.
- Event message.
- Event level.

If the event API fails, the panel keeps the rest of the run detail visible and shows a scoped timeline error.

## 4. Future Work

- Add event pagination once long runs produce large logs.
- Add live streaming with Server-Sent Events or WebSocket fanout.
- Add event filters for agent output, tracker transitions, policy checks, and artifacts.
- Link timeline events to artifacts and workspace files.

## 5. Validation

Required checks:

- `pnpm typecheck`
- `pnpm build`
- Browser smoke test at `http://localhost:3000`

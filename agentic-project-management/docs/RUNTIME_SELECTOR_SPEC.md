# Runtime Selector Spec

Status: Draft v0.1
Date: 2026-04-29

## 1. Purpose

Symphony should route work to Codex, Cursor, or another runtime intentionally instead of relying only on one global worker setting.

This slice adds a per-work-item desired runtime. It is the first intake control before a fuller task creation form exists.

## 2. Data Model

`work_items.desiredRuntime` is optional.

Allowed values:

- `codex`
- `cursor`
- `fake`
- `generic`

When the field is missing, the work item is unassigned and can be claimed by any compatible worker for that project.

## 3. API Contract

### Set Runtime Preference

```txt
POST /work-items/:workItemId/runtime
```

Request body:

```json
{
  "actorId": "dashboard",
  "desiredRuntime": "codex"
}
```

Use `desiredRuntime: "default"` or omit the value to clear the preference.

Success returns the updated work item summary. Unknown values return `400 Bad Request`. Running work items return `409 Conflict` because runtime changes only affect future dispatch.

## 4. Worker Behavior

Each worker still starts with one configured runtime:

```txt
AGENT_RUNTIME=codex
AGENT_RUNTIME=cursor
AGENT_RUNTIME=fake
```

When claiming queued work, the worker can claim:

- Work items with no `desiredRuntime`
- Work items whose `desiredRuntime` matches the worker runtime kind

Examples:

- A Codex worker claims `desiredRuntime: "codex"` and unassigned items.
- A Cursor worker claims `desiredRuntime: "cursor"` and unassigned items.
- A fake worker claims `desiredRuntime: "fake"` and unassigned items.

This supports running separate Codex and Cursor workers side by side without mixing explicitly routed work.

## 5. Dashboard Behavior

The work board shows a runtime menu for each non-running work item:

- Default
- Codex
- Cursor
- Fake
- Generic

Saving the menu writes an operator action and an `operator.runtime_selected` event.

The runtime selector preserves the active project, status filter, and selected work item.

## 6. Validation

Required checks:

- `pnpm typecheck`
- `pnpm build`
- API smoke test for setting and clearing runtime preference
- Full-width browser smoke test for the work board

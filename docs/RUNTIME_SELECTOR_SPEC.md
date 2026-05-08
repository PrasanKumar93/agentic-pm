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

When a claimed work item has no `repositoryId` and the issue has no repository reference, the worker falls back to the selected project's default repository and persists that assignment before creating the workspace. This keeps older tracker-ingested work items from running in empty workspaces.

## 5. Codex Generated Workspace Policy

Codex runs in headless `exec` mode. For repository-backed generated worktrees, Symphony must make the selected workspace both the current workspace root and an allowed writable directory:

```txt
codex --ask-for-approval never exec --add-dir <workspacePath> --cd <workspacePath> --sandbox workspace-write --json -
```

Workspace and sandbox flags are injected after `exec` because Codex CLI `0.110.0` honored that shape for nested noninteractive runs. Local smoke testing showed top-level `--sandbox workspace-write` could still produce a read-only nested turn, even though the visible command looked correct.

The runtime adapter must not duplicate explicit operator-supplied `--cd`, `-C`, or `--add-dir` arguments. If an operator supplies those flags in `CODEX_ARGS`, Symphony preserves the operator's values and normalizes old top-level workspace/sandbox flags onto the `exec` side.

`danger-full-access` is not the default resolution for write failures. It should only be used in an externally sandboxed environment and after explicit operator approval. The current safe target is `workspace-write` plus explicit generated workspace roots.

Known local result as of 2026-05-08: the repeatable Codex auth/write smoke passes after moving `--sandbox`, `--add-dir`, and `--cd` to `exec` options. The remaining `~/.codex/state_5.sqlite` migration warning is noisy but no longer blocks workspace writes.

## 6. Dashboard Behavior

The work board shows a runtime menu for each non-running work item:

- Default
- Codex
- Cursor
- Fake
- Generic

Saving the menu writes an operator action and an `operator.runtime_selected` event.

The runtime selector preserves the active project, status filter, and selected work item.

## 7. Validation

Required checks:

- `pnpm typecheck`
- `pnpm build`
- API smoke test for setting and clearing runtime preference
- Full-width browser smoke test for the work board
- `pnpm --filter @agentic-pm/agents test` for Codex argument builder coverage

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
codex --ask-for-approval never --sandbox workspace-write --add-dir <workspacePath> --cd <workspacePath> exec --json -
```

Both workspace flags are injected before `exec` because the Codex CLI accepts them as top-level options and as `exec` options. Keeping them before `exec` preserves one stable command shape for preflight visibility and runtime events.

The runtime adapter must not duplicate explicit operator-supplied `--cd`, `-C`, or `--add-dir` arguments. If an operator supplies those flags in `CODEX_ARGS`, Symphony preserves the operator's values.

`danger-full-access` is not the default resolution for write failures. It should only be used in an externally sandboxed environment and after explicit operator approval. The current safe target is `workspace-write` plus explicit generated workspace roots.

Known local blocker as of 2026-05-07: live Linear issue `PRA-9` received the corrected command shape but Codex still reported `touch package.json` as `Operation not permitted` in the generated `test-linear-app` worktree. Direct `codex sandbox macos --full-auto touch ...` can write in that same worktree when launched outside the parent chat/tool sandbox, so the workspace path and base Codex sandbox policy are not enough to explain the failure. A direct `codex exec` smoke using the current project `.env` plus Symphony's `OPENAI_API_KEY -> CODEX_API_KEY` bridge returned a 401 invalid API key. The next slice should add a repeatable auth/write smoke and validate the configured Codex credential path before retrying `PRA-9`, without weakening the default policy to `danger-full-access`.

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

# PR Manual Gate Spec

Status: Draft v0.1
Date: 2026-04-29

## 1. Purpose

Successful agent runs should produce reviewable PR evidence, but Symphony must not merge code automatically in the MVP. The worker creates a local PR draft artifact when a completed workspace is a git repository with changes, and the dashboard exposes a manual completion action for the human reviewer.

## 2. Scope

Covered:

- Detect changed git workspaces after successful runs.
- Create a `pr` artifact named `pull-request.md`.
- Include suggested branch, commit, push, and `gh pr create --draft` commands.
- Keep merge manual by policy.
- Let an operator mark a `waiting_for_review` work item as `completed` after external review/merge.

Not covered:

- Pushing branches automatically.
- Creating remote GitHub pull requests automatically.
- Reading CI status.
- Auto-merging.

## 3. Worker Behavior

When a run succeeds, artifact capture order is:

1. `agent-events.log`
2. `workspace.patch`, when the workspace is a git root with a diff
3. `pull-request.md`, when the workspace is a git root with changed files and `AGENTIC_PM_PR_MODE` is not `disabled`
4. `review-packet.md`

The `pr` artifact metadata includes:

- `mode: "local_draft"`
- `mergeGate: "manual"`
- `branchName`
- `baseBranch`
- `changedFiles`
- `remoteUrl`, when present

## 4. Manual Gate

The dashboard shows a manual merge gate for review-state runs. The `complete` operator action is allowed only when a work item is `waiting_for_review`.

The action:

- Marks the work item `completed`.
- Marks the latest review-state run `completed`.
- Writes an `operator.complete` event.
- Does not merge code.

## 5. Configuration

```env
AGENTIC_PM_PR_MODE=local_draft
```

Set `AGENTIC_PM_PR_MODE=disabled` to skip PR draft artifact generation.

## 6. Validation

Required checks:

- `pnpm typecheck`
- `pnpm build`
- Local git helper smoke test with a temporary repository
- API `complete` action smoke test against a review-state work item
- Dashboard smoke test at `http://localhost:3000`

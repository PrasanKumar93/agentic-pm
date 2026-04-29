# PR Manual Gate Spec

Status: Draft v0.2
Date: 2026-04-29

## 1. Purpose

Successful agent runs should produce reviewable PR evidence, but Symphony must not merge code automatically in the MVP. The worker creates a local PR draft artifact when a completed workspace is a git repository with changes. When explicitly configured, it can also push an agent branch and create a draft GitHub PR with `gh pr create`. The dashboard exposes a manual completion action for the human reviewer.

## 2. Scope

Covered:

- Detect changed git workspaces after successful runs.
- Create a `pr` artifact named `pull-request.md`.
- Include suggested branch, commit, push, and `gh pr create --draft` commands.
- Optionally create a remote GitHub draft PR after explicit project configuration.
- Keep merge manual by policy.
- Let an operator mark a `waiting_for_review` work item as `completed` after external review/merge.

Not covered:

- Reading CI status.
- Auto-merging.

## 3. Worker Behavior

When a run succeeds, artifact capture order is:

1. `agent-events.log`
2. `workspace.patch`, when the workspace is a git root with a diff
3. `pull-request.md`, when the workspace is a git root with changed files and `AGENTIC_PM_PR_MODE` is not `disabled`
4. `review-packet.md`

The `pr` artifact metadata includes:

- `mode: "local_draft"` or `mode: "github_draft"`
- `mergeGate: "manual"`
- `branchName`
- `baseBranch`
- `changedFiles`
- `remoteUrl`, when present
- `remoteStatus`, when GitHub PR creation is requested
- `remotePrUrl`, when GitHub PR creation succeeds and `gh` returns a URL

## 4. GitHub Draft PR Mode

Set:

```env
AGENTIC_PM_PR_MODE=github_draft
AGENTIC_PM_GITHUB_REMOTE=origin
AGENTIC_PM_GITHUB_BASE_BRANCH=main
AGENTIC_PM_GITHUB_PR_DRAFT=true
AGENTIC_PM_GH_COMMAND=gh
```

The worker will:

1. Create an agent branch from the current workspace HEAD.
2. Stage all workspace changes.
3. Commit with `<issue identifier>: <issue title>`.
4. Push the branch to `AGENTIC_PM_GITHUB_REMOTE`.
5. Run `gh pr create --draft --base <base> --head <agent branch>`.
6. Emit `github.pr.created` on success.
7. Still write `pull-request.md` as the durable artifact.

If remote config is missing or `gh` fails, the run still moves to review and the worker records `github.pr.create_skipped` or `github.pr.create_failed`. This keeps local Symphony state authoritative during GitHub outages or auth problems.

## 5. Manual Gate

The dashboard shows a manual merge gate for review-state runs. The `complete` operator action is allowed only when a work item is `waiting_for_review`.

The action:

- Marks the work item `completed`.
- Marks the latest review-state run `completed`.
- Writes an `operator.complete` event.
- Does not merge code.

## 6. Configuration

```env
AGENTIC_PM_PR_MODE=local_draft
```

Set `AGENTIC_PM_PR_MODE=disabled` to skip PR draft artifact generation.

`github_draft` mode requires `AGENTIC_PM_GITHUB_REMOTE`; `AGENTIC_PM_GITHUB_BASE_BRANCH` is optional and defaults to the current workspace branch.

## 7. Validation

Required checks:

- `pnpm typecheck`
- `pnpm build`
- Local git helper smoke test with a temporary repository
- Local GitHub PR creation smoke test with a temporary bare remote and a fake `gh` command
- API `complete` action smoke test against a review-state work item
- Dashboard smoke test at `http://localhost:3000`

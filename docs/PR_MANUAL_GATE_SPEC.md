# PR Manual Gate Spec

Status: Draft v0.7
Date: 2026-04-30

## 1. Purpose

Successful agent runs should produce reviewable PR evidence, but Symphony must not merge code automatically in the MVP. The worker creates a local PR draft artifact when a completed workspace is a git repository with changes. When explicitly configured, it can also push an agent branch and create a draft GitHub PR with `gh pr create`. The dashboard exposes a manual completion action for the human reviewer.

## 2. Scope

Covered:

- Detect changed git workspaces after successful runs.
- Create a `pr` artifact named `pull-request.md`.
- Include suggested branch, commit, push, and `gh pr create --draft` commands.
- Optionally create a remote GitHub draft PR after explicit project configuration.
- Link a manually created GitHub PR URL back to a local PR artifact.
- Request PR changes from the dashboard and rerun Codex/Cursor on the existing PR branch.
- Capture and push review follow-ups even when the runtime self-commits and leaves no working-tree diff.
- Persist and display review feedback history for multi-turn PR review loops.
- Keep merge manual by policy.
- Surface local PR drafts or remote PR URLs from the dashboard run detail panel.
- Let an operator mark a `waiting_for_review` work item as `completed` after external review/merge.
- Track the next review-loop slice: rerun an agent on an existing PR branch after human review feedback.

Not covered:

- Reading CI status.
- Auto-merging.

## 3. Worker Behavior

When a run succeeds, artifact capture order is:

1. `agent-events.log`
2. `workspace.patch`, when the workspace is a git root with a diff
3. `pull-request.md`, when the workspace is a git root with changed files, or when a review-change run has advanced HEAD beyond the previous PR artifact commit, and `AGENTIC_PM_PR_MODE` is not `disabled`
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
- `baseCommitSha`, for review-change runs that compare against a previous PR artifact commit
- `changeSource: "working_tree"` or `"committed_range"`
- `reviewChangeRequest: true`, when the artifact came from a follow-up review run

## 4. GitHub Draft PR Mode

Prefer configuring PR mode on the managed repository from the Config view. A repository may store:

```json
{
  "pullRequest": {
    "mode": "github_draft",
    "remoteName": "origin",
    "baseBranch": "main",
    "draft": true
  }
}
```

When a repository has PR settings, the worker uses those settings for that work item. If the repository has no PR settings, the worker falls back to environment variables:

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

If remote config is missing or `gh` fails, the run still moves to review and the worker records `github.pr.create_skipped` or `github.pr.create_failed`. This keeps local Symphony state authoritative during GitHub outages or auth problems. PR artifact metadata records `pullRequestConfigSource` as `repository` or `env`.

## 5. Manual Gate

The dashboard shows a manual merge gate for review-state runs. The `complete` operator action is allowed only when a work item is `waiting_for_review`.

The selected run artifact list exposes PR review evidence:

- Local-only PR artifacts open `GET /artifacts/:artifactId/content`.
- GitHub draft PR artifacts with `metadata.remotePrUrl` open the remote pull request.
- Local PR artifacts without `metadata.remotePrUrl` expose a compact PR URL link form in the dashboard.
- Review-state work items show a Feedback history section above artifacts. It lists persisted reviewer feedback turns with runtime, actor, branch, base commit, and submitted feedback text.

Manual PR linking uses:

```http
POST /artifacts/:artifactId/link-pr
```

with:

```json
{
  "actorId": "dashboard",
  "remoteName": "origin",
  "remotePrUrl": "https://github.com/org/repo/pull/123"
}
```

The API validates that the artifact exists, is type `pr`, and receives an `http(s)` URL. It stores `metadata.remotePrUrl`, `metadata.remoteStatus: "linked"`, `metadata.linkedManually: true`, and emits a `github.pr.linked` run event.

The action:

- Marks the work item `completed`.
- Marks the latest review-state run `completed`.
- Writes an `operator.complete` event.
- Does not merge code.

## 6. Review Change Requests

1. Human reviews a PR or artifact and finds a bug.
2. Operator writes review feedback in the run detail panel and chooses the runtime for the follow-up.
3. Dashboard posts:

```http
POST /work-items/:workItemId/actions/request_changes
```

with:

```json
{
  "actorId": "dashboard",
  "desiredRuntime": "codex",
  "feedback": "Fix the failing health check in restricted OS environments."
}
```

4. The API requires a `waiting_for_review` work item with a prior `pr` artifact containing branch metadata. It prefers the newest run, but falls back to the newest usable earlier PR artifact if the latest run did not capture one.
5. Symphony stores `workItem.reviewRequest` with reviewer feedback, base run id, previous PR artifact commit, branch name, remote name, remote PR URL, and preferred runtime.
6. The work item is queued again and, for Linear, the operator action syncs the issue back to the active state.
7. Worker checks out the existing PR branch, reruns the selected runtime with review feedback appended to the prompt, and keeps the same manual merge gate.
8. In `github_draft` mode, the worker commits and pushes a follow-up commit to the same PR branch instead of creating a new PR. If the runtime already committed the follow-up, Symphony detects that HEAD advanced from `baseCommitSha` and pushes that existing commit.
9. Symphony records `github.pr.updated`, captures refreshed patch/PR/review artifacts, and comments back to Linear.

This is intentionally separate from the initial PR creation path. Initial PR creation owns branch creation and `gh pr create`; review-change reruns own explicit branch reuse, feedback capture, and artifact refresh semantics.

Review feedback history is stored as `operator_actions` rows with `action: "request_changes"` and is exposed through:

```http
GET /work-items/:workItemId/review-feedback?limit=20
```

The endpoint returns newest-first feedback summaries. The dashboard uses it to show the full multi-turn review history even when the latest run log is dominated by agent/runtime events.

## 7. Configuration

```env
AGENTIC_PM_PR_MODE=local_draft
```

Set `AGENTIC_PM_PR_MODE=disabled` to skip PR draft artifact generation.

`github_draft` mode requires `AGENTIC_PM_GITHUB_REMOTE`; `AGENTIC_PM_GITHUB_BASE_BRANCH` is optional and defaults to the current workspace branch.

## 8. Validation

Required checks:

- `pnpm typecheck`
- `pnpm build`
- Local git helper smoke test with a temporary repository
- Local GitHub PR creation smoke test with a temporary bare remote and a fake `gh` command
- Git helper smoke test for checkout + follow-up commit push to an existing PR branch
- API `complete` action smoke test against a review-state work item
- Dashboard smoke test at `http://localhost:3000`

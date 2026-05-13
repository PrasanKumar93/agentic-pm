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
- Fetch and display remote GitHub PR readiness for linked PR artifacts.
- Gate visible dashboard completion with PR readiness evidence.
- Keep merge manual by policy.
- Surface local PR drafts or remote PR URLs from the dashboard run detail panel.
- Let an operator mark a `waiting_for_review` work item as `completed` after external review/merge.
- Track the next review-loop slice: rerun an agent on an existing PR branch after human review feedback.

Not covered:

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
    "draft": true,
    "branch": {
      "prefix": "agent",
      "maxLength": 120,
      "includeTimestamp": false
    }
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
AGENTIC_PM_PR_BRANCH_PREFIX=agent
AGENTIC_PM_PR_BRANCH_MAX_LENGTH=120
AGENTIC_PM_PR_BRANCH_INCLUDE_TIMESTAMP=false
```

The worker will:

1. Create an agent branch from the current workspace HEAD.
2. Stage all workspace changes.
3. Commit with `<issue identifier>: <issue title>`.
4. Push the branch to `AGENTIC_PM_GITHUB_REMOTE`.
5. Run `gh pr create --draft --base <base> --head <agent branch>`.
6. Emit `github.pr.created` on success.
7. Still write `pull-request.md` as the durable artifact.

Before creating or updating a remote PR, Symphony must verify the PR branch can
merge cleanly with the configured base branch. The worker fetches the latest
remote base and runs a non-mutating `git merge-tree --write-tree` check. On a
review-change run, if that check reports conflicts, the worker prepares a real
non-committed merge so conflict markers are present in the workspace, runs one
agent turn with a conflict-resolution prompt, commits the resolved files, and
re-checks mergeability before pushing the PR branch. If the agent cannot resolve
the conflicts, the work item is marked `blocked`, the run records
`github.pr.merge_conflict` / `run.blocked`, and Symphony does not move the issue
to review-ready. The human still owns the final merge, but the PR handoff should
not ask the human to resolve avoidable conflicts.

If remote config is missing or `gh` fails, the run still moves to review and the worker records `github.pr.create_skipped` or `github.pr.create_failed`. This keeps local Symphony state authoritative during GitHub outages or auth problems. PR artifact metadata records `pullRequestConfigSource` as `repository` or `env`.

Branch names default to `agent/<issue>-<title slug>-<run suffix>`. Repository PR settings can override the prefix, clamp the maximum branch length, and optionally include a timestamp before the run suffix. Review change requests keep using the existing PR branch recorded in the prior PR artifact.

## 5. Manual Gate

The dashboard shows a manual merge gate for review-state runs. The `complete` operator action is allowed only when a work item is `waiting_for_review`.

The selected run artifact list exposes PR review evidence:

- Local-only PR artifacts open `GET /artifacts/:artifactId/content`.
- GitHub draft PR artifacts with `metadata.remotePrUrl` open the remote pull request.
- Local PR artifacts without `metadata.remotePrUrl` expose a compact PR URL link form in the dashboard.
- Review-state work items with a prior PR branch expose an `Update / Resolve Conflicts` quick action. It submits the standard feedback text through the same `request_changes` action as the free-form review textbox, so the turn is audited, visible in feedback history, and reruns the agent on the same PR branch. The review loop is sequential: while a follow-up request is queued or running, the dashboard shows a progress notice and restores the request controls once the work item returns to review.
- Review-state work items show a Feedback history section above artifacts. It lists persisted reviewer feedback turns with runtime, actor, branch, base commit, and submitted feedback text.
- Linked GitHub PR artifacts show a read-only readiness card with PR state, draft/mergeability, review summary, check summary, and blocker/pending reasons. Unknown readiness keeps the state label as `Unknown`; provider errors such as GitHub rate limits are exposed through the badge info tooltip instead of as primary state text.
- Linked GitHub PR readiness also shows the checked head commit and freshness of the readiness fetch, so follow-up review commits on the same PR branch are visible in Symphony.
- The review-state `complete` action is exposed from a Manual completion card in run detail, not as an icon-only work-board quick action.
- Linked GitHub PRs enable `Mark complete` only when readiness is `ready`, including already merged PRs. Blocked, pending, unknown, or missing PR evidence keeps visible completion disabled and shows a concrete next step. Draft-only PRs point the reviewer to GitHub/manual review actions, merge-conflicted PRs point to `Update / Resolve Conflicts`, and review/check blockers point to the same-PR feedback loop. Local-only PR artifacts can still be completed after explicit manual review because no remote readiness exists.

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

GitHub readiness uses:

```http
GET /artifacts/:artifactId/pr-status
```

The endpoint is intentionally read-only. It can use `AGENTIC_PM_GITHUB_TOKEN`, `AGENTIC_PM_GITHUB_API_TOKEN`, `GITHUB_TOKEN`, or `GH_TOKEN` for private repositories or higher rate limits, but token values are never returned to the dashboard.

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
8. In `github_draft` mode, the worker commits and verifies the branch is conflict-free with the configured base, then pushes a follow-up commit to the same PR branch instead of creating a new PR. If the branch conflicts with the latest base, Symphony runs one automatic conflict-resolution agent turn, commits the resolution, re-checks mergeability, and only then pushes. If the runtime already committed the follow-up, Symphony detects that HEAD advanced from `baseCommitSha` and pushes that existing commit.
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

Env branch policy fallback is optional:

```env
AGENTIC_PM_PR_BRANCH_PREFIX=agent
AGENTIC_PM_PR_BRANCH_MAX_LENGTH=120
AGENTIC_PM_PR_BRANCH_INCLUDE_TIMESTAMP=false
```

## 8. Validation

Required checks:

- `pnpm typecheck`
- `pnpm build`
- Local git helper smoke test with a temporary repository
- Local GitHub PR creation smoke test with a temporary bare remote and a fake `gh` command
- Git helper smoke test for checkout + follow-up commit push to an existing PR branch
- API `complete` action smoke test against a review-state work item
- Dashboard smoke test at `http://localhost:3000`

Live validation evidence:

- `PRA-9` on `project_linear_live_smoke` created `test-linear-app` draft PR #4 after the Codex `workspace-write` arg normalization. Run `run_acf6b3c5ec394304` captured log, patch, PR, and review packet artifacts; the PR artifact points to `https://github.com/PrasanKumar93/test-linear-app/pull/4` and branch `agent/pra-9-codex-webhook-smoke-add-status-cli-2026-05-07t17-59-52-ec394304`.
- A same-PR Codex review-change request on `PRA-9` stored reviewer feedback, synced Linear back to `Todo`, checked out the existing PR branch, pushed follow-up commit `2046ad79395e1af842833533a180b0698cf16a07`, recorded `github.pr.updated`, refreshed PR artifact `art_fe8d4b9f451e4961`, and returned Linear to `In Review`.

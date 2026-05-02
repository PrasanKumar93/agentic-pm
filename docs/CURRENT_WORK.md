# Current Work

Status: Living tracker
Date: 2026-04-30

## How Work Is Tracked

- `docs/MVP_CHECKLIST.md` is the milestone acceptance checklist.
- `docs/CURRENT_WORK.md` is the active queue: what is done, in progress, and next.
- Slice specs define behavior before or alongside implementation.
- Commits are made at working vertical slices.

## Completed Slices

- Monorepo skeleton with TypeScript packages and apps.
- MongoDB repository layer and local Docker Compose.
- Worker loop with fake tracker, fake runtime, workspace creation, and run events.
- Live dashboard backed by `/work-items`.
- Row-level operator actions for start, retry, pause, resume, and cancel.
- Run detail timeline backed by `/runs/:runId/events`.
- Dispatch controls for project-level pause/resume and start eligible.
- Worker-side cancellation checks for active agent sessions.
- Linear webhook signature validation and setup guide.
- Action result banners in the dashboard.
- Hardened CLI runtime adapter and runtime portability spec.
- Local artifact capture for logs, patches, and review packets.
- First-class Cursor Agent CLI runtime mode.
- Runtime startup preflight for Codex and Cursor.
- Cursor `stream-json` parsing into sanitized runtime events.
- Codex `exec --json` defaults and sanitized JSONL parsing.
- Project-scoped work item uniqueness for multi-project smoke runs.
- Real Codex worker smoke test with `CODEX_API_KEY` env bridging, explicit model, explicit reasoning effort, persisted run events, and review packet capture.
- Real Cursor Agent CLI worker smoke test with stream-json parsing, sandboxed/trusted generated workspace, persisted run events, and review packet capture.
- Local PR draft artifact generation and manual `complete` gate for review-state work items.
- Linear polling/upsert, tracker state sync events, local issue-state updates, failure-state fallback, and run start/failure/review comments.
- Runtime stderr severity normalization for known CLI warnings.
- Remote GitHub draft PR creation through `gh pr create` after explicit project configuration.
- Dashboard health badge for tracker and Linear webhook configuration.
- Operator action tracker sync for Linear cancel and complete states.
- PR artifact dashboard affordance for selecting a run and opening a local draft or remote PR URL.
- Verified Linear issue webhook normalization into MongoDB with active-state work item creation.
- Linear webhook delivery-id idempotency with duplicate audit events.
- Dashboard filter tabs for status lanes.
- Webhook replay audit view in the dashboard.
- Dry-run-first local cleanup command for smoke/test MongoDB data.
- Project-scoped dashboard filtering for work, dispatch, and webhook audit views.
- Per-work-item runtime selector for Codex, Cursor, fake, and generic worker routing.
- Repository-backed local work item intake with dashboard repository selection.
- Repository-aware workspace materialization with local git worktree and clone fallback.
- Repository Config view for registering managed repositories from the dashboard.
- Live Linear configuration verification for team key and workflow states, surfaced in the Config view.
- Live Linear workspace mapping verified against `PRA` / `Prasan-symphony` using existing workflow states: `Todo`, `In Progress`, `In Review`, `Done`, and `Canceled`.
- Versioned TypeScript project config for non-secret Linear tracker/team/state mapping, shared by API and worker.
- Live Linear worker smoke with fake runtime against `project_linear_live_smoke`: reconciled `PRA-1` through `PRA-4`, dispatched `PRA-3`, synced `Todo -> In Progress -> In Review`, posted Linear run comments, and captured log/review artifacts.
- Live Linear worker smoke with Codex runtime against `project_linear_live_smoke`: dispatched `PRA-2`, synced `Todo -> In Progress -> In Review`, posted Linear comments, persisted 59 run events, and captured log/review artifacts. This verified the real Codex path but also exposed that tracker-ingested Linear issues need repository assignment before useful code execution.
- Tracker-ingested work items now inherit the project default repository when the issue has no explicit repository reference.
- Workspace materialization now resolves absolute workspace paths before creating git worktrees or spawning agent runtimes, so git and child process cwd resolution cannot drift.
- Live Linear worker smoke with Cursor runtime against `project_linear_live_smoke`: after the absolute path fix, dispatched `PRA-4`, materialized a repository-backed git worktree, synced `Todo -> In Progress -> In Review`, posted Linear comments, persisted 97 Cursor stream events, and captured log, patch, PR draft, and review packet artifacts. A prior `PRA-1` Cursor attempt failed on the relative workspace path and correctly returned Linear to `Todo`.
- Work board titles now select work items directly, and dashboard artifact actions open all readable local text artifacts through the API, not only PR drafts.
- Run detail now renders the full event timeline newest-first in an explicit scroll region, with artifact lists also bounded and scrollable when they overflow.
- Run detail now prioritizes artifacts above the event timeline, and timeline rows show level and time in the header to reduce long-run row height.
- Mixed live Linear runtime routing proof: `PRA-1` was queued with `desiredRuntime=codex` and claimed by `codex-cli`; `PRA-3` was queued with `desiredRuntime=cursor` and claimed by `cursor-cli`. Both synced Linear to `In Progress` and then `In Review`, posted run comments, persisted run events, and captured review artifacts. Main git status remained clean after both generated workspace runs.
- Worker dispatch now falls back to the project default repository when an older queued work item lacks `repositoryId`, and persists that assignment before materializing the workspace.
- Project root migration: removed generated smoke worktrees/artifacts, moved tracked project files from the nested `agentic-project-management/` folder to the Git root, preserved local `.env`, and documented the final root layout in `PROJECT_ROOT_MIGRATION_SPEC.md`.
- Live `test-linear-app` routing smoke: registered `git@github.com:PrasanKumar93/test-linear-app.git` as the default repository for `project_linear_live_smoke`, created `PRA-5` for Codex and `PRA-6` for Cursor, ran both against isolated git worktrees, captured patch/PR/review artifacts, verified generated tests, and pushed the outputs to separate GitHub branches.
- Codex runtime now injects `--cd <workspacePath>` automatically so Codex CLI treats generated git worktrees as the writable workspace root.
- Manual GitHub PR handoff: linked the manually created `test-linear-app` PRs back into their Symphony PR artifacts and added a dashboard/API flow to paste a remote PR URL onto any local PR draft artifact.
- Repository-scoped PR configuration: managed repositories can now store PR mode, remote, base branch, and draft preference; the worker uses repository settings before falling back to env-only PR settings.
- Live repository-scoped GitHub draft PR smoke: created Linear issue `PRA-7`, reconciled it into Symphony, routed it to `test-linear-app`, ran Codex against an isolated git worktree, and had the worker create GitHub draft PR #3 from repository PR settings. A first Codex attempt exposed missing writable sandbox args; the retry succeeded with patch, PR, and review artifacts. Manual reviewer verification then found and fixed a restricted-OS-metric test failure on the PR branch.
- Review change-request loop: review-state work items with PR artifacts now expose a dashboard feedback form, persist `reviewRequest` branch/runtime context, queue `operator.request_changes`, sync Linear back to the active state, rerun Codex/Cursor with reviewer feedback, check out the existing PR branch, push a follow-up commit in `github_draft` mode, and record refreshed PR artifacts with `github.pr.updated`.
- Review-loop clean-commit handling: if Codex/Cursor self-commits a follow-up and leaves the workspace clean, Symphony now compares the current HEAD with the previous PR artifact commit, captures a committed-range PR artifact, and pushes the existing HEAD to the same PR branch. `request_changes` also falls back to the newest usable prior PR artifact when the latest run lacks one.
- Worker dispatch now continues after a transient tracker polling failure: `tracker.reconcile_failed` is recorded as a warning, but already-queued work can still run.
- Live same-PR review loop smoke on `PRA-7` / `test-linear-app` PR #3: Codex pushed a follow-up commit, Cursor produced a self-committed follow-up, and the patched worker recovered by pushing the advanced branch HEAD to the same PR branch and capturing PR artifact `art_075210837a58434e` with `changeSource: committed_range`.
- Review feedback visibility: reviewer change requests are now queryable through `GET /work-items/:workItemId/review-feedback` from persisted `operator_actions`, and the run detail panel shows a Feedback history section with runtime, actor, branch, base commit, and feedback text for each review turn. Verified on `PRA-7` with three same-PR feedback turns.
- GitHub PR readiness: PR artifacts with remote GitHub URLs now expose `GET /artifacts/:artifactId/pr-status`, and the run detail panel shows PR state, draft/mergeability, review summary, check summary, and readiness reasons. Verified on `PRA-7` / `test-linear-app` PR #3, which currently reports blocked because it is draft and merge-conflicted.
- Manual completion gate observability: review-state work items now show a PR-aware Manual completion card in run detail, remove `complete` from icon-only table quick actions, disable completion for blocked/pending/unknown linked GitHub PRs, allow local-only artifacts with a manual warning, and treat already merged GitHub PRs as ready for Symphony completion.
- Inline repository editing: Config view managed repository cards now expose edit forms backed by `PATCH /repositories/:repositoryId`, so name, URL, default branch, local path, and PR settings can be updated without re-registering the repository or editing MongoDB directly.
- Codex runtime policy hardening: Codex approval policy, sandbox mode, and skip-git-repo-check are now typed workflow/env settings that inject into CLI args safely, while respecting explicit `CODEX_ARGS`. Added argument-builder tests so workspace, model, reasoning, sandbox, and approval flags do not duplicate or land on the wrong side of `exec`.
- Runtime health visibility: `/integrations/health` now reports selected runtime, workflow load status, Codex policy/auth/timeout settings, and Cursor policy/auth settings. Config view shows the active/standby runtime cards and the top health badge includes runtime readiness.
- Repository archive controls: Config view managed repository cards now expose typed archive confirmation backed by `POST /repositories/:repositoryId/archive`. Archived repos are removed from future routing/default selection and intake lists, while historical work items remain readable and explicit reruns can still resolve their repo metadata.
- Repository connectivity checks: Config registration/edit forms now include a non-mutating Check access action backed by `POST /repositories/connectivity-check`, validating local path git status, repository URL reachability, default branch visibility, and `github_draft` PR remote/base readiness.

## In Progress

- Continue toward real inbound Linear webhook smoke and repository configuration polish.

## Next Queue

- Configure `LINEAR_WEBHOOK_SECRET` and run a real inbound webhook smoke through a public tunnel.
- Optional outer folder rename after the active tool sandbox/workspace path is refreshed.
- Inline per-check repository connectivity result rendering beyond the feedback banner summary.

## Immediate Execution Order

1. Live Linear + fake runtime smoke: done on `project_linear_live_smoke`.
2. Live Linear + Codex runtime smoke: done on `PRA-2`; runtime integration passed, but the issue had no repository binding.
3. Project default repository fallback for tracker-ingested issues: done; `PRA-1` and `PRA-4` were backfilled with the default repo.
4. Absolute workspace path fix for git worktree + runtime cwd: done.
5. Live Linear + Cursor runtime smoke: done on `PRA-4` with repository-backed workspace and review artifacts.
6. Mixed-runtime routing proof with live Linear work items: done on `PRA-1` for Codex and `PRA-3` for Cursor.
7. Project root migration: done; typecheck and build passed from the flattened Git root.
8. External repository live smoke: done on `test-linear-app`; Codex produced `agentic/pra-5-codex-standup-summary`, Cursor produced `agentic/pra-6-cursor-release-checklist`, and both branches are pushed to GitHub.
9. Manual PR linking: done; `PRA-5` is linked to GitHub PR #1 and `PRA-6` is linked to GitHub PR #2 in artifact metadata.
10. Repository-scoped PR settings: done in API/UI/worker.
11. Fresh live Linear auto-PR smoke: done on `PRA-7`; Symphony created draft PR #3 for `test-linear-app` from repository PR settings.
12. Implement the review change-request loop: done in API, DB, worker, dashboard, and git helper tests.
13. Live-smoke review change request on `PRA-7`: done. PR #3 stayed on branch `agent/pra-7-symphony-auto-pr-smoke-add-health-report-cli-202604292143-57ea47b9`; latest captured update commit is `8056b0a0fd72d7ac9217509b97be62936e3802b1`.
14. Surface review feedback history in the dashboard: done. `PRA-7` shows the JSON feedback, help feedback, and artifact-refresh feedback as three visible turns.
15. Surface GitHub PR readiness in the dashboard: done. `PRA-7` PR #3 shows draft/conflict blockers, review state, and check count from GitHub.
16. Gate visible manual completion with PR readiness evidence: done. The run detail panel owns completion with blocker reasons, and row quick actions no longer expose icon-only completion.
17. Inline repository editing: done. Config cards use `PATCH /repositories/:repositoryId` and server actions to update repository and PR settings in place.
18. Bake writable Codex CLI sandbox config into runtime settings: done. Codex now injects approval/sandbox/skip-git settings from workflow/env with tests.
19. Surface runtime policy settings in Config view health/readiness: done. API health now includes workflow/runtime settings, and the dashboard shows Codex/Cursor policy cards.
20. Archive managed repositories safely: done. Config cards use typed confirmation, archived repos leave future routing/default selection, and audit events preserve who/why.
21. Validate repository connectivity before save: done. Check access probes local path, clone/default branch visibility, and GitHub draft PR remote/base readiness without saving config.
22. Real Linear inbound webhook smoke once `LINEAR_WEBHOOK_SECRET` and a public tunnel are configured.

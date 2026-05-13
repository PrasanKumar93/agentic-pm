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
- Manual completion gate observability: review-state work items now show a PR-aware Manual completion card in run detail, remove `complete` from icon-only table quick actions, disable completion for blocked/pending/unknown linked GitHub PRs, allow local-only artifacts with a manual warning, treat already merged GitHub PRs as ready for Symphony completion, and distinguish draft-only/manual PR blockers from merge-conflict or code-follow-up blockers.
- Inline repository editing: Config view managed repository cards now expose edit forms backed by `PATCH /repositories/:repositoryId`, so name, URL, default branch, local path, and PR settings can be updated without re-registering the repository or editing MongoDB directly.
- Codex runtime policy hardening: Codex approval policy, sandbox mode, and skip-git-repo-check are now typed workflow/env settings that inject into CLI args safely, while respecting explicit `CODEX_ARGS`. Added argument-builder tests so workspace, model, reasoning, sandbox, and approval flags do not duplicate or land on the wrong side of `exec`.
- Runtime health visibility: `/integrations/health` now reports selected runtime, workflow load status, Codex policy/auth/timeout settings, and Cursor policy/auth settings. Config view shows the active/standby runtime cards and the top health badge includes runtime readiness.
- Repository archive controls: Config view managed repository cards now expose typed archive confirmation backed by `POST /repositories/:repositoryId/archive`. Archived repos are removed from future routing/default selection and intake lists, while historical work items remain readable and explicit reruns can still resolve their repo metadata.
- Repository connectivity checks: Config registration/edit forms now include a non-mutating Check access action backed by `POST /repositories/connectivity-check`, validating local path git status, repository URL reachability, default branch visibility, and `github_draft` PR remote/base readiness.
- Repository connectivity visibility: Config view now reads recent `repository.connectivity_checked` events through `GET /repositories/connectivity-checks` and renders the last per-check local path, repository URL, and PR remote results inline.
- Repository connectivity scoping: connectivity events now persist `repositoryId`, `GET /repositories/connectivity-checks` accepts a repository filter, and Config cards show a compact per-repository latest check with a fallback for older name-only events.
- Generated workspace cleanup: `pnpm cleanup:workspaces` now dry-runs old generated git workspace candidates under `AGENTIC_PM_WORKSPACE_ROOT`, skips dirty workspaces by default, supports project/repository filters, and only removes candidates with `--apply`.
- Linear webhook setup visibility: `/integrations/health` now includes `linear.webhookSetup`, and Config shows local callback URL, public callback URL readiness, signing secret status, verification header/timestamp requirements, and delivery dedupe header before the real inbound smoke.
- Linear webhook smoke automation: `pnpm smoke:linear-webhook` now builds a realistic signed Linear Issue payload from `.env`, posts it to `/webhooks/linear`, verifies work-item reconciliation, replays the same `Linear-Delivery` id, and checks `/webhook-deliveries` plus `/work-items` for persisted evidence.
- Codex auth/write smoke automation: `pnpm smoke:codex-auth-write` loads `.env` without printing secrets, applies the worker's `OPENAI_API_KEY -> CODEX_API_KEY` bridge, runs `codex exec` with `workspace-write`, `--add-dir`, and `--cd` in a throwaway git workspace, verifies a marker file write, and classifies auth/model/workspace failures before a real Linear retry.
- Local signed Linear webhook smoke passed against `project_linear_live_smoke`: restarted Mongo/Redis with `docker compose --env-file .env -f docker/docker-compose.yml up -d`, restarted the API with `LINEAR_WEBHOOK_SECRET`, posted delivery `local-linear-smoke-1778141674950-4597f3c0`, reconciled `SMK-1778141674950`, created queued work item `work_5a5bf5b50ec847df`, and verified duplicate replay with `attemptCount: 2`.
- Real Linear inbound webhook smoke passed through ngrok: created Linear webhook `b2d35563-3229-4407-89db-12070d9e938c` for `Issue` events on team `PRA`, delivered `PRA-8` create through `https://1672-49-36-125-134.ngrok-free.app/webhooks/linear`, recorded inactive `Backlog` delivery `2129656c-3433-435f-bc89-9ad60c310043`, then moved `PRA-8` to `Todo` and verified active delivery `0b04042f-97d3-4122-bf47-b81eea03103b` created queued work item `work_816f4f8f900c4c20` with default repository `test-linear-app`.
- Real webhook-created work dispatch proof: `PRA-8` ran through the live Linear webhook -> Symphony -> Codex path, synced Linear to `In Progress` then `In Review`, posted Linear comments, and captured log/review artifacts. The issue was intentionally too generic to produce a useful code patch, so it proved webhook-to-runtime handoff but not the PR artifact path.
- Codex generated-worktree writable-root hardening: Codex runtime args now inject `--add-dir <workspacePath>`, `--cd <workspacePath>`, and `--sandbox workspace-write` as `exec` options, preserving explicit user-supplied args and normalizing old top-level workspace flags from `.env`.
- Live Codex workspace-write recovery smoke: `PRA-9` was retried after the Codex arg normalization, ran safely under `workspace-write`, captured log/patch/PR/review artifacts, pushed branch `agent/pra-9-codex-webhook-smoke-add-status-cli-2026-05-07t17-59-52-ec394304`, created draft GitHub PR #4 for `test-linear-app`, synced Linear back to `In Review`, and posted the review-ready comment.
- Live same-PR Codex review-change smoke on `PRA-9` / `test-linear-app` PR #4: persisted reviewer feedback for multi-word CLI args, synced Linear back to `Todo`, checked out the existing PR branch, reran Codex with feedback, pushed follow-up commit `2046ad79395e1af842833533a180b0698cf16a07`, recorded `github.pr.updated`, refreshed patch/PR/review artifacts, and kept the manual merge gate.
- Codex warning severity cleanup: worker runtime event classification now downgrades known non-fatal Codex local-state and model-personality stderr chatter to `warn` with `severityReason: "known_stderr_warning"`, while preserving real `stderr` failures as `error`. Added focused worker tests for the classifier.
- PR review readiness ergonomics: the run detail PR card now shows checked head commit and fetch freshness, and the Manual completion gate shows an explicit next-step instruction for ready, merged, pending, blocked, unknown, local-only, and missing-evidence states.
- Linear webhook management command: `pnpm linear:webhook` now dry-runs or applies Linear webhook create/update from `.env` plus the TypeScript team config. It verifies the `PRA` team, reuses an existing matching webhook when present, syncs the callback URL/resource types/secret, and was applied to webhook `b2d35563-3229-4407-89db-12070d9e938c` for `https://1672-49-36-125-134.ngrok-free.app/webhooks/linear`.
- Live PR branch-policy smoke: temporarily set `test-linear-app` repository PR branch policy to `prefix=policy-smoke`, `maxLength=72`, and `includeTimestamp=true`; created Linear issue `PRA-10`; ran a one-shot Codex worker; created GitHub draft PR #5 at `https://github.com/PrasanKumar93/test-linear-app/pull/5`; verified branch `policy-smoke/pra-10-branch-policy-smoke-add-tiny-cli-marker-202-82eb4fa9` is exactly 72 chars and starts with the policy prefix; captured PR artifact `art_ef3166209f89451e` with `pullRequestBranchPolicy`; reset repository policy back to `agent`, max length `120`, timestamp disabled.
- PR merge-conflict handoff gate: before creating or updating a GitHub PR, the worker now fetches the latest remote base and runs a non-mutating merge-tree check. For review-change runs, conflicting branches are prepared with real conflict markers, one automatic Codex/Cursor resolution turn runs, the resolved files are committed, mergeability is checked again, and only conflict-free branches continue to draft/update PRs. Unresolved conflicts record `github.pr.merge_conflict`, block the work item, and do not move Linear to review-ready.
- Review conflict quick action: review-state work items with a prior PR branch now show an `Update / Resolve Conflicts` button that submits a standard `request_changes` feedback turn. The feedback text is persisted in history and drives the same same-PR Codex/Cursor loop as typed reviewer feedback. While that follow-up is queued or running, the dashboard shows a review-loop progress notice instead of hiding the form without context; the controls return when the work item reaches review again.

## In Progress

- Review the polish backlog and choose the next product slice. Workspace writes, PR creation, same-PR change requests, Codex warning severity normalization, PR review gate ergonomics, Linear webhook management, repo-scoped access checks, dry-run workspace pruning, and branch policy smokes now work without `danger-full-access`.

## Next Queue

- Optional outer folder rename after the active tool sandbox/workspace path is refreshed.

## Polish Backlog For Review

- Add a dashboard queue/backlog panel that shows the next suggested slices, their status, and the evidence needed before marking them done.
- Add a one-command live acceptance runner that sequences repository access check, Linear issue creation, one-shot worker dispatch, PR artifact verification, and cleanup/reset.
- Add UI controls for PR branch policy presets, including a preview of the generated branch name before saving repository settings.
- Add stronger Codex stderr classification for known nonfatal plugin/cache/quarantine warnings so the timeline stays quieter during successful runs.
- Add retention controls for generated workspaces and artifacts from the dashboard, backed by the dry-run cleanup command before destructive removal.
- Add a run environment diagnostics card that shows the exact runtime command path, sandbox mode, writable roots, and auth source without exposing secrets.
- Add a PR readiness refresh button and stale-status indicator so reviewers know when GitHub mergeability/check data was last fetched.
- Add a safe test-data reset workflow for `test-linear-app`, including branch/PR inventory and explicit confirmation before deleting smoke branches.

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
22. Render connectivity check details inline: done. Config shows the recent event-backed check results after `Check access`.
23. Surface Linear webhook setup readiness: done. Health and Config now show the callback URL/secret/tunnel prerequisites for a real inbound webhook.
24. Add local signed Linear webhook smoke automation: done. `pnpm smoke:linear-webhook -- --dry-run` previews the payload, and live mode verifies reconciliation plus delivery-id idempotency against the running API.
25. Local signed Linear webhook smoke on `project_linear_live_smoke`: done. Delivery `local-linear-smoke-1778141674950-4597f3c0` reconciled `SMK-1778141674950`, created work item `work_5a5bf5b50ec847df`, and duplicate replay returned `duplicate`.
26. Real Linear inbound webhook smoke through ngrok: done. Linear webhook `b2d35563-3229-4407-89db-12070d9e938c` delivered `PRA-8`; moving `PRA-8` from `Backlog` to `Todo` created work item `work_816f4f8f900c4c20`.
27. Dispatch webhook-created `PRA-8` through Codex: done for webhook-to-runtime handoff and Linear state/comments, but not for PR creation because the smoke issue produced no meaningful repository change.
28. Harden Codex generated-worktree args: done. `--add-dir`, `--cd`, and `--sandbox` are injected as `exec` options with tests.
29. Add repeatable Codex auth/write smoke: done. The smoke exposed that top-level workspace/sandbox flags made nested Codex turns read-only; the adapter now normalizes those flags onto the `exec` side, and live smoke passes under `workspace-write`.
30. Retry live Codex PR creation after workspace-write fix: done on `PRA-9`; Symphony created `test-linear-app` draft PR #4 with patch, PR, review packet, Linear comments, and pushed branch evidence.
31. Prove live same-PR Codex review changes: done on `PRA-9`; Symphony persisted reviewer feedback, reran Codex on the existing PR #4 branch, pushed follow-up commit `2046ad79395e1af842833533a180b0698cf16a07`, and recorded `github.pr.updated`.
32. Add repeatable Linear webhook management: done. `pnpm linear:webhook -- --json` dry-runs the current Linear webhook plan, and `pnpm linear:webhook -- --apply --json` updated the existing PRA webhook in Linear without ad hoc GraphQL.
33. Scope repository connectivity checks per repository: done. Check events now carry `repositoryId`, the API accepts `repositoryId` filtering, and Config cards show the latest scoped readiness summary for each managed repository.
34. Add generated workspace cleanup: done. `pnpm cleanup:workspaces` reports old generated git workspaces by default, can filter by project/repository slug, skips dirty trees unless requested, and requires `--apply` before filesystem removal.
35. Add explicit PR branch naming policy: done. Repository PR settings and env fallback now control branch prefix, max length, and optional timestamp; Git helper tests verify default naming and truncation while review reruns keep the existing PR branch.
36. Live branch-policy smoke: done on `PRA-10`; Symphony created `test-linear-app` draft PR #5 on `policy-smoke/pra-10-branch-policy-smoke-add-tiny-cli-marker-202-82eb4fa9`, verified max-length truncation and prefix behavior, recorded the policy in PR artifact metadata, and reset the repository policy to normal defaults.

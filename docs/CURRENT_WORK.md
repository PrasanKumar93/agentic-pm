# Current Work

Status: Living tracker
Date: 2026-04-30

## How Work Is Tracked

- `MVP_CHECKLIST.md` is the milestone acceptance checklist.
- `CURRENT_WORK.md` is the active queue: what is done, in progress, and next.
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

## In Progress

- Real Linear inbound webhook smoke setup.

## Next Queue

- Configure `LINEAR_WEBHOOK_SECRET` and run a real inbound webhook smoke through a public tunnel.
- Repository edit/archive controls with explicit confirmation.
- Optional outer folder rename after the active tool sandbox/workspace path is refreshed.

## Immediate Execution Order

1. Live Linear + fake runtime smoke: done on `project_linear_live_smoke`.
2. Live Linear + Codex runtime smoke: done on `PRA-2`; runtime integration passed, but the issue had no repository binding.
3. Project default repository fallback for tracker-ingested issues: done; `PRA-1` and `PRA-4` were backfilled with the default repo.
4. Absolute workspace path fix for git worktree + runtime cwd: done.
5. Live Linear + Cursor runtime smoke: done on `PRA-4` with repository-backed workspace and review artifacts.
6. Mixed-runtime routing proof with live Linear work items: done on `PRA-1` for Codex and `PRA-3` for Cursor.
7. Project root migration: done; typecheck and build passed from the flattened Git root.
8. Real Linear inbound webhook smoke once `LINEAR_WEBHOOK_SECRET` and a public tunnel are configured.

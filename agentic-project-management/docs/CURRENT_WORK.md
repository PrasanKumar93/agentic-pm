# Current Work

Status: Living tracker
Date: 2026-04-29

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

## In Progress

- Repository configuration UI for registering multiple managed repositories.

## Next Queue

- Linear team/project configuration verification against a live Linear workspace.

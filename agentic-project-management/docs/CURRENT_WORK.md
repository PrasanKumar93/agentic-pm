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

## In Progress

- Runtime stderr severity normalization for known CLI warnings.

## Next Queue

- Remote GitHub PR creation with `gh pr create` after explicit project configuration.
- Dashboard health badge for Linear webhook/tracker configuration.

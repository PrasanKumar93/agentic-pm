# Linear Integration Spec

Status: Draft v0.7
Date: 2026-04-30

## 1. Purpose

Linear integration brings tracker events into the same local orchestration loop as polling.

This slice adds webhook security, polling reconciliation, state sync events, run comments, and live configuration verification. The worker still keeps polling because webhooks can be delayed, retried, or missed.

## 2. TypeScript Project Config

Non-secret tracker/team/workflow mapping lives in:

```txt
packages/config/src/agentic-pm.config.ts
```

The current verified Linear mapping is:

```ts
export const agenticPmConfig = {
  tracker: {
    kind: "linear",
    linear: {
      teamKey: "PRA",
      activeStates: ["Todo"],
      states: {
        running: "In Progress",
        review: "In Review",
        failure: "Todo",
        done: "Done",
        cancelled: "Canceled",
      },
    },
  },
};
```

Environment remains for secrets and local machine settings:

```txt
LINEAR_API_KEY=lin_api_...
LINEAR_WEBHOOK_SECRET=...
LINEAR_WEBHOOK_TOLERANCE_MS=60000
```

`AGENTIC_PM_TRACKER=fake` is still accepted as an explicit local smoke-test override. Linear team and state names are intentionally not read from env.

## 3. Configuration Verification

```txt
GET /integrations/health
```

When the TypeScript config selects `linear` and `LINEAR_API_KEY` is configured, the API performs a read-only Linear GraphQL verification:

- Authenticates with the configured personal API key.
- Looks up the team by the configured TypeScript `teamKey`.
- Lists workflow states for that team.
- Compares the returned state names against the configured TypeScript active/running/review/failure/done/cancelled state mapping.

The response never returns secret values. It exposes booleans for API key, team key, and webhook secret presence, plus a verification object with:

- `status`: `disabled`, `missing_config`, `verified`, `missing_states`, or `failed`.
- `team`: verified team id/key/name when Linear returns it.
- `matchedStateNames` and `missingStateNames`.
- `availableStateNames` for the configured team.
- `checkedAt` and a sanitized error string when verification fails.

The response also includes `linear.webhookSetup` for operator-facing webhook readiness:

- `status`: `disabled`, `missing_secret`, `local_only`, or `ready`.
- `endpointPath`: always `/webhooks/linear`.
- `localCallbackUrl`: defaults to `http://127.0.0.1:<API_PORT>/webhooks/linear`, or `AGENTIC_PM_LOCAL_WEBHOOK_URL`.
- `publicCallbackUrl`: read from `LINEAR_WEBHOOK_PUBLIC_URL` or `AGENTIC_PM_PUBLIC_WEBHOOK_URL`, or derived from `AGENTIC_PM_PUBLIC_BASE_URL` / `PUBLIC_WEBHOOK_BASE_URL`.
- `secretConfigured`, `publicCallbackConfigured`, `toleranceMs`, `signatureHeader`, `deliveryHeader`, and `timestampField`.

Dashboard Config renders Linear verification and webhook setup as separate panels. A fully usable Linear loop requires `verification.status: verified`; missing webhook secret is allowed but keeps the overall health in warning state because polling can run while webhooks remain inactive.

## 4. Webhook Endpoint

```txt
POST /webhooks/linear
GET /webhook-deliveries?limit=50
```

The API verifies:

- `Linear-Signature` header.
- HMAC-SHA256 signature over the raw request body using `LINEAR_WEBHOOK_SECRET`.
- `webhookTimestamp` freshness within `LINEAR_WEBHOOK_TOLERANCE_MS`.

Verified webhooks with a new `Linear-Delivery` header are claimed in the `webhook_deliveries` collection before handler work begins. The unique key is `{ provider, deliveryId }`, where `provider` is `linear`.

Claimed webhooks append `tracker.linear.webhook.received` into `run_events`.

For `Issue` webhooks with `action: "create"` or `action: "update"`, the API also normalizes `data` into the internal issue model and upserts MongoDB by `{ tracker, externalId }`. If the resulting Linear state is in the TypeScript configured active states, the API creates or refreshes the project work item immediately. This mirrors polling reconciliation without waiting for the next worker loop.

Normalization emits:

- `tracker.issue.webhook_reconciled` when an issue payload is upserted.
- `tracker.linear.webhook.ignored` when an Issue webhook has an unsupported action such as `remove`.
- `tracker.linear.webhook.normalization_failed` when an Issue webhook is missing required issue fields.

Non-Issue webhooks are acknowledged after `tracker.linear.webhook.received` and ignored.

Duplicate `Linear-Delivery` values:

- Increment `webhook_deliveries.attemptCount`.
- Append `tracker.linear.webhook.duplicate`.
- Return `data.status: "duplicate"`.
- Do not append `tracker.linear.webhook.received`.
- Do not normalize the payload or create/update a work item again.

If Linear omits `Linear-Delivery`, the API still verifies and processes the webhook but records `deliveryStatus: "missing_delivery_id"` in the received event. Those requests cannot be deduplicated.

Recent delivery claims are exposed through `GET /webhook-deliveries?limit=50` for the dashboard Audit view. The endpoint is read-only and returns delivery id, provider, status, attempt count, result summary, and receive/process timestamps across the local delivery ledger by default. A `projectId` query parameter can narrow the result set.

The response body includes a machine-readable normalization result, while still returning `200 OK` for verified but ignored payloads so Linear does not retry permanent non-work items.

Invalid signatures and stale timestamps return `401 Unauthorized`.

If `LINEAR_WEBHOOK_SECRET` is not configured, the endpoint returns `503 Service Unavailable`.

## 5. Polling And Upsert

The worker polls Linear through `listActiveIssues` with:

- TypeScript configured `tracker.linear.teamKey`
- TypeScript configured `tracker.linear.activeStates`

Each active issue is normalized into the internal issue model, upserted into MongoDB by `{ tracker, externalId }`, and assigned a local work item if one does not already exist.

Each reconciliation emits `tracker.issue.reconciled`.

Polling and webhook normalization share the same Linear issue mapping:

- `id` -> `externalId`
- `identifier`
- `title`
- `description`
- workflow state name -> `state`
- labels, assignee, relations, URL, priority, timestamps, and raw payload

## 6. State Sync

The worker syncs external tracker state at durable lifecycle points:

| Local lifecycle | Linear state |
| --- | --- |
| Run starts | `tracker.linear.states.running` |
| Run waits for review | `tracker.linear.states.review` |
| Run fails during setup/execution | `tracker.linear.states.failure` |
| Operator marks complete | `tracker.linear.states.done` |
| Operator cancels work | `tracker.linear.states.cancelled` |

Successful sync:

- Calls Linear `issueUpdate`.
- Updates the local MongoDB issue state.
- Emits `tracker.issue.state_synced`.

Failed sync:

- Emits `tracker.issue.state_sync_failed`.
- Leaves the local run/work item lifecycle intact so the dashboard remains the source of truth during tracker outages.

Operator action sync is performed by the API after the local MongoDB transition succeeds. It is best-effort: a Linear failure emits `tracker.issue.state_sync_failed` and does not roll back local Symphony state.

## 7. Run Comments

The worker posts Linear comments for:

- `run_started`: run id, runtime, and workspace path.
- `run_failed`: failure reason and available artifact ids.
- `review_ready`: review packet id, PR draft id, and the manual merge gate reminder.
- `setup_failed`: setup failure reason when a run cannot be created.

Successful comments emit `tracker.issue.comment_created`.

Failed comments emit `tracker.issue.comment_failed` as warnings and do not fail the run.

## 8. Fastify Raw Body Rule

Signature validation must use the raw request body bytes. The API replaces Fastify's default JSON parser with a raw-buffer parser that:

- Stores `request.rawBody`.
- Parses JSON once for normal route handlers.
- Leaves all non-webhook JSON routes working as before.

## 9. Local Setup

1. Copy `.env.example` to `.env`.
2. Set `LINEAR_API_KEY`.
3. Confirm `packages/config/src/agentic-pm.config.ts` matches the Linear team key and workflow state names.
4. Create or update a Linear webhook pointing to:

```txt
https://<public-host>/webhooks/linear
```

The repeatable operator path is:

```sh
pnpm linear:webhook -- --json
pnpm linear:webhook -- --apply
```

The command is dry-run by default. It reads `LINEAR_API_KEY`, the TypeScript
configured Linear team key, `LINEAR_WEBHOOK_PUBLIC_URL` or
`AGENTIC_PM_PUBLIC_BASE_URL`, and `LINEAR_WEBHOOK_SECRET`, then creates or
updates the team-scoped `Issue` webhook in Linear. Use `--webhook-id` or
`LINEAR_WEBHOOK_ID` when multiple team webhooks exist; otherwise the command
reuses an exact URL match, label match, or the single existing team webhook so
ngrok URL rotation updates in place instead of creating duplicates.

5. Set the same URL in `LINEAR_WEBHOOK_PUBLIC_URL` so Config can show the live callback target.
6. Copy the webhook signing secret into `LINEAR_WEBHOOK_SECRET`.

For localhost testing, expose the API with a tunnel such as ngrok or Cloudflare Tunnel, then use that public HTTPS URL in Linear.

## 10. Smoke Tests

Live configuration:

```sh
curl -s http://127.0.0.1:4000/integrations/health
```

Expected result for a complete Linear setup:

- `data.tracker.status` is `ok` when webhook secret is present or `warn` when only polling is configured.
- `data.linear.verification.status` is `verified`.
- `data.linear.verification.missingStateNames` is empty.
- `data.linear.webhookSetup.status` is `ready` when both `LINEAR_WEBHOOK_SECRET` and a public callback URL are configured.

Local signed webhook smoke:

```sh
pnpm linear:webhook -- --json
pnpm linear:webhook -- --apply
pnpm smoke:linear-webhook -- --dry-run
pnpm smoke:linear-webhook
```

`pnpm linear:webhook` verifies the Linear team and webhook management access.
Without `--apply`, it only reports whether it would create or update a webhook.
With `--apply`, it mutates Linear and prints the resulting webhook id, label,
URL, enabled state, resource types, and team.

The script reads `.env`, signs a realistic Linear `Issue` webhook with `LINEAR_WEBHOOK_SECRET`, posts it to `/webhooks/linear`, replays the same `Linear-Delivery` id, and verifies:

- First delivery returns `data.status: "reconciled"`.
- Active state payloads create a work item on the API process' configured project.
- Replay returns `data.status: "duplicate"`.
- `/webhook-deliveries` and `/work-items` can read back the accepted delivery/work item.

The API process must be restarted after changing `LINEAR_WEBHOOK_SECRET`; the script and API must use the same secret value.

Invalid signature:

```sh
curl -i \
  -H "Content-Type: application/json" \
  -H "Linear-Signature: bad" \
  --data '{"webhookTimestamp":0}' \
  http://127.0.0.1:4000/webhooks/linear
```

Worker smoke with fake tracker writes:

```sh
AGENTIC_PM_TRACKER=fake AGENT_RUNTIME=fake AGENTIC_PM_RUN_ONCE=true node apps/worker/dist/index.js
```

Then confirm run events include:

- `tracker.issue.state_synced`
- `tracker.issue.comment_created`
- `artifact.created`

Live Linear worker smoke with fake runtime:

```sh
AGENTIC_PM_PROJECT_ID=project_linear_live_smoke \
AGENTIC_PM_PROJECT_SLUG=linear-live-smoke \
AGENTIC_PM_RUN_ONCE=true \
AGENT_RUNTIME=fake \
AGENTIC_PM_PR_MODE=local_draft \
node apps/worker/dist/index.js
```

Verified on 2026-04-30 against `PRA` / `Prasan-symphony`:

- Reconciled `PRA-1`, `PRA-2`, `PRA-3`, and `PRA-4`.
- Dispatched `PRA-3`.
- Synced `PRA-3` to `In Progress` for `run_started`.
- Posted the run-started Linear comment.
- Captured log and review packet artifacts.
- Synced `PRA-3` to `In Review` for `review_ready`.
- Posted the review-ready Linear comment.

Live Linear worker smokes with real runtimes are tracked in `CURRENT_WORK.md` in this order:

1. Codex runtime against one queued Linear work item in `project_linear_live_smoke`.
2. Cursor runtime against another queued Linear work item in `project_linear_live_smoke`.
3. Mixed-runtime routing where dashboard-selected `desiredRuntime` values are respected by matching workers.

Each real-runtime smoke should preserve the same Linear evidence as the fake smoke: local work item status, run events, artifacts, Linear state transitions, and Linear comments. Runtime-specific evidence should include parsed Codex or Cursor event entries in the run timeline.

Codex runtime smoke verified on 2026-04-30:

- Dispatched `PRA-2` with `codex-cli` in `project_linear_live_smoke`.
- Synced `PRA-2` to `In Progress` for run start and `In Review` for review ready.
- Posted Linear run-started and review-ready comments.
- Persisted 59 run events, including parsed Codex JSON events and token usage.
- Captured log and review packet artifacts.
- Exposed a repository-assignment gap: Linear issues normalized from polling/webhooks do not carry repository references by default, so Codex received an empty workspace. Tracker-ingested work items should now fall back to the project default repository when the issue has no explicit `repoRefs`.

Cursor runtime smoke verified on 2026-04-30:

- Dispatched `PRA-4` with `cursor-cli` in `project_linear_live_smoke`.
- Materialized a repository-backed git worktree at an absolute workspace path.
- Synced `PRA-4` to `In Progress` for run start and `In Review` for review ready.
- Posted Linear run-started and review-ready comments.
- Persisted 97 run events, including Cursor `stream-json` thinking, tool, assistant, and result events.
- Captured log, patch, local PR draft, and review packet artifacts.
- A prior `PRA-1` Cursor attempt failed on a relative workspace path; the failure path synced the issue back to `Todo` and posted a failure comment.

Mixed-runtime routing smoke verified on 2026-04-30:

- Queued `PRA-1` with `desiredRuntime=codex`; a Codex one-shot worker claimed it, ran `codex-cli`, synced Linear to `In Progress` and then `In Review`, posted Linear comments, persisted 71 events, and captured review artifacts.
- Queued `PRA-3` with `desiredRuntime=cursor`; a Cursor one-shot worker claimed it, ran `cursor-cli`, synced Linear to `In Progress` and then `In Review`, posted Linear comments, persisted 322 events, and captured review artifacts.
- Main git status stayed clean after both runs because agent output was isolated to generated workspaces and artifact files.
- The Cursor half exposed an older no-repository work item. Worker dispatch now falls back to the project default repository and persists that assignment before workspace materialization.

External repository routing smoke verified on 2026-04-30:

- Registered `git@github.com:PrasanKumar93/test-linear-app.git` as the first/default repository for `project_linear_live_smoke`.
- Created live Linear issues `PRA-5` for Codex and `PRA-6` for Cursor.
- `PRA-5` was routed to Codex with `desiredRuntime=codex`; the worker ran `codex-cli` in an isolated `test-linear-app` git worktree, synced Linear to `In Progress` and then `In Review`, posted Linear comments, persisted 94 events, captured log, patch, PR draft, and review packet artifacts, and produced a passing dependency-free Node test suite.
- `PRA-6` was routed to Cursor with `desiredRuntime=cursor`; the worker ran `cursor-cli` in a separate `test-linear-app` git worktree, synced Linear to `In Progress` and then `In Review`, posted Linear comments, persisted 73 events, captured log, patch, PR draft, and review packet artifacts, and produced a passing dependency-free Node test suite.
- The smoke outputs were preserved on GitHub branches:
  - `agentic/pra-5-codex-standup-summary`
  - `agentic/pra-6-cursor-release-checklist`

Webhook smoke should return `data.status: "reconciled"` for active issue payloads and create a local work item for the configured project. Replaying the exact same payload and `Linear-Delivery` should return `data.status: "duplicate"` and should not append another `tracker.issue.webhook_reconciled` event.

Real inbound webhook smoke verified on 2026-05-07:

- Started an ngrok tunnel to `http://127.0.0.1:4000` and set `LINEAR_WEBHOOK_PUBLIC_URL` to the public `/webhooks/linear` callback.
- Created Linear webhook `b2d35563-3229-4407-89db-12070d9e938c` for `Issue` events on team `PRA` with the same `LINEAR_WEBHOOK_SECRET` used by the API.
- Created Linear issue `PRA-8`; Linear delivered create event `2129656c-3433-435f-bc89-9ad60c310043` through ngrok. Symphony reconciled it as inactive because Linear created it in `Backlog`, which is intentionally not in `activeStates`.
- Moved `PRA-8` to `Todo`; Linear delivered update event `0b04042f-97d3-4122-bf47-b81eea03103b`. Symphony reconciled it as active and created queued work item `work_816f4f8f900c4c20` with the project default `test-linear-app` repository.

## 11. References

- Linear webhook docs: https://linear.app/developers/webhooks
- Linear SDK webhook docs: https://linear.app/docs/api/sdk-webhooks

## 12. Future Work

- Add IP allowlisting as an optional defense-in-depth check.

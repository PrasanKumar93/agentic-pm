# Linear Integration Spec

Status: Draft v0.6
Date: 2026-04-29

## 1. Purpose

Linear integration brings tracker events into the same local orchestration loop as polling.

This slice adds webhook security, polling reconciliation, state sync events, run comments, and live configuration verification. The worker still keeps polling because webhooks can be delayed, retried, or missed.

## 2. Environment

Required for polling and tracker writes:

```txt
AGENTIC_PM_TRACKER=linear
LINEAR_API_KEY=lin_api_...
LINEAR_TEAM_KEY=ENG
LINEAR_PROJECT_SLUG=
```

Required for verified webhooks:

```txt
LINEAR_WEBHOOK_SECRET=...
LINEAR_WEBHOOK_TOLERANCE_MS=60000
```

Workflow state names must exist in Linear:

```txt
LINEAR_ACTIVE_STATES=Ready for Agent,Changes Requested
LINEAR_RUNNING_STATE=Agent Running
LINEAR_REVIEW_STATE=Human Review
LINEAR_FAILURE_STATE=Changes Requested
LINEAR_DONE_STATE=Done
LINEAR_CANCELLED_STATE=Cancelled
```

For a Linear team that already uses the default workflow states, Symphony can map into those states instead of creating new Linear states:

```txt
AGENTIC_PM_TRACKER=linear
LINEAR_ACTIVE_STATES=Todo
LINEAR_RUNNING_STATE=In Progress
LINEAR_REVIEW_STATE=In Review
LINEAR_FAILURE_STATE=Todo
LINEAR_DONE_STATE=Done
LINEAR_CANCELLED_STATE=Canceled
```

Environment values override workflow front matter so local operators can switch Linear teams/states without editing `WORKFLOW.md`.

## 3. Configuration Verification

```txt
GET /integrations/health
```

When `AGENTIC_PM_TRACKER=linear` and both `LINEAR_API_KEY` and `LINEAR_TEAM_KEY` are configured, the API performs a read-only Linear GraphQL verification:

- Authenticates with the configured personal API key.
- Looks up the team by `LINEAR_TEAM_KEY`.
- Lists workflow states for that team.
- Compares the returned state names against `LINEAR_ACTIVE_STATES`, `LINEAR_RUNNING_STATE`, `LINEAR_REVIEW_STATE`, `LINEAR_FAILURE_STATE`, `LINEAR_DONE_STATE`, and `LINEAR_CANCELLED_STATE`.

The response never returns secret values. It exposes booleans for API key, team key, and webhook secret presence, plus a verification object with:

- `status`: `disabled`, `missing_config`, `verified`, `missing_states`, or `failed`.
- `team`: verified team id/key/name when Linear returns it.
- `matchedStateNames` and `missingStateNames`.
- `availableStateNames` for the configured team.
- `checkedAt` and a sanitized error string when verification fails.

Dashboard Config renders this as the operator-facing Linear verification panel. A fully usable Linear loop requires `status: verified`; missing webhook secret is allowed but keeps the overall health in warning state because polling can run while webhooks remain inactive.

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

For `Issue` webhooks with `action: "create"` or `action: "update"`, the API also normalizes `data` into the internal issue model and upserts MongoDB by `{ tracker, externalId }`. If the resulting Linear state is in `LINEAR_ACTIVE_STATES`, the API creates or refreshes the project work item immediately. This mirrors polling reconciliation without waiting for the next worker loop.

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

- `LINEAR_TEAM_KEY`
- `LINEAR_ACTIVE_STATES`

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
| Run starts | `LINEAR_RUNNING_STATE` |
| Run waits for review | `LINEAR_REVIEW_STATE` |
| Run fails during setup/execution | `LINEAR_FAILURE_STATE` when configured |
| Operator marks complete | `LINEAR_DONE_STATE` |
| Operator cancels work | `LINEAR_CANCELLED_STATE` |

Successful sync:

- Calls Linear `issueUpdate`.
- Updates the local MongoDB issue state.
- Emits `tracker.issue.state_synced`.

Failed sync:

- Emits `tracker.issue.state_sync_failed`.
- Leaves the local run/work item lifecycle intact so the dashboard remains the source of truth during tracker outages.

If `LINEAR_FAILURE_STATE` is not set, the worker defaults it to `Changes Requested` when that state is present in `LINEAR_ACTIVE_STATES`.

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
3. Set `LINEAR_TEAM_KEY`.
4. Create or confirm workflow states named by `LINEAR_ACTIVE_STATES`, `LINEAR_RUNNING_STATE`, `LINEAR_REVIEW_STATE`, `LINEAR_FAILURE_STATE`, `LINEAR_DONE_STATE`, and `LINEAR_CANCELLED_STATE`.
5. Create a Linear webhook pointing to:

```txt
https://<public-host>/webhooks/linear
```

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

Valid signature:

```sh
payload='{"type":"Issue","action":"update","webhookTimestamp":'$(date +%s000)',"data":{"id":"issue_123","identifier":"ENG-123","title":"Webhook smoke","state":{"name":"Ready for Agent"},"labels":{"nodes":[{"name":"agent"}]},"createdAt":"2026-04-29T12:00:00.000Z","updatedAt":"2026-04-29T12:00:00.000Z"}}'
signature=$(printf '%s' "$payload" | openssl dgst -sha256 -hmac "$LINEAR_WEBHOOK_SECRET" -hex | awk '{print $2}')
curl -i \
  -H "Content-Type: application/json" \
  -H "Linear-Signature: $signature" \
  -H "Linear-Event: Issue" \
  -H "Linear-Delivery: local-smoke" \
  --data "$payload" \
  http://127.0.0.1:4000/webhooks/linear
```

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

Webhook smoke should return `data.status: "reconciled"` for active issue payloads and create a local work item for the configured project. Replaying the exact same payload and `Linear-Delivery` should return `data.status: "duplicate"` and should not append another `tracker.issue.webhook_reconciled` event.

## 11. References

- Linear webhook docs: https://linear.app/developers/webhooks
- Linear SDK webhook docs: https://linear.app/docs/api/sdk-webhooks

## 12. Future Work

- Add IP allowlisting as an optional defense-in-depth check.

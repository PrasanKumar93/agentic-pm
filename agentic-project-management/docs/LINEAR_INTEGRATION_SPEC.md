# Linear Integration Spec

Status: Draft v0.2
Date: 2026-04-29

## 1. Purpose

Linear integration brings tracker events into the same local orchestration loop as polling.

This slice adds webhook security, polling reconciliation, state sync events, and run comments. The worker still keeps polling because webhooks can be delayed, retried, or missed.

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
```

Environment values override workflow front matter so local operators can switch Linear teams/states without editing `WORKFLOW.md`.

## 3. Webhook Endpoint

```txt
POST /webhooks/linear
```

The API verifies:

- `Linear-Signature` header.
- HMAC-SHA256 signature over the raw request body using `LINEAR_WEBHOOK_SECRET`.
- `webhookTimestamp` freshness within `LINEAR_WEBHOOK_TOLERANCE_MS`.

Verified webhooks append `tracker.linear.webhook.received` into `run_events` and return `200 OK`.

Invalid signatures and stale timestamps return `401 Unauthorized`.

If `LINEAR_WEBHOOK_SECRET` is not configured, the endpoint returns `503 Service Unavailable`.

## 4. Polling And Upsert

The worker polls Linear through `listActiveIssues` with:

- `LINEAR_TEAM_KEY`
- `LINEAR_ACTIVE_STATES`

Each active issue is normalized into the internal issue model, upserted into MongoDB by `{ tracker, externalId }`, and assigned a local work item if one does not already exist.

Each reconciliation emits `tracker.issue.reconciled`.

## 5. State Sync

The worker syncs external tracker state at durable lifecycle points:

| Local lifecycle | Linear state |
| --- | --- |
| Run starts | `LINEAR_RUNNING_STATE` |
| Run waits for review | `LINEAR_REVIEW_STATE` |
| Run fails during setup/execution | `LINEAR_FAILURE_STATE` when configured |

Successful sync:

- Calls Linear `issueUpdate`.
- Updates the local MongoDB issue state.
- Emits `tracker.issue.state_synced`.

Failed sync:

- Emits `tracker.issue.state_sync_failed`.
- Leaves the local run/work item lifecycle intact so the dashboard remains the source of truth during tracker outages.

If `LINEAR_FAILURE_STATE` is not set, the worker defaults it to `Changes Requested` when that state is present in `LINEAR_ACTIVE_STATES`.

## 6. Run Comments

The worker posts Linear comments for:

- `run_started`: run id, runtime, and workspace path.
- `run_failed`: failure reason and available artifact ids.
- `review_ready`: review packet id, PR draft id, and the manual merge gate reminder.
- `setup_failed`: setup failure reason when a run cannot be created.

Successful comments emit `tracker.issue.comment_created`.

Failed comments emit `tracker.issue.comment_failed` as warnings and do not fail the run.

## 7. Fastify Raw Body Rule

Signature validation must use the raw request body bytes. The API replaces Fastify's default JSON parser with a raw-buffer parser that:

- Stores `request.rawBody`.
- Parses JSON once for normal route handlers.
- Leaves all non-webhook JSON routes working as before.

## 8. Local Setup

1. Copy `.env.example` to `.env`.
2. Set `LINEAR_API_KEY`.
3. Set `LINEAR_TEAM_KEY`.
4. Create or confirm workflow states named by `LINEAR_ACTIVE_STATES`, `LINEAR_RUNNING_STATE`, and `LINEAR_REVIEW_STATE`.
5. Create a Linear webhook pointing to:

```txt
https://<public-host>/webhooks/linear
```

6. Copy the webhook signing secret into `LINEAR_WEBHOOK_SECRET`.

For localhost testing, expose the API with a tunnel such as ngrok or Cloudflare Tunnel, then use that public HTTPS URL in Linear.

## 9. Smoke Tests

Valid signature:

```sh
payload='{"type":"Issue","action":"update","webhookTimestamp":'$(date +%s000)',"data":{"id":"issue_123"}}'
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

## 10. References

- Linear webhook docs: https://linear.app/developers/webhooks
- Linear SDK webhook docs: https://linear.app/docs/api/sdk-webhooks

## 11. Future Work

- Normalize verified webhook issue payloads directly into MongoDB.
- Deduplicate webhook deliveries by `Linear-Delivery`.
- Add IP allowlisting as an optional defense-in-depth check.
- Add a dashboard health badge for Linear webhook configuration.
- Add optional done/cancelled Linear states for operator cancel and manual complete actions.

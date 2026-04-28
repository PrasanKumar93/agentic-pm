# Linear Integration Spec

Status: Draft v0.1
Date: 2026-04-29

## 1. Purpose

Linear integration brings tracker events into the same local orchestration loop as polling.

This slice adds webhook security and setup guidance. The worker still keeps polling because webhooks can be delayed, retried, or missed.

## 2. Environment

Required for polling and tracker writes:

```txt
AGENTIC_PM_TRACKER=linear
LINEAR_API_KEY=lin_api_...
LINEAR_TEAM_KEY=ENG
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
```

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

## 4. Fastify Raw Body Rule

Signature validation must use the raw request body bytes. The API replaces Fastify's default JSON parser with a raw-buffer parser that:

- Stores `request.rawBody`.
- Parses JSON once for normal route handlers.
- Leaves all non-webhook JSON routes working as before.

## 5. Local Setup

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

## 6. Smoke Tests

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

## 7. References

- Linear webhook docs: https://linear.app/developers/webhooks
- Linear SDK webhook docs: https://linear.app/docs/api/sdk-webhooks

## 8. Future Work

- Normalize verified webhook issue payloads directly into MongoDB.
- Deduplicate webhook deliveries by `Linear-Delivery`.
- Add IP allowlisting as an optional defense-in-depth check.
- Add a dashboard health badge for Linear webhook configuration.

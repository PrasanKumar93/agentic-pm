# Worker Cancellation Spec

Status: Draft v0.1
Date: 2026-04-29

## 1. Purpose

Worker cancellation prevents an active agent session from overwriting operator intent.

Before this slice, the API could mark a work item or run as cancelled, but a worker that was already running could still finish and move the item to human review. The worker now checks durable state while the agent session is active and before finalizing the run.

## 2. Stop Conditions

A worker must stop the active runtime session when any of these become true:

- The run status is `cancelled`.
- The work item status is `cancelled`.
- The work item status is `paused`.
- The work item no longer exists.

`paused` stops the current runtime session but keeps the work item paused so it stays out of dispatch until an operator resumes it.

`cancelled` stops the runtime session and leaves the work item cancelled.

## 3. Runtime Heartbeats

Agent runtimes may be silent for long periods. To keep cancellation responsive, runtimes emit non-persisted `heartbeat` events while waiting for output.

The worker uses heartbeat events to:

- Update run heartbeat metadata.
- Check for stop requests.

The worker does not write heartbeat events into `run_events`, so the dashboard timeline stays useful.

## 4. Worker Flow

For each claimed work item:

1. Create the run and mark it `running`.
2. Start the agent session.
3. Check for a stop request before consuming agent output.
4. For every agent event or runtime heartbeat:
   - Heartbeat the run.
   - Persist non-heartbeat agent events.
   - Check for a stop request.
5. Check for a stop request before marking the run ready for review.

When a stop request is found, the worker:

- Calls `runtime.cancel(session, reason)`.
- Marks the run `cancelled`.
- Appends `run.cancelled`.
- Marks the work item `cancelled`, unless the stop request came from a paused work item.

## 5. Validation

Required checks:

- `pnpm typecheck`
- `pnpm build`
- Mid-run cancellation smoke test using the fake runtime with `AGENTIC_PM_FAKE_EVENT_DELAY_MS`
- API/dashboard sanity check after cancellation

## 6. Future Work

- Add hard-kill escalation if a runtime ignores cancellation.
- Show cancellation reason in a dedicated dashboard field.
- Add stale heartbeat detection for crashed workers.
- Add process-group cancellation for multi-process runtimes.

# Agent Runtime Spec

Status: Draft v0.1
Date: 2026-04-29

## 1. Purpose

Symphony should orchestrate work, not be permanently coupled to one coding tool. Codex is the first-class MVP runtime, but the control plane should run other capable agents through runtime adapters when they expose a safe noninteractive CLI, local server, or API.

## 2. Runtime Contract

All runtimes implement the same interface:

- `start(input)`: prepare a session in a workspace.
- `run(session, prompt)`: stream normalized events.
- `cancel(session, reason)`: stop the active session.

Normalized event types:

- `session.started`
- `stdout`
- `stderr`
- `message`
- `heartbeat`
- `artifact`
- `session.completed`
- `session.failed`

The worker persists non-heartbeat events into MongoDB and uses heartbeats for responsive cancellation checks.

## 3. Supported Runtime Modes

### `fake`

Safe local runtime for smoke tests and dashboard development.

```env
AGENT_RUNTIME=fake
```

### `codex`

First-class CLI process runtime for Codex.

```env
AGENT_RUNTIME=codex
CODEX_COMMAND=codex
CODEX_ARGS=app-server
```

Codex inherits the hardened process behavior:

- Prompt delivered through `stdin`.
- `stdout` and `stderr` streamed as events.
- Heartbeats while waiting for output.
- Turn timeout.
- Stall timeout.
- Process-group cancellation with SIGTERM, then SIGKILL after a grace period.

### `generic`

Generic noninteractive CLI runtime for other tools or wrappers.

```env
AGENT_RUNTIME=generic
AGENT_RUNTIME_NAME=cursor-wrapper
AGENT_RUNTIME_COMMAND=./tools/run-cursor-agent
AGENT_RUNTIME_ARGS=--json --non-interactive
```

Use this for Cursor, Claude Code, OpenAI Agents SDK runners, or internal agent tools when they can accept a prompt and run inside a workspace without manual editor interaction.

## 4. Runtime Environment

Common controls:

```env
AGENT_RUNTIME_TURN_TIMEOUT_MS=3600000
AGENT_RUNTIME_STALL_TIMEOUT_MS=300000
AGENT_RUNTIME_CANCEL_GRACE_MS=5000
```

Argument values can be whitespace-separated:

```env
CODEX_ARGS=app-server
```

Or JSON for quoted arguments:

```env
AGENT_RUNTIME_ARGS=["run","--profile","agent mode"]
```

## 5. Tool Policy

Codex remains the reference runtime for the MVP because it maps directly to the Symphony-style orchestration model.

Cursor and other popular tools are supported through the adapter boundary when one of these is true:

- The tool exposes a noninteractive CLI.
- The tool exposes a local server or API.
- We build a small wrapper that converts the Symphony prompt into that tool's supported input format.

Desktop-only editor automation is not an MVP target because it is fragile, hard to cancel reliably, and hard to audit. It can be added later as a specialized adapter if needed.

## 6. Next Runtime Work

- Capture structured artifacts from runtime output.
- Generate a review packet artifact at the end of each successful run.
- Add runtime-specific parsers for JSON event streams when a tool supports them.
- Add dashboard artifact drill-down.

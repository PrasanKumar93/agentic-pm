# Agent Runtime Spec

Status: Draft v0.2
Date: 2026-04-29

## 1. Purpose

Symphony should orchestrate work, not be permanently coupled to one coding tool. Codex and Cursor Agent CLI are first-class MVP runtimes, and the control plane should run other capable agents through adapters when they expose a safe noninteractive CLI, local server, or API.

Runtime routing is tracked per work item through `desiredRuntime`. A worker claims queued work when the item is unassigned or its desired runtime matches the worker's configured `AGENT_RUNTIME`.

## 2. Runtime Contract

All runtimes implement the same interface:

- `preflight()`: optionally validate the selected runtime before dispatch starts.
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

## 3. Event Severity

The worker classifies persisted runtime events so the dashboard can highlight real failures without turning harmless CLI warnings into errors.

Default severities:

| Runtime event              | Persisted level |
| -------------------------- | --------------- |
| `session.failed`           | `error`         |
| `stderr`                   | `error`         |
| other non-heartbeat events | `info`          |

Known warning-shaped stderr is downgraded to `warn` and annotated with `severityReason: "known_stderr_warning"`.

Recognized warning forms:

- `Warning:` or `Warn:` lines.
- `[warn]` lines.
- `npm warn`, `pnpm warn`, and `yarn warn`.
- Node `DeprecationWarning` and `ExperimentalWarning`.
- Browserslist `caniuse-lite is outdated` messages.

If a stderr chunk contains error-shaped words such as `error`, `failed`, `fatal`, or `exception`, it remains `error` unless it is a Node warning class.

Startup preflight checks are persisted as project events:

- `worker.runtime_preflight_passed`
- `worker.runtime_preflight_failed`

If a selected runtime fails preflight, the worker logs the failed checks, closes MongoDB, and exits before claiming work.

## 4. Runtime Selection

Dashboard operators can set a work item's desired runtime to:

- `codex`
- `cursor`
- `fake`
- `generic`

`default` clears the preference. Cleared work can be claimed by any worker for the selected project.

Running work items cannot change runtime preference; the selection affects future dispatch only.

## 5. Supported Runtime Modes

### `fake`

Safe local runtime for smoke tests and dashboard development.

```env
AGENT_RUNTIME=fake
```

### `codex`

First-class CLI process runtime for Codex.

```env
AGENT_RUNTIME=codex
OPENAI_API_KEY=
CODEX_API_KEY=
CODEX_COMMAND=codex
CODEX_MODEL=gpt-5.1-codex
CODEX_REASONING_EFFORT=medium
CODEX_ARGS=--ask-for-approval never --sandbox workspace-write exec --json -
```

Codex inherits the hardened process behavior:

- Startup preflight checks `codex --version`.
- Startup preflight checks `codex exec --help`.
- Startup preflight checks `codex login status` when neither `CODEX_API_KEY` nor `OPENAI_API_KEY` is set.
- `CODEX_API_KEY` is passed to `codex exec` for automation. If only `OPENAI_API_KEY` is set, Symphony maps it to `CODEX_API_KEY` for the child process without changing the user's global Codex login.
- Optional `CODEX_MODEL` inserts `-m <model>` into the `exec` command unless `CODEX_ARGS` already includes `-m` or `--model`.
- Optional `CODEX_REASONING_EFFORT` inserts `-c model_reasoning_effort="<effort>"` before `exec` unless `CODEX_ARGS` already sets `model_reasoning_effort`.
- Prompt delivered through `stdin`.
- `stdout` JSONL parsed into sanitized Symphony events.
- Non-JSON `stdout` and `stderr` streamed as events.
- Heartbeats while waiting for output.
- Turn timeout.
- Stall timeout.
- Process-group cancellation with SIGTERM, then SIGKILL after a grace period.

Codex uses the CLI's noninteractive exec mode. The runtime sends the rendered Symphony prompt to stdin:

```txt
codex --ask-for-approval never --sandbox workspace-write exec --json -
```

Model availability depends on the installed Codex CLI, account, and auth method. For API-key automation, the current local smoke path is validated with `CODEX_MODEL=gpt-5.1-codex` and `CODEX_REASONING_EFFORT=medium`. Keep `CODEX_MODEL` empty to inherit the CLI default, or set both model and reasoning effort explicitly to avoid incompatible user-level Codex config.

When Codex emits JSONL, the adapter converts each line into sanitized Symphony events:

- assistant text becomes `message`
- tool, status, and system events become metadata-first `message` events
- user prompt events store prompt length instead of raw prompt text
- error events become `stderr`
- non-JSON output falls back to `stdout`

### `cursor`

First-class CLI process runtime for Cursor Agent CLI.

```env
AGENT_RUNTIME=cursor
CURSOR_API_KEY=
CURSOR_COMMAND=cursor-agent
CURSOR_OUTPUT_FORMAT=stream-json
CURSOR_FORCE=false
CURSOR_SANDBOX=enabled
CURSOR_TRUST_WORKSPACE=true
```

Cursor uses the CLI's noninteractive print mode. The runtime appends the rendered Symphony prompt as the final positional argument:

```txt
cursor-agent --print --output-format stream-json --sandbox enabled --trust "<rendered prompt>"
```

Set `CURSOR_FORCE=true` only inside disposable workspaces where the orchestrator is allowed to let Cursor make direct file changes without confirmation.

Set `CURSOR_SANDBOX=enabled` for headless worker runs unless a higher-level container or CI sandbox is already enforcing the boundary.

Set `CURSOR_TRUST_WORKSPACE=true` for orchestrator-created workspaces so headless Cursor runs do not block on an interactive trust prompt.

Cursor auth can come from `CURSOR_API_KEY` in `.env` or from an existing `cursor-agent login` session. Preflight checks the configured auth path before dispatching work to this runtime.

Cursor startup preflight checks:

- `cursor-agent --version`
- `cursor-agent status` when `CURSOR_API_KEY` is not set
- `CURSOR_API_KEY` presence when the key is set in `.env`

When Cursor emits `stream-json`, the adapter converts each NDJSON line into sanitized Symphony events:

- assistant/result text becomes `message`
- tool, user, and system events become metadata-only `message` events
- non-JSON output falls back to `stdout`

The parser intentionally stores user prompt length instead of raw prompt text.

The current local smoke path is validated with `CURSOR_OUTPUT_FORMAT=stream-json`, `CURSOR_SANDBOX=enabled`, `CURSOR_TRUST_WORKSPACE=true`, and `CURSOR_FORCE=false`.

Optional controls:

```env
CURSOR_MODEL=
CURSOR_ARGS=
CURSOR_SANDBOX=enabled
CURSOR_TRUST_WORKSPACE=true
```

When `CURSOR_ARGS` is set, it replaces the default Cursor arguments and the prompt is still appended as the final argument.

### `generic`

Generic noninteractive CLI runtime for other tools or wrappers.

```env
AGENT_RUNTIME=generic
AGENT_RUNTIME_NAME=cursor-wrapper
AGENT_RUNTIME_COMMAND=./tools/run-cursor-agent
AGENT_RUNTIME_ARGS=--json --non-interactive
```

Use this for Claude Code, OpenAI Agents SDK runners, internal agent tools, or wrappers when they can accept a prompt through stdin and run inside a workspace without manual editor interaction.

## 6. Runtime Environment

Common controls:

```env
AGENT_RUNTIME_TURN_TIMEOUT_MS=3600000
AGENT_RUNTIME_STALL_TIMEOUT_MS=300000
AGENT_RUNTIME_CANCEL_GRACE_MS=5000
```

Argument values can be whitespace-separated:

```env
CODEX_ARGS=--ask-for-approval never --sandbox workspace-write exec --json -
```

Or JSON for quoted arguments:

```env
AGENT_RUNTIME_ARGS=["run","--profile","agent mode"]
```

## 7. Tool Policy

Codex remains the reference runtime for the MVP because it maps directly to the Symphony-style orchestration model. Cursor Agent CLI is also first-class because it supports noninteractive automation through `cursor-agent --print`.

Other popular tools are supported through the adapter boundary when one of these is true:

- The tool exposes a noninteractive CLI.
- The tool exposes a local server or API.
- We build a small wrapper that converts the Symphony prompt into that tool's supported input format.

Desktop-only editor automation is not an MVP target because it is fragile, hard to cancel reliably, and hard to audit. It can be added later as a specialized adapter if needed.

## 8. Next Runtime Work

- Add per-runtime safety profiles for allowed file writes and command execution.

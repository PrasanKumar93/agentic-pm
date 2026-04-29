---
tracker:
  kind: fake
  active_states: ["Ready for Agent"]
  running_state: "Agent Running"
  review_state: "Human Review"
  terminal_states: ["Done", "Cancelled", "Duplicate"]
polling:
  interval_ms: 30000
workspace:
  root: "$AGENTIC_PM_WORKSPACE_ROOT"
agent:
  max_concurrent_agents: 1
  max_turns: 1
  max_retry_backoff_ms: 300000
codex:
  command: "codex"
  args: ["--ask-for-approval", "never", "--sandbox", "workspace-write", "exec", "--json", "--skip-git-repo-check", "-"]
  turn_timeout_ms: 300000
  stall_timeout_ms: 120000
hooks: {}
---

You are running a bounded Symphony Cursor runtime smoke test for {{ issue.identifier }}.

Reply with exactly one short sentence that starts with:
SYMPHONY_CURSOR_SMOKE_OK

Do not edit files.
Do not run commands.
Do not create commits.

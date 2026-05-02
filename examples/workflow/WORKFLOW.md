---
tracker:
  kind: linear
  team_key: ENG
  active_states: ["Ready for Agent", "Changes Requested"]
  running_state: "Agent Running"
  review_state: "Human Review"
  terminal_states: ["Done", "Cancelled", "Duplicate"]
polling:
  interval_ms: 30000
workspace:
  root: "$AGENTIC_PM_WORKSPACE_ROOT"
agent:
  max_concurrent_agents: 3
  max_turns: 20
  max_retry_backoff_ms: 300000
codex:
  command: "codex"
  args: ["exec", "--json", "-"]
  approval_policy: "never"
  sandbox: "workspace-write"
  skip_git_repo_check: false
  turn_timeout_ms: 3600000
  stall_timeout_ms: 300000
hooks:
  after_create: |
    git clone git@github.com:your-org/your-repo.git .
  before_run: |
    pnpm install --frozen-lockfile
---

You are working on {{ issue.identifier }}: {{ issue.title }}.

Issue description:
{{ issue.description }}

Repository:
{{ repository.name }}

Use the existing code style. Keep the change focused. Run relevant tests.

When ready, prepare a review packet with:
- Summary
- Tests run
- Risk notes
- Screenshots or videos if UI changed
- Follow-up issues

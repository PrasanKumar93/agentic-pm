# MVP Checklist

## Milestone 1: Skeleton

- [x] Create monorepo layout.
- [x] Add package manifests and TypeScript config.
- [x] Add initial API, worker, CLI, and web app entrypoints.
- [x] Add shared domain models.
- [x] Add MongoDB repository layer.
- [x] Add fake and Linear tracker adapters.
- [x] Add workspace and agent runtime interfaces.
- [x] Add Docker Compose for MongoDB and Redis.
- [x] Flatten project files so the Git root is the Agentic PM project root.

## Milestone 2: First Local Loop

- [x] Install dependencies.
- [x] Validate TypeScript builds.
- [x] Run MongoDB and Redis locally.
- [x] Seed a fake tracker issue.
- [x] Claim an issue as a work item.
- [x] Create a workspace for the issue.
- [x] Run a fake agent and capture events.
- [x] Show the run in the dashboard from live API data.
- [x] Control work item queue state from dashboard operator actions.
- [x] Show the selected run event timeline in the dashboard.
- [x] Control project dispatch from the dashboard toolbar.
- [x] Show action result banners after dashboard actions.
- [x] Filter dashboard work board by status lane.
- [x] Add dry-run local smoke/test cleanup tooling.
- [x] Scope the dashboard by selected project.
- [x] Select a repository while creating local work items.
- [x] Create local tracker-backed work items from the dashboard.
- [x] Register managed repositories from the dashboard.

## Milestone 3: Linear Loop

- [x] Configure Linear API key and team key.
- [x] Move non-secret Linear team/state mapping into versioned TypeScript config.
- [x] Add webhook signature validation.
- [x] Add Linear setup guide.
- [x] Poll Linear active states.
- [x] Upsert Linear issues into MongoDB.
- [x] Move issues to `Agent Running` when claimed.
- [x] Comment run start/failure/review packet back to Linear.
- [x] Move completed agent output to `Human Review`.
- [x] Show tracker and Linear config health in the dashboard.
- [x] Verify Linear team key and workflow states from the dashboard.
- [x] Run a live Linear worker smoke with fake runtime.
- [x] Sync operator cancel/complete actions to Linear terminal states.
- [x] Normalize verified Linear issue webhooks into MongoDB.
- [x] Deduplicate Linear webhook deliveries by `Linear-Delivery`.
- [x] Show webhook delivery replay audit in the dashboard.

## Milestone 4: Agent Runtime Loop

- [x] Verify Codex `exec --json` CLI surface locally.
- [x] Add configurable Codex, Cursor, and generic CLI runtime adapters.
- [x] Add startup preflight checks for Codex and Cursor runtime setup.
- [x] Add process runtime heartbeat, stall timeout, and cancellation hardening.
- [x] Parse Cursor `stream-json` output into sanitized runtime events.
- [x] Parse Codex `exec --json` output into sanitized runtime events.
- [x] Run a real Codex runtime adapter from the worker.
- [x] Verify Cursor Agent CLI noninteractive mode locally.
- [x] Persist parsed runtime events through the worker event stream.
- [x] Route work items by desired runtime for Codex/Cursor worker selection.
- [x] Run a live Linear issue through the real Codex runtime.
- [x] Assign project default repositories to tracker-ingested Linear work items.
- [x] Resolve workspace paths absolutely before runtime execution.
- [x] Run a live Linear issue through the real Cursor runtime.
- [x] Verify mixed Codex/Cursor routing against live Linear work items.
- [x] Add worker-side cancellation checks.
- [x] Add stall detection.
- [x] Materialize selected repositories into agent workspaces.
- [x] Add artifact capture for logs and patches.
- [x] Generate local review packet artifacts.
- [x] Create PR and review packet from agent output.
- [x] Optionally create remote GitHub draft PRs after explicit config.
- [x] Open PR drafts and remote PR artifacts from the dashboard.
- [x] Open local log, patch, test report, review packet, and plan artifacts from the dashboard.
- [x] Show full run timelines and long artifact lists in explicit scroll regions.
- [x] Prioritize run artifacts above compact event timeline rows in the detail panel.
- [x] Add a review change-request action that reruns Codex/Cursor on the existing PR branch and pushes a follow-up commit.
- [x] Handle Cursor/Codex self-committed clean workspaces by pushing the advanced HEAD to the same PR branch.
- [x] Let queued dispatch proceed when tracker polling has a transient failure.
- [x] Show persisted review feedback history in the run detail panel.
- [x] Show GitHub PR readiness, review state, and checks in the run detail panel.

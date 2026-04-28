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

## Milestone 2: First Local Loop

- [ ] Install dependencies.
- [ ] Validate TypeScript builds.
- [ ] Run MongoDB and Redis locally.
- [ ] Seed a fake tracker issue.
- [ ] Claim an issue as a work item.
- [ ] Create a workspace for the issue.
- [ ] Run a fake agent and capture events.
- [ ] Show the run in the dashboard.

## Milestone 3: Linear Loop

- [ ] Configure Linear API key and team key.
- [ ] Add webhook signature validation.
- [ ] Poll Linear active states.
- [ ] Upsert Linear issues into MongoDB.
- [ ] Move issues to `Agent Running` when claimed.
- [ ] Comment run start/failure/review packet back to Linear.
- [ ] Move completed agent output to `Human Review`.

## Milestone 4: Codex Loop

- [ ] Verify Codex app-server protocol locally.
- [ ] Replace fake runtime with Codex runtime adapter.
- [ ] Stream Codex events into MongoDB.
- [ ] Add stall detection and cancellation.
- [ ] Add artifact capture for logs and patches.
- [ ] Create PR and review packet from agent output.

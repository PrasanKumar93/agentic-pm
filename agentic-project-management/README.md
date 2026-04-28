# Agentic Project Management

A TypeScript/Node control plane for Symphony-style agentic software delivery.

The MVP uses Linear as the ticket source, MongoDB for durable state, Redis/BullMQ for execution queues, and a Next.js dashboard as the operator console.

## Current Milestone

This repository is being scaffolded toward a local-first MVP:

- `apps/api`: Fastify API for webhooks, dashboard reads, and operator actions.
- `apps/worker`: orchestrator and agent runner.
- `apps/web`: Next.js operations console.
- `apps/cli`: local diagnostics and manual commands.
- `packages/*`: shared domain, config, MongoDB, trackers, agent runtime, workspace, and git modules.

## Local Bootstrap

```sh
pnpm install
cp .env.example .env
docker compose -f docker/docker-compose.yml up -d
pnpm dev
```

The first usable loop will be:

1. Create a Linear issue in `Ready for Agent`.
2. The API/worker normalizes it into MongoDB.
3. The worker claims the work item and prepares a workspace.
4. The agent runtime executes against the rendered `WORKFLOW.md`.
5. The dashboard shows run status, events, and artifacts.

## Docs

- [Plan](docs/PLAN.md)
- [Current Work](docs/CURRENT_WORK.md)
- [MVP Checklist](docs/MVP_CHECKLIST.md)
- [Live Dashboard Spec](docs/LIVE_DASHBOARD_SPEC.md)
- [Operator Actions Spec](docs/OPERATOR_ACTIONS_SPEC.md)
- [Run Detail Timeline Spec](docs/RUN_DETAIL_TIMELINE_SPEC.md)
- [Dispatch Controls Spec](docs/DISPATCH_CONTROLS_SPEC.md)
- [Worker Cancellation Spec](docs/WORKER_CANCELLATION_SPEC.md)
- [Linear Integration Spec](docs/LINEAR_INTEGRATION_SPEC.md)
- [Action Feedback Spec](docs/ACTION_FEEDBACK_SPEC.md)

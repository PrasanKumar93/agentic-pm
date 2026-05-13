# Local Cleanup Spec

Status: Draft v0.1
Date: 2026-04-29

## 1. Purpose

Local smoke runs create useful validation data, but repeated fake, Codex, Cursor, webhook, and Linear sync tests can clutter the dashboard.

The cleanup command provides a safe way to inspect and remove local smoke/test MongoDB documents without touching normal project data or generated workspace folders.

## 2. Command Contract

Dry-run is the default:

```txt
pnpm cleanup:smoke
```

Apply deletion:

```txt
pnpm cleanup:smoke -- --apply
```

Target a specific project:

```txt
pnpm cleanup:smoke -- --project project_webhook_idempotency_smoke
```

Machine-readable output:

```txt
pnpm cleanup:smoke -- --json
```

## 3. Target Selection

Without explicit `--project` values, the command discovers project IDs from MongoDB collections and includes only IDs that contain `smoke` or `test`.

Default discovery excludes `project_local`. To clean any non-smoke project, the operator must pass it explicitly with `--project`.

The command reads `.env` automatically and uses:

- `MONGODB_URI`, defaulting to `mongodb://localhost:27018`
- `MONGODB_DB`, defaulting to `agentic_pm`

It never prints secrets.

## 4. Delete Scope

The command can delete these MongoDB documents:

- `work_items` for target projects
- `runs` attached to those work items
- `run_events` attached by target project, work item, or run
- `artifacts` attached to those runs
- `operator_actions` attached by target project, work item, or run
- `webhook_deliveries` for target projects
- `dispatch_controls` for target projects
- `issues` referenced only by deleted work items

It does not delete local workspace folders, repository checkouts, `.env`, or any files on disk.

## 4.1 Generated Workspace Cleanup

Generated workspace folders use a separate dry-run-first command:

```txt
pnpm cleanup:workspaces
pnpm cleanup:workspaces -- --apply
```

This command scans `AGENTIC_PM_WORKSPACE_ROOT`, defaults to candidates older
than `7d`, skips dirty git workspaces, and only removes candidates when
`--apply` is present. It is intentionally separate from smoke Mongo cleanup so
database document removal and filesystem workspace removal are explicit choices.

## 5. Safety Rules

- `--apply` is required for deletion.
- Dry-run output reports target project IDs and per-collection document counts.
- Issues are deleted only when no retained work item references the issue.
- Default discovery avoids `project_local`.
- The first version is CLI-only; dashboard delete controls can be added later with confirmation and audit logging.

## 6. Validation

Required checks:

- `pnpm cleanup:smoke`
- `pnpm cleanup:workspaces`
- `pnpm typecheck`
- `pnpm build`

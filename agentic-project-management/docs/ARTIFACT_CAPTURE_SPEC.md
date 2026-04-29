# Artifact Capture Spec

Status: Draft v0.3
Date: 2026-04-29

## 1. Purpose

Every agent run should leave durable proof of work beyond transient logs. This slice captures local artifacts, stores their metadata in MongoDB, and surfaces them in the dashboard run detail panel.

## 2. Scope

Covered:

- Agent event log artifact.
- Git patch artifact when the workspace is a git repository and has a diff.
- Local PR draft artifact when the workspace is a git repository and has changed files.
- Optional GitHub draft PR creation metadata when explicitly configured.
- Review packet artifact for successful runs.
- Artifact metadata registration in MongoDB.
- Artifact list in the dashboard for the selected run.
- Safe local text artifact content reads through the API.
- Dashboard PR artifact actions for local drafts and remote PRs.

Not covered:

- Object storage upload.
- Screenshot or video capture.
- Runtime-specific parsing of final summaries or test reports.

## 3. Storage

Artifacts are written under:

```txt
$AGENTIC_PM_ARTIFACT_ROOT/<project-slug>/<run-id>/
```

Default:

```txt
./artifacts
```

The worker registers every captured artifact in the `artifacts` collection:

```json
{
  "id": "art_123",
  "runId": "run_123",
  "type": "review_packet",
  "uri": "/absolute/path/artifacts/local/run_123/review-packet.md",
  "summary": "Review packet for ENG-1",
  "metadata": {
    "local": true,
    "byteLength": 512
  },
  "createdAt": "2026-04-29T12:00:00.000Z"
}
```

Each successful registration writes an `artifact.created` run event.

## 4. Worker Behavior

### All Terminal Agent Runs

The worker captures `agent-events.log` from non-heartbeat runtime events.

### Successful Runs

The worker also captures:

- `workspace.patch` when `git diff --patch --binary` returns content.
- `pull-request.md` with suggested branch, commit, push, and draft PR creation commands.
- `review-packet.md` with run metadata, review notes, risks, and captured artifacts.

When `AGENTIC_PM_PR_MODE=github_draft`, the `pull-request.md` artifact also records the remote PR result. Metadata includes `mode`, `remoteStatus`, `remoteName`, `commitSha`, and `remotePrUrl` when available.

### Failure Handling

Artifact capture errors do not hide the run result. The worker records `artifact.capture_failed` and continues finalizing the run.

## 5. Dashboard Behavior

The run detail panel fetches:

```txt
GET /runs/:runId/artifacts
```

It renders artifact type, summary, local path suffix, relative capture time, and an action for readable local text artifacts.

For readable local text artifacts, the dashboard renders:

- `Open log` for local `log` artifacts.
- `Open patch` for local `patch` artifacts.
- `Open draft` for local `pr` artifacts without a remote URL.
- `Open report` for local `test_report` artifacts.
- `Open packet` for local `review_packet` artifacts.
- `Open plan` for local `plan` artifacts.

For remote PR artifacts, the dashboard renders:

- `Open PR` when artifact metadata contains `remotePrUrl`.

The API text-read endpoint is:

```txt
GET /artifacts/:artifactId/content
```

It only serves registered local text artifacts where `metadata.local === true`. Supported text types are `log`, `patch`, `pr`, `test_report`, `review_packet`, and `plan`.

## 6. Validation

Required checks:

- `pnpm typecheck`
- `pnpm build`
- Generic runtime smoke test
- Worker fake one-shot smoke test
- API artifact endpoint smoke test
- Dashboard smoke test at `http://localhost:3000`

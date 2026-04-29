# Artifact Capture Spec

Status: Draft v0.1
Date: 2026-04-29

## 1. Purpose

Every agent run should leave durable proof of work beyond transient logs. This slice captures local artifacts, stores their metadata in MongoDB, and surfaces them in the dashboard run detail panel.

## 2. Scope

Covered:

- Agent event log artifact.
- Git patch artifact when the workspace is a git repository and has a diff.
- Local PR draft artifact when the workspace is a git repository and has changed files.
- Review packet artifact for successful runs.
- Artifact metadata registration in MongoDB.
- Artifact list in the dashboard for the selected run.

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

### Failure Handling

Artifact capture errors do not hide the run result. The worker records `artifact.capture_failed` and continues finalizing the run.

## 5. Dashboard Behavior

The run detail panel fetches:

```txt
GET /runs/:runId/artifacts
```

It renders artifact type, summary, local path suffix, and relative capture time.

## 6. Validation

Required checks:

- `pnpm typecheck`
- `pnpm build`
- Generic runtime smoke test
- Worker fake one-shot smoke test
- API artifact endpoint smoke test
- Dashboard smoke test at `http://localhost:3000`

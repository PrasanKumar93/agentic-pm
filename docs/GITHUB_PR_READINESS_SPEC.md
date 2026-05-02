# GitHub PR Readiness Spec

Status: Draft v0.1
Date: 2026-05-02

## 1. Purpose

Symphony should help the operator understand whether a review-state work item is actually ready to merge, without merging automatically. This slice adds read-only GitHub PR readiness to the run detail panel.

## 2. Scope

Covered:

- Parse `github.com/<owner>/<repo>/pull/<number>` URLs from existing PR artifact metadata.
- Fetch GitHub PR state, draft flag, mergeability, review summary, and check status.
- Surface readiness in the dashboard above the review-change form.
- Degrade gracefully when a PR artifact is local-only, not a GitHub URL, unavailable, private, or rate-limited.

Not covered:

- Auto-merge.
- Changing PR draft state.
- Posting GitHub reviews or comments.
- Branch protection rule introspection.

## 3. API Contract

```http
GET /artifacts/:artifactId/pr-status
```

The endpoint requires a `pr` artifact with `metadata.remotePrUrl`.

Successful response:

```json
{
  "data": {
    "provider": "github",
    "owner": "PrasanKumar93",
    "repo": "test-linear-app",
    "number": 3,
    "url": "https://github.com/PrasanKumar93/test-linear-app/pull/3",
    "state": "open",
    "draft": true,
    "mergeable": false,
    "mergeableState": "dirty",
    "headRef": "agent/pra-7-example",
    "headSha": "8056b0a",
    "baseRef": "main",
    "review": {
      "status": "review_required",
      "approvals": 0,
      "changesRequested": 0,
      "comments": 0
    },
    "checks": {
      "status": "none",
      "total": 0,
      "passed": 0,
      "failed": 0,
      "pending": 0,
      "skipped": 0,
      "checkRuns": [],
      "errors": []
    },
    "readiness": {
      "status": "blocked",
      "reasons": [
        "Pull request is still a draft.",
        "Pull request has merge conflicts."
      ]
    },
    "authenticated": false,
    "fetchedAt": "2026-05-02T06:03:52.552Z"
  }
}
```

Error responses:

- `404`: artifact does not exist.
- `409`: artifact is not a PR artifact, or the PR artifact has no remote URL.
- `422`: remote URL is not a supported GitHub PR URL.

## 4. Readiness Rules

- `blocked` when the PR is closed/unmerged, draft, conflicted, has requested changes, or has failing checks.
- `pending` when mergeability is still calculating, reviews are missing, or checks are pending.
- `unknown` when GitHub state cannot be loaded.
- `ready` when the PR is open, not draft, reviews are clear/approved, mergeability is clear, and checks are passing. If GitHub reports no checks, Symphony shows that as an informational reason instead of pretending checks passed.

## 5. Authentication

Public PRs can be checked unauthenticated. Private repositories or higher rate limits can use any of:

```env
AGENTIC_PM_GITHUB_TOKEN=...
AGENTIC_PM_GITHUB_API_TOKEN=...
GITHUB_TOKEN=...
GH_TOKEN=...
```

The dashboard only exposes whether a request was authenticated; it never renders token values.

## 6. Validation

Required checks:

- `pnpm --filter @agentic-pm/api test`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- Local API smoke against a linked PR artifact
- Full-width dashboard screenshot verifying the readiness card

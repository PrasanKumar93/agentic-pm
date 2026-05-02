import { describe, expect, it } from "vitest";
import {
  computePullRequestReadiness,
  parseGithubPullRequestUrl,
  summarizeGithubChecks,
  summarizeGithubReviews,
  type PullRequestStatusSummary,
} from "./github-pr.js";

describe("GitHub PR status helpers", () => {
  it("parses canonical GitHub pull request URLs", () => {
    expect(
      parseGithubPullRequestUrl(
        "https://github.com/PrasanKumar93/test-linear-app/pull/3",
      ),
    ).toEqual({
      number: 3,
      owner: "PrasanKumar93",
      repo: "test-linear-app",
      url: "https://github.com/PrasanKumar93/test-linear-app/pull/3",
    });
  });

  it("rejects non-GitHub and malformed pull request URLs", () => {
    expect(
      parseGithubPullRequestUrl(
        "https://github.com/PrasanKumar93/test-linear-app/issues/3",
      ),
    ).toBeUndefined();
    expect(
      parseGithubPullRequestUrl(
        "https://example.com/PrasanKumar93/test-linear-app/pull/3",
      ),
    ).toBeUndefined();
    expect(
      parseGithubPullRequestUrl(
        "file:///Users/prasanrajpurohit/Documents/secrets.txt",
      ),
    ).toBeUndefined();
  });

  it("uses the latest review per actor for review readiness", () => {
    const summary = summarizeGithubReviews([
      {
        state: "CHANGES_REQUESTED",
        submitted_at: "2026-04-30T10:00:00.000Z",
        user: { login: "reviewer" },
      },
      {
        state: "APPROVED",
        submitted_at: "2026-04-30T11:00:00.000Z",
        user: { login: "reviewer" },
      },
      {
        state: "COMMENTED",
        submitted_at: "2026-04-30T12:00:00.000Z",
        user: { login: "observer" },
      },
    ]);

    expect(summary).toMatchObject({
      approvals: 1,
      changesRequested: 0,
      comments: 1,
      status: "approved",
    });
  });

  it("combines check runs and legacy statuses", () => {
    const summary = summarizeGithubChecks(
      [
        {
          conclusion: "success",
          name: "test",
          status: "completed",
        },
        {
          conclusion: "failure",
          name: "lint",
          status: "completed",
        },
        {
          name: "deploy-preview",
          status: "in_progress",
        },
      ],
      [
        {
          context: "ci/build",
          state: "success",
        },
      ],
    );

    expect(summary).toMatchObject({
      failed: 1,
      passed: 2,
      pending: 1,
      status: "failure",
      total: 4,
    });
  });

  it("marks draft PRs as blocked even when checks pass", () => {
    const summary = basePullRequestStatus({
      checks: summarizeGithubChecks(
        [{ conclusion: "success", name: "test", status: "completed" }],
        [],
      ),
      draft: true,
      review: {
        approvals: 1,
        changesRequested: 0,
        comments: 0,
        status: "approved",
      },
    });

    expect(computePullRequestReadiness(summary)).toEqual({
      reasons: ["Pull request is still a draft."],
      status: "blocked",
    });
  });

  it("marks open approved PRs with passing checks as ready", () => {
    const summary = basePullRequestStatus({
      checks: summarizeGithubChecks(
        [{ conclusion: "success", name: "test", status: "completed" }],
        [],
      ),
      review: {
        approvals: 1,
        changesRequested: 0,
        comments: 0,
        status: "approved",
      },
    });

    expect(computePullRequestReadiness(summary).status).toBe("ready");
  });

  it("treats already merged PRs as ready for Symphony completion", () => {
    const summary = basePullRequestStatus({
      checks: summarizeGithubChecks(
        [{ conclusion: "success", name: "test", status: "completed" }],
        [],
      ),
      merged: true,
      review: {
        approvals: 1,
        changesRequested: 0,
        comments: 0,
        status: "approved",
      },
      state: "closed",
    });

    expect(computePullRequestReadiness(summary)).toEqual({
      reasons: ["Pull request is already merged."],
      status: "ready",
    });
  });
});

function basePullRequestStatus(
  overrides: Partial<Omit<PullRequestStatusSummary, "readiness">> = {},
): Omit<PullRequestStatusSummary, "readiness"> {
  return {
    authenticated: false,
    baseRef: "main",
    checks: {
      checkRuns: [],
      errors: [],
      failed: 0,
      passed: 0,
      pending: 0,
      skipped: 0,
      status: "none",
      total: 0,
    },
    draft: false,
    fetchedAt: "2026-04-30T12:00:00.000Z",
    headRef: "agent/test",
    headSha: "abc123",
    mergeable: true,
    mergeableState: "clean",
    merged: false,
    number: 3,
    owner: "PrasanKumar93",
    provider: "github",
    repo: "test-linear-app",
    review: {
      approvals: 0,
      changesRequested: 0,
      comments: 0,
      status: "review_required",
    },
    state: "open",
    url: "https://github.com/PrasanKumar93/test-linear-app/pull/3",
    ...overrides,
  };
}

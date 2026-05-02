export type PullRequestReadinessStatus =
  | "ready"
  | "blocked"
  | "pending"
  | "unknown";

export type PullRequestReviewStatus =
  | "approved"
  | "changes_requested"
  | "commented"
  | "review_required"
  | "unknown";

export type PullRequestChecksStatus =
  | "success"
  | "failure"
  | "pending"
  | "none"
  | "unknown";

export interface GithubPullRequestCoordinates {
  owner: string;
  repo: string;
  number: number;
  url: string;
}

export interface PullRequestReviewSummary {
  status: PullRequestReviewStatus;
  approvals: number;
  changesRequested: number;
  comments: number;
  latestReviewedAt?: string;
}

export interface PullRequestCheckSummary {
  name: string;
  status: string;
  conclusion?: string;
  url?: string;
  completedAt?: string;
}

export interface PullRequestChecksSummary {
  status: PullRequestChecksStatus;
  total: number;
  passed: number;
  failed: number;
  pending: number;
  skipped: number;
  checkRuns: PullRequestCheckSummary[];
  errors: string[];
}

export interface PullRequestReadinessSummary {
  status: PullRequestReadinessStatus;
  reasons: string[];
}

export interface PullRequestStatusSummary extends GithubPullRequestCoordinates {
  provider: "github";
  title?: string;
  state: string;
  draft?: boolean;
  merged?: boolean;
  mergeable?: boolean | null;
  mergeableState?: string;
  headRef?: string;
  headSha?: string;
  baseRef?: string;
  review: PullRequestReviewSummary;
  checks: PullRequestChecksSummary;
  readiness: PullRequestReadinessSummary;
  fetchedAt: string;
  authenticated: boolean;
  error?: string;
  rateLimited?: boolean;
}

export interface FetchGithubPullRequestStatusOptions {
  apiBaseUrl?: string;
  fetch?: typeof fetch;
  now?: Date;
  token?: string;
}

type FetchJsonResult<T> =
  | {
      data: T;
      ok: true;
    }
  | {
      error: string;
      ok: false;
      rateLimited?: boolean;
      status?: number;
    };

type GithubPullRequestResponse = {
  base?: {
    ref?: string;
  };
  draft?: boolean;
  head?: {
    ref?: string;
    sha?: string;
  };
  html_url?: string;
  mergeable?: boolean | null;
  mergeable_state?: string | null;
  merged?: boolean;
  state?: string;
  title?: string;
};

export type GithubPullRequestReview = {
  submitted_at?: string;
  state?: string;
  user?: {
    id?: number;
    login?: string;
  };
};

export type GithubCheckRun = {
  completed_at?: string;
  conclusion?: string | null;
  details_url?: string | null;
  html_url?: string | null;
  name?: string;
  status?: string;
};

type GithubCheckRunsResponse = {
  check_runs?: GithubCheckRun[];
};

type GithubCombinedStatusResponse = {
  statuses?: GithubCommitStatus[];
};

export type GithubCommitStatus = {
  context?: string;
  state?: string;
  target_url?: string | null;
  updated_at?: string;
};

const githubOwnerOrRepoPattern = /^[A-Za-z0-9_.-]{1,100}$/;
const successfulCheckConclusions = new Set(["success", "neutral"]);
const skippedCheckConclusions = new Set(["skipped"]);
const failedCheckConclusions = new Set([
  "action_required",
  "cancelled",
  "failure",
  "startup_failure",
  "stale",
  "timed_out",
]);

export function parseGithubPullRequestUrl(
  value: string,
): GithubPullRequestCoordinates | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return undefined;
    }

    if (url.hostname !== "github.com" && url.hostname !== "www.github.com") {
      return undefined;
    }

    const [owner, repo, pullSegment, numberSegment] = url.pathname
      .split("/")
      .filter(Boolean);
    if (
      !owner ||
      !repo ||
      pullSegment !== "pull" ||
      !numberSegment ||
      !githubOwnerOrRepoPattern.test(owner) ||
      !githubOwnerOrRepoPattern.test(repo) ||
      !/^[1-9][0-9]*$/.test(numberSegment)
    ) {
      return undefined;
    }

    const number = Number(numberSegment);
    if (!Number.isSafeInteger(number)) {
      return undefined;
    }

    return {
      owner,
      repo,
      number,
      url: `https://github.com/${owner}/${repo}/pull/${number}`,
    };
  } catch {
    return undefined;
  }
}

export async function fetchGithubPullRequestStatus(
  input: GithubPullRequestCoordinates | string,
  options: FetchGithubPullRequestStatusOptions = {},
): Promise<PullRequestStatusSummary> {
  const coordinates =
    typeof input === "string" ? parseGithubPullRequestUrl(input) : input;
  const fetchedAt = (options.now ?? new Date()).toISOString();
  const token = options.token?.trim();
  const authenticated = Boolean(token);

  if (!coordinates) {
    return buildUnknownStatus({
      authenticated,
      error: "Unsupported GitHub pull request URL.",
      fetchedAt,
      owner: "unknown",
      repo: "unknown",
      number: 0,
      url: "",
    });
  }

  const apiBaseUrl = (options.apiBaseUrl ?? "https://api.github.com").replace(
    /\/+$/,
    "",
  );
  const headers = githubHeaders(token);
  const fetchImpl = options.fetch ?? fetch;
  const repoPath = `/repos/${encodeURIComponent(
    coordinates.owner,
  )}/${encodeURIComponent(coordinates.repo)}`;
  const pullRequestResult = await fetchJson<GithubPullRequestResponse>(
    `${apiBaseUrl}${repoPath}/pulls/${coordinates.number}`,
    headers,
    fetchImpl,
  );

  if (!pullRequestResult.ok) {
    return buildUnknownStatus({
      ...coordinates,
      authenticated,
      error: pullRequestResult.error,
      fetchedAt,
      rateLimited: pullRequestResult.rateLimited,
    });
  }

  const pullRequest = pullRequestResult.data;
  const headSha = pullRequest.head?.sha;
  const [reviewsResult, checkRunsResult, statusesResult] = await Promise.all([
    fetchJson<GithubPullRequestReview[]>(
      `${apiBaseUrl}${repoPath}/pulls/${coordinates.number}/reviews`,
      headers,
      fetchImpl,
    ),
    headSha
      ? fetchJson<GithubCheckRunsResponse>(
          `${apiBaseUrl}${repoPath}/commits/${headSha}/check-runs?per_page=100`,
          headers,
          fetchImpl,
        )
      : Promise.resolve<FetchJsonResult<GithubCheckRunsResponse>>({
          data: { check_runs: [] },
          ok: true,
        }),
    headSha
      ? fetchJson<GithubCombinedStatusResponse>(
          `${apiBaseUrl}${repoPath}/commits/${headSha}/status`,
          headers,
          fetchImpl,
        )
      : Promise.resolve<FetchJsonResult<GithubCombinedStatusResponse>>({
          data: { statuses: [] },
          ok: true,
        }),
  ]);

  const review = reviewsResult.ok
    ? summarizeGithubReviews(reviewsResult.data)
    : {
        approvals: 0,
        changesRequested: 0,
        comments: 0,
        status: "unknown" as const,
      };
  const checkErrors = [
    checkRunsResult.ok ? undefined : checkRunsResult.error,
    statusesResult.ok ? undefined : statusesResult.error,
  ].filter((error): error is string => Boolean(error));
  const checks = summarizeGithubChecks(
    checkRunsResult.ok ? (checkRunsResult.data.check_runs ?? []) : [],
    statusesResult.ok ? (statusesResult.data.statuses ?? []) : [],
    checkErrors,
  );
  const summary: PullRequestStatusSummary = {
    ...coordinates,
    provider: "github",
    title: pullRequest.title,
    state: pullRequest.state ?? "unknown",
    draft: pullRequest.draft,
    merged: pullRequest.merged,
    mergeable: pullRequest.mergeable,
    mergeableState: pullRequest.mergeable_state ?? undefined,
    headRef: pullRequest.head?.ref,
    headSha,
    baseRef: pullRequest.base?.ref,
    review,
    checks,
    readiness: {
      reasons: [],
      status: "unknown",
    },
    fetchedAt,
    authenticated,
    url: pullRequest.html_url ?? coordinates.url,
    rateLimited:
      (!reviewsResult.ok && reviewsResult.rateLimited) ||
      (!checkRunsResult.ok && checkRunsResult.rateLimited) ||
      (!statusesResult.ok && statusesResult.rateLimited),
  };
  summary.readiness = computePullRequestReadiness(summary);

  return summary;
}

export function summarizeGithubReviews(
  reviews: GithubPullRequestReview[],
): PullRequestReviewSummary {
  const latestReviewByActor = new Map<string, GithubPullRequestReview>();

  for (const review of reviews) {
    const state = review.state?.toUpperCase();
    if (!state || state === "PENDING") {
      continue;
    }

    const actor =
      review.user?.login ?? (review.user?.id ? String(review.user.id) : "user");
    const previous = latestReviewByActor.get(actor);
    if (
      !previous ||
      compareIsoTimestamp(review.submitted_at, previous.submitted_at) >= 0
    ) {
      latestReviewByActor.set(actor, review);
    }
  }

  let approvals = 0;
  let changesRequested = 0;
  let comments = 0;
  let latestReviewedAt: string | undefined;

  for (const review of latestReviewByActor.values()) {
    const state = review.state?.toUpperCase();
    if (state === "APPROVED") {
      approvals += 1;
    } else if (state === "CHANGES_REQUESTED") {
      changesRequested += 1;
    } else if (state === "COMMENTED") {
      comments += 1;
    }

    if (
      review.submitted_at &&
      compareIsoTimestamp(review.submitted_at, latestReviewedAt) > 0
    ) {
      latestReviewedAt = review.submitted_at;
    }
  }

  return {
    approvals,
    changesRequested,
    comments,
    latestReviewedAt,
    status:
      changesRequested > 0
        ? "changes_requested"
        : approvals > 0
          ? "approved"
          : comments > 0
            ? "commented"
            : "review_required",
  };
}

export function summarizeGithubChecks(
  checkRuns: GithubCheckRun[],
  statuses: GithubCommitStatus[],
  errors: string[] = [],
): PullRequestChecksSummary {
  let passed = 0;
  let failed = 0;
  let pending = 0;
  let skipped = 0;
  const summaries: PullRequestCheckSummary[] = [];

  for (const checkRun of checkRuns) {
    const status = checkRun.status ?? "unknown";
    const conclusion = checkRun.conclusion ?? undefined;
    if (status !== "completed") {
      pending += 1;
    } else if (conclusion && failedCheckConclusions.has(conclusion)) {
      failed += 1;
    } else if (conclusion && skippedCheckConclusions.has(conclusion)) {
      skipped += 1;
    } else if (conclusion && successfulCheckConclusions.has(conclusion)) {
      passed += 1;
    } else {
      pending += 1;
    }

    summaries.push({
      completedAt: checkRun.completed_at,
      conclusion,
      name: checkRun.name ?? "check",
      status,
      url: checkRun.html_url ?? checkRun.details_url ?? undefined,
    });
  }

  for (const status of statuses) {
    const state = status.state ?? "unknown";
    if (state === "success") {
      passed += 1;
    } else if (state === "failure" || state === "error") {
      failed += 1;
    } else {
      pending += 1;
    }

    summaries.push({
      completedAt: status.updated_at,
      conclusion: state,
      name: status.context ?? "status",
      status: "completed",
      url: status.target_url ?? undefined,
    });
  }

  const total = passed + failed + pending + skipped;
  const status: PullRequestChecksStatus =
    errors.length > 0 && total === 0
      ? "unknown"
      : failed > 0
        ? "failure"
        : pending > 0
          ? "pending"
          : total === 0
            ? "none"
            : "success";

  return {
    checkRuns: summaries.sort((left, right) =>
      left.name.localeCompare(right.name),
    ),
    errors,
    failed,
    passed,
    pending,
    skipped,
    status,
    total,
  };
}

export function computePullRequestReadiness(
  summary: Omit<PullRequestStatusSummary, "readiness">,
): PullRequestReadinessSummary {
  const blockers: string[] = [];
  const pending: string[] = [];
  const unknown: string[] = [];
  const informational: string[] = [];

  if (summary.error) {
    unknown.push(summary.error);
  }

  if (summary.state !== "open") {
    blockers.push(
      summary.merged ? "Pull request is already merged." : "Pull request is not open.",
    );
  }

  if (summary.draft) {
    blockers.push("Pull request is still a draft.");
  }

  if (summary.mergeable === false || summary.mergeableState === "dirty") {
    blockers.push("Pull request has merge conflicts.");
  } else if (summary.mergeable === null || summary.mergeable === undefined) {
    pending.push("GitHub is still calculating mergeability.");
  }

  if (summary.review.status === "changes_requested") {
    blockers.push("At least one reviewer requested changes.");
  } else if (summary.review.status === "review_required") {
    pending.push("No approving review is recorded yet.");
  } else if (summary.review.status === "unknown") {
    unknown.push("Review state could not be loaded.");
  }

  if (summary.checks.status === "failure") {
    blockers.push("One or more checks are failing.");
  } else if (summary.checks.status === "pending") {
    pending.push("One or more checks are pending.");
  } else if (summary.checks.status === "unknown") {
    unknown.push("Check state could not be loaded.");
  } else if (summary.checks.status === "none") {
    informational.push("No GitHub checks are reported for the PR head.");
  }

  if (blockers.length > 0) {
    return {
      reasons: blockers,
      status: "blocked",
    };
  }

  if (pending.length > 0) {
    return {
      reasons: pending,
      status: "pending",
    };
  }

  if (unknown.length > 0) {
    return {
      reasons: unknown,
      status: "unknown",
    };
  }

  return {
    reasons:
      informational.length > 0
        ? informational
        : ["PR is open, reviews are clear, and checks are passing."],
    status: "ready",
  };
}

function buildUnknownStatus(
  input: GithubPullRequestCoordinates & {
    authenticated: boolean;
    error: string;
    fetchedAt: string;
    rateLimited?: boolean;
  },
): PullRequestStatusSummary {
  const summary: PullRequestStatusSummary = {
    authenticated: input.authenticated,
    baseRef: undefined,
    checks: {
      checkRuns: [],
      errors: [input.error],
      failed: 0,
      passed: 0,
      pending: 0,
      skipped: 0,
      status: "unknown",
      total: 0,
    },
    draft: undefined,
    error: input.error,
    fetchedAt: input.fetchedAt,
    headRef: undefined,
    headSha: undefined,
    mergeable: undefined,
    mergeableState: undefined,
    merged: undefined,
    number: input.number,
    owner: input.owner,
    provider: "github",
    rateLimited: input.rateLimited,
    readiness: {
      reasons: [input.error],
      status: "unknown",
    },
    repo: input.repo,
    review: {
      approvals: 0,
      changesRequested: 0,
      comments: 0,
      status: "unknown",
    },
    state: "unknown",
    url: input.url,
  };

  return summary;
}

function githubHeaders(token: string | undefined): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "agentic-pm-local",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

async function fetchJson<T>(
  url: string,
  headers: HeadersInit,
  fetchImpl: typeof fetch,
): Promise<FetchJsonResult<T>> {
  try {
    const response = await fetchImpl(url, {
      headers,
    });
    const text = await response.text();
    const payload = parseJsonObject(text);

    if (!response.ok) {
      const responseMessage = readJsonString(payload, "message");
      const message =
        responseMessage ?? response.statusText ?? "GitHub request failed";
      return {
        error: `GitHub API ${response.status}: ${message}`,
        ok: false,
        rateLimited:
          response.status === 403 &&
          /rate limit/i.test(responseMessage ?? text),
        status: response.status,
      };
    }

    return {
      data: payload as T,
      ok: true,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "GitHub request failed",
      ok: false,
    };
  }
}

function parseJsonObject(text: string): unknown {
  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}

function readJsonString(payload: unknown, key: string): string | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function compareIsoTimestamp(
  left: string | undefined,
  right: string | undefined,
): number {
  const leftTime = left ? Date.parse(left) : 0;
  const rightTime = right ? Date.parse(right) : 0;
  return leftTime - rightTime;
}

import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  ChevronDown,
  CirclePause,
  Database,
  Eye,
  ExternalLink,
  FileText,
  FolderKanban,
  GitBranch,
  HardDrive,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  Square,
  XCircle,
} from "lucide-react";
import {
  submitCreateWorkItem,
  submitDispatchAction,
  submitPullRequestLink,
  submitRepositoryArchive,
  submitRepositoryConnectivityCheck,
  submitRepositoryRegistration,
  submitRepositoryUpdate,
  submitReviewChangeRequest,
  submitRuntimePreference,
  submitWorkItemAction,
} from "./actions";

export const dynamic = "force-dynamic";

const CONFLICT_RESOLUTION_FEEDBACK =
  "Update this PR branch against the latest base branch, resolve any merge conflicts, preserve the original issue behavior, and push the follow-up commit to the same PR.";

type WorkItemStatus =
  | "queued"
  | "running"
  | "waiting_for_review"
  | "blocked"
  | "paused"
  | "failed"
  | "completed"
  | "cancelled";

type DesiredAgentRuntime = "fake" | "codex" | "cursor" | "generic";

type RunStatus =
  | "queued"
  | "preparing"
  | "running"
  | "stalled"
  | "retrying"
  | "waiting_for_review"
  | "failed"
  | "cancelled"
  | "completed";

type WorkItemSummary = {
  id: string;
  status: WorkItemStatus;
  desiredRuntime?: DesiredAgentRuntime;
  repository?: {
    id: string;
    projectId: string;
    name: string;
    url: string;
    defaultBranch: string;
    localPath?: string;
  };
  issue: {
    id: string;
    identifier: string;
    title: string;
    state: string;
    url?: string;
  };
  latestRun?: {
    id: string;
    status: RunStatus;
    agentRuntime: string;
    workspacePath: string;
    startedAt: string;
    endedAt?: string;
  };
  eventCount: number;
  lastEvent?: {
    type: string;
    level: "debug" | "info" | "warn" | "error";
    message: string;
    createdAt: string;
  };
  claimedBy?: string;
  retryCount: number;
  updatedAt: string;
};

type RunEventSummary = {
  id: string;
  type: string;
  level: "debug" | "info" | "warn" | "error";
  message: string;
  createdAt: string;
};

type ArtifactSummary = {
  id: string;
  runId: string;
  type:
    | "log"
    | "patch"
    | "pr"
    | "screenshot"
    | "video"
    | "test_report"
    | "review_packet"
    | "plan";
  uri: string;
  summary?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

type WorkItemsResponse = {
  data: WorkItemSummary[];
  meta?: {
    limit: number;
    count: number;
    projectId: string;
    defaultProjectId: string;
    generatedAt: string;
  };
};

type ProjectOption = {
  id: string;
  name: string;
  slug?: string;
  workItemCount: number;
  isDefault: boolean;
};

type RepositoryOption = {
  id: string;
  projectId: string;
  name: string;
  url: string;
  defaultBranch: string;
  localPath?: string;
  pullRequest?: {
    baseBranch?: string;
    branch?: {
      includeTimestamp?: boolean;
      maxLength?: number;
      prefix?: string;
    };
    draft?: boolean;
    ghCommand?: string;
    mode: "disabled" | "local_draft" | "github_draft";
    remoteName?: string;
  };
  workItemCount: number;
  isDefault: boolean;
};

type RepositoryConnectivityStatus = "ok" | "warn" | "error";

type RepositoryConnectivityCheck = {
  name: string;
  status: RepositoryConnectivityStatus;
  message: string;
};

type RepositoryConnectivityCheckResult = {
  id: string;
  projectId?: string;
  repositoryId?: string;
  repositoryName: string;
  status: RepositoryConnectivityStatus;
  checks: RepositoryConnectivityCheck[];
  actorId?: string;
  hasLocalPath?: boolean;
  pullRequestMode?: string;
  message: string;
  createdAt: string;
};

type ProjectsResponse = {
  data: ProjectOption[];
  meta?: {
    defaultProjectId: string;
    generatedAt: string;
  };
};

type RepositoriesResponse = {
  data: RepositoryOption[];
  meta?: {
    projectId: string;
    defaultRepositoryId?: string;
    generatedAt: string;
  };
};

type RepositoryConnectivityChecksResponse = {
  data: RepositoryConnectivityCheckResult[];
  meta?: {
    limit: number;
    projectId: string;
    repositoryId?: string;
    generatedAt: string;
  };
};

type DispatchControl = {
  projectId: string;
  paused: boolean;
  pausedBy?: string;
  pausedReason?: string;
  pausedAt?: string;
  createdAt: string;
  updatedAt: string;
};

type DispatchControlResponse = {
  data: DispatchControl;
};

type IntegrationHealthStatus = "ok" | "warn" | "error";
type LinearVerificationStatus =
  | "disabled"
  | "missing_config"
  | "verified"
  | "missing_states"
  | "failed";
type LinearWebhookSetupStatus =
  | "disabled"
  | "missing_secret"
  | "local_only"
  | "ready";

type IntegrationHealth = {
  tracker: {
    kind: string;
    status: IntegrationHealthStatus;
    message: string;
  };
  linear: {
    enabled: boolean;
    status: IntegrationHealthStatus;
    apiKeyConfigured: boolean;
    teamKeyConfigured: boolean;
    webhookSecretConfigured: boolean;
    webhookSetup: {
      status: LinearWebhookSetupStatus;
      message: string;
      endpointPath: string;
      localCallbackUrl: string;
      publicCallbackUrl?: string;
      publicCallbackConfigured: boolean;
      secretConfigured: boolean;
      toleranceMs: number;
      signatureHeader: string;
      deliveryHeader: string;
      timestampField: string;
    };
    webhookToleranceMs: number;
    activeStates: string[];
    runningState: string;
    reviewState: string;
    failureState: string;
    doneState: string;
    cancelledState: string;
    verification?: {
      status: LinearVerificationStatus;
      checkedAt?: string;
      message: string;
      team?: {
        id: string;
        key: string;
        name: string;
      };
      matchedStateNames: string[];
      missingStateNames: string[];
      availableStateNames: string[];
      error?: string;
    };
  };
  runtime: {
    kind: DesiredAgentRuntime;
    status: IntegrationHealthStatus;
    message: string;
    configError?: string;
    workflow: {
      root: string;
      loaded: boolean;
      path?: string;
      error?: string;
    };
    codex: {
      enabled: boolean;
      command: string;
      args: string[];
      approvalPolicy?: string;
      sandbox?: string;
      skipGitRepoCheck: boolean;
      model?: string;
      reasoningEffort?: string;
      apiKeyConfigured: boolean;
      apiKeySource?: "CODEX_API_KEY" | "OPENAI_API_KEY";
      turnTimeoutMs: number;
      stallTimeoutMs: number;
    };
    cursor: {
      enabled: boolean;
      command: string;
      args?: string[];
      outputFormat: "text" | "json" | "stream-json";
      sandbox?: "enabled" | "disabled";
      trustWorkspace: boolean;
      force: boolean;
      model?: string;
      apiKeyConfigured: boolean;
    };
  };
};

type IntegrationHealthResponse = {
  data: IntegrationHealth;
};

type RunEventsResponse = {
  data: RunEventSummary[];
};

type ArtifactsResponse = {
  data: ArtifactSummary[];
};

type PullRequestReadinessStatus = "ready" | "blocked" | "pending" | "unknown";

type PullRequestReviewStatus =
  | "approved"
  | "changes_requested"
  | "commented"
  | "review_required"
  | "unknown";

type PullRequestChecksStatus =
  | "success"
  | "failure"
  | "pending"
  | "none"
  | "unknown";

type PullRequestCheckSummary = {
  name: string;
  status: string;
  conclusion?: string;
  url?: string;
  completedAt?: string;
};

type PullRequestStatusSummary = {
  provider: "github";
  owner: string;
  repo: string;
  number: number;
  url: string;
  title?: string;
  state: string;
  draft?: boolean;
  merged?: boolean;
  mergeable?: boolean | null;
  mergeableState?: string;
  headRef?: string;
  headSha?: string;
  baseRef?: string;
  review: {
    status: PullRequestReviewStatus;
    approvals: number;
    changesRequested: number;
    comments: number;
    latestReviewedAt?: string;
  };
  checks: {
    status: PullRequestChecksStatus;
    total: number;
    passed: number;
    failed: number;
    pending: number;
    skipped: number;
    checkRuns: PullRequestCheckSummary[];
    errors: string[];
  };
  readiness: {
    status: PullRequestReadinessStatus;
    reasons: string[];
  };
  fetchedAt: string;
  authenticated: boolean;
  error?: string;
  rateLimited?: boolean;
};

type PullRequestStatusResponse = {
  data: PullRequestStatusSummary;
  meta?: {
    artifactId: string;
    generatedAt: string;
  };
};

type WebhookDeliveryStatus = "processing" | "processed" | "ignored" | "failed";

type WebhookDeliverySummary = {
  id: string;
  projectId: string;
  provider: string;
  deliveryId: string;
  event?: string;
  action?: string;
  type?: string;
  status: WebhookDeliveryStatus;
  result?: Record<string, unknown>;
  attemptCount: number;
  firstReceivedAt: string;
  lastReceivedAt: string;
  processedAt?: string;
  createdAt: string;
  updatedAt: string;
};

type WebhookDeliveriesResponse = {
  data: WebhookDeliverySummary[];
  meta?: {
    limit: number;
    projectId: string;
    generatedAt: string;
  };
};

type DashboardData = {
  items: WorkItemSummary[];
  dispatch: DispatchControl;
  integrations: IntegrationHealth;
  projects: ProjectOption[];
  repositories: RepositoryOption[];
  repositoryConnectivityChecks: RepositoryConnectivityCheckResult[];
  repositoryConnectivityChecksByRepository: Record<
    string,
    RepositoryConnectivityCheckResult[]
  >;
  defaultProjectId: string;
  selectedProjectId: string;
  generatedAt?: string;
  error?: string;
};

type RunEventsData = {
  events: RunEventSummary[];
  error?: string;
};

type RunArtifactsData = {
  artifacts: ArtifactSummary[];
  error?: string;
};

type PullRequestStatusData = {
  pullRequest?: PullRequestStatusSummary;
  skippedReason?: string;
  error?: string;
};

type ReviewCompletionGate = {
  canComplete: boolean;
  tone: PullRequestReadinessStatus;
  label: string;
  title: string;
  detail: string;
  nextStep: string;
  reasons: string[];
  buttonTitle: string;
};

type ReviewFeedbackSummary = {
  id: string;
  actorId?: string;
  baseCommitSha?: string;
  baseRunId?: string;
  branchName?: string;
  createdAt: string;
  desiredRuntime?: DesiredAgentRuntime;
  feedback: string;
  pullRequestArtifactId?: string;
  remotePrUrl?: string;
};

type ReviewFeedbackResponse = {
  data: ReviewFeedbackSummary[];
  meta?: {
    limit: number;
    generatedAt: string;
  };
};

type ReviewFeedbackData = {
  feedback: ReviewFeedbackSummary[];
  error?: string;
};

type WebhookAuditData = {
  deliveries: WebhookDeliverySummary[];
  generatedAt?: string;
  error?: string;
};

type DashboardSearchParams = Record<string, string | string[] | undefined>;

type ActionFeedback = {
  tone: "success" | "error";
  message: string;
};

type ArtifactAction = {
  href: string;
  label: string;
  title: string;
};

type StatusFilter = "all" | WorkItemStatus;

type StatusFilterTab = {
  value: StatusFilter;
  label: string;
};

type DashboardView = "work" | "audit" | "config";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const statusFilterTabs: StatusFilterTab[] = [
  { value: "all", label: "All" },
  { value: "queued", label: "Queued" },
  { value: "running", label: "Running" },
  { value: "waiting_for_review", label: "Review" },
  { value: "paused", label: "Paused" },
  { value: "blocked", label: "Blocked" },
  { value: "failed", label: "Failed" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const runtimeOptions: Array<{
  value: "default" | DesiredAgentRuntime;
  label: string;
}> = [
  { value: "default", label: "Default" },
  { value: "codex", label: "Codex" },
  { value: "cursor", label: "Cursor" },
  { value: "fake", label: "Fake" },
  { value: "generic", label: "Generic" },
];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<DashboardSearchParams>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const requestedProjectId = parseProjectId(
    firstParam(resolvedSearchParams.projectId),
  );
  const dashboard = await fetchDashboardData(requestedProjectId);
  const actionFeedback = parseActionFeedback(resolvedSearchParams);
  const view = parseDashboardView(firstParam(resolvedSearchParams.view));
  const statusFilter = parseStatusFilter(
    firstParam(resolvedSearchParams.status),
  );
  const filteredItems = filterWorkItemsByStatus(dashboard.items, statusFilter);
  const filterTabs = buildStatusFilterTabs(dashboard.items, statusFilter);
  const lanes = buildLanes(dashboard.items);
  const selected = selectRunDetailItem(
    filteredItems,
    firstParam(resolvedSearchParams.workItemId),
  );
  const webhookAudit =
    view === "audit"
      ? await fetchWebhookDeliveries(dashboard.selectedProjectId)
      : { deliveries: [] };
  const [runEvents, runArtifacts, reviewFeedback] =
    view === "work" && selected?.latestRun
      ? await Promise.all([
          fetchRunEvents(selected.latestRun.id),
          fetchRunArtifacts(selected.latestRun.id),
          fetchReviewFeedback(selected.id),
        ])
      : [{ events: [] }, { artifacts: [] }, { feedback: [] }];
  const timelineEvents = getTimelineEvents(runEvents.events);
  const timelineListClassName = [
    "timelineList",
    timelineEvents.length > 5 ? "scrollableList" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const artifactStackClassName = [
    "artifactStack",
    runArtifacts.artifacts.length > 4 ? "scrollableList" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const selectedPullRequestArtifact = runArtifacts.artifacts
    .filter((artifact) => artifact.type === "pr")
    .at(-1);
  const pullRequestStatus =
    view === "work" && selectedPullRequestArtifact
      ? await fetchPullRequestStatus(selectedPullRequestArtifact)
      : { skippedReason: "No pull request artifact selected." };
  const selectedPullRequest = pullRequestStatus.pullRequest;
  const reviewBranchName =
    readMetadataString(selectedPullRequestArtifact?.metadata, "branchName") ??
    readMetadataString(
      selectedPullRequestArtifact?.metadata,
      "remoteBranchName",
    );
  const canRequestReviewChanges =
    selected?.status === "waiting_for_review" && Boolean(reviewBranchName);
  const isReviewChangeInProgress =
    Boolean(reviewBranchName) &&
    reviewFeedback.feedback.length > 0 &&
    (selected?.status === "queued" || selected?.status === "running");
  const reviewChangeDefaultRuntime =
    selected?.desiredRuntime ??
    normalizeRuntimePreference(selected?.latestRun?.agentRuntime) ??
    "codex";
  const completionGate = buildReviewCompletionGate(
    selected,
    selectedPullRequestArtifact,
    pullRequestStatus,
  );

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandMark">A</div>
          <div>
            <strong>Agentic PM</strong>
            <span>Local control plane</span>
          </div>
        </div>

        <nav className="nav">
          <a
            className={view === "work" ? "active" : ""}
            href={buildDashboardHref({
              projectId: dashboard.selectedProjectId,
              status: statusFilter,
            })}
          >
            Work
          </a>
          <a>Runs</a>
          <a>Artifacts</a>
          <a
            className={view === "config" ? "active" : ""}
            href={buildDashboardHref({
              projectId: dashboard.selectedProjectId,
              view: "config",
            })}
          >
            Config
          </a>
          <a
            className={view === "audit" ? "active" : ""}
            href={buildDashboardHref({
              projectId: dashboard.selectedProjectId,
              view: "audit",
            })}
          >
            Audit
          </a>
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Symphony-style orchestration</p>
            <h1>{dashboardTitle(view)}</h1>
          </div>

          <div className="toolbar">
            <ProjectMenu
              projects={dashboard.projects}
              selectedProjectId={dashboard.selectedProjectId}
              statusFilter={statusFilter}
              view={view}
            />
            <TrackerHealthBadge health={dashboard.integrations} />
            <a
              className="iconButton"
              href={buildDashboardHref({
                projectId: dashboard.selectedProjectId,
                status: statusFilter,
                view,
                workItemId: selected?.id,
              })}
              title="Refresh"
            >
              <RefreshCw size={16} />
            </a>
            <form action={submitDispatchAction}>
              <input
                name="projectId"
                type="hidden"
                value={dashboard.selectedProjectId}
              />
              <input name="view" type="hidden" value={view} />
              <input name="status" type="hidden" value={statusFilter} />
              <input
                name="workItemId"
                type="hidden"
                value={selected?.id ?? ""}
              />
              <button
                name="action"
                title={
                  dashboard.dispatch.paused
                    ? "Resume dispatch"
                    : "Pause dispatch"
                }
                type="submit"
                value={dashboard.dispatch.paused ? "resume" : "pause"}
              >
                {dashboard.dispatch.paused ? (
                  <Play size={16} />
                ) : (
                  <CirclePause size={16} />
                )}
                {dashboard.dispatch.paused
                  ? "Resume dispatch"
                  : "Pause dispatch"}
              </button>
            </form>
            <form action={submitDispatchAction}>
              <input
                name="projectId"
                type="hidden"
                value={dashboard.selectedProjectId}
              />
              <input name="view" type="hidden" value={view} />
              <input name="status" type="hidden" value={statusFilter} />
              <input
                name="workItemId"
                type="hidden"
                value={selected?.id ?? ""}
              />
              <button
                className="primary"
                name="action"
                title="Start eligible"
                type="submit"
                value="start_eligible"
              >
                <Play size={16} />
                Start eligible
              </button>
            </form>
          </div>
        </header>

        {dashboard.error ? (
          <section className="notice errorNotice">
            <AlertTriangle size={16} />
            <span>{dashboard.error}</span>
          </section>
        ) : (
          <section className="notice">
            <Database size={16} />
            <span>
              Live API data
              {dashboard.generatedAt
                ? ` · refreshed ${formatRelativeTime(dashboard.generatedAt)}`
                : ""}
              {` · ${selectedProjectLabel(dashboard.projects, dashboard.selectedProjectId)}`}
              {dashboard.dispatch.paused ? " · dispatch paused" : ""}
            </span>
          </section>
        )}

        {actionFeedback ? (
          <section
            className={`actionBanner ${actionFeedback.tone === "error" ? "actionBannerError" : "actionBannerSuccess"}`}
            role={actionFeedback.tone === "error" ? "alert" : "status"}
          >
            {actionFeedback.tone === "error" ? (
              <AlertTriangle size={16} />
            ) : (
              <CheckCircle2 size={16} />
            )}
            <span>{actionFeedback.message}</span>
            <a
              className="bannerDismiss"
              href={buildDashboardHref({
                projectId: dashboard.selectedProjectId,
                status: statusFilter,
                view,
                workItemId: selected?.id,
              })}
              title="Dismiss"
            >
              <XCircle size={14} />
            </a>
          </section>
        ) : null}

        {view === "work" ? (
          <>
            <section className="metrics">
              {lanes.map((lane) => (
                <div className="metric" key={lane.label}>
                  <span>{lane.label}</span>
                  <strong className={lane.tone}>{lane.value}</strong>
                </div>
              ))}
            </section>

            <section className="contentGrid">
              <div className="workColumn">
                <section className="panel intakePanel">
                  <div className="panelHeader compact">
                    <div>
                      <h2>New work item</h2>
                      <p>
                        {dashboard.repositories.length}{" "}
                        {dashboard.repositories.length === 1
                          ? "repository"
                          : "repositories"}
                      </p>
                    </div>
                    <GitBranch size={17} />
                  </div>
                  <form action={submitCreateWorkItem} className="intakeForm">
                    <input
                      name="projectId"
                      type="hidden"
                      value={dashboard.selectedProjectId}
                    />
                    <input name="status" type="hidden" value={statusFilter} />
                    <input
                      name="workItemId"
                      type="hidden"
                      value={selected?.id ?? ""}
                    />
                    <input
                      aria-label="Work item title"
                      maxLength={180}
                      name="title"
                      placeholder="Title"
                      required
                    />
                    <select
                      aria-label="Repository"
                      defaultValue={dashboard.repositories[0]?.id ?? ""}
                      disabled={dashboard.repositories.length === 0}
                      name="repositoryId"
                      required
                    >
                      {dashboard.repositories.length > 0 ? (
                        dashboard.repositories.map((repo) => (
                          <option key={repo.id} value={repo.id}>
                            {repo.name}
                          </option>
                        ))
                      ) : (
                        <option value="">No repositories</option>
                      )}
                    </select>
                    <select
                      aria-label="Desired runtime"
                      defaultValue="default"
                      name="desiredRuntime"
                    >
                      {runtimeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <textarea
                      aria-label="Work item description"
                      maxLength={8000}
                      name="description"
                      placeholder="Description"
                      rows={3}
                    />
                    <button
                      className="primary"
                      disabled={dashboard.repositories.length === 0}
                      title="Create work item"
                      type="submit"
                    >
                      <Plus size={16} />
                      Create
                    </button>
                  </form>
                </section>

                <div className="panel board">
                  <div className="panelHeader">
                    <div>
                      <h2>Work board</h2>
                      <p>
                        {formatWorkBoardCount(
                          filteredItems.length,
                          dashboard.items.length,
                        )}
                      </p>
                    </div>
                    <button disabled title="Retry failed">
                      <RotateCcw size={16} />
                    </button>
                  </div>

                  <nav
                    aria-label="Work item status"
                    className="filterTabs"
                    role="tablist"
                  >
                    {filterTabs.map((tab) => (
                      <a
                        aria-current={tab.active ? "page" : undefined}
                        aria-selected={tab.active}
                        className={`filterTab ${tab.active ? "active" : ""}`}
                        href={buildDashboardHref({
                          projectId: dashboard.selectedProjectId,
                          status: tab.value,
                        })}
                        key={tab.value}
                        role="tab"
                      >
                        <span>{tab.label}</span>
                        <strong>{tab.count}</strong>
                      </a>
                    ))}
                  </nav>

                  {filteredItems.length > 0 ? (
                    <div className="table">
                      <div className="row tableHead">
                        <span>Issue</span>
                        <span>Title</span>
                        <span className="repoCell">Repo</span>
                        <span>Status</span>
                        <span>Runtime</span>
                        <span className="ownerCell">Owner</span>
                        <span className="updatedCell">Updated</span>
                        <span>Actions</span>
                      </div>
                      {filteredItems.map((row) => (
                        <div
                          className={`row ${selected?.id === row.id ? "selectedRow" : ""}`}
                          key={row.id}
                        >
                          {row.issue.url ? (
                            <a
                              href={row.issue.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {row.issue.identifier}
                            </a>
                          ) : (
                            <strong>{row.issue.identifier}</strong>
                          )}
                          <a
                            className="rowSelectLink"
                            href={buildDashboardHref({
                              projectId: dashboard.selectedProjectId,
                              status: statusFilter,
                              workItemId: row.id,
                            })}
                            title={`Show run detail for ${row.issue.identifier}`}
                          >
                            {row.issue.title}
                          </a>
                          <span className="repoCell">
                            {row.repository?.name ?? "unassigned"}
                          </span>
                          <span className={`pill ${row.status}`}>
                            {formatStatus(row.status)}
                          </span>
                          <form
                            action={submitRuntimePreference}
                            className="runtimeForm"
                          >
                            <input
                              name="projectId"
                              type="hidden"
                              value={dashboard.selectedProjectId}
                            />
                            <input
                              name="status"
                              type="hidden"
                              value={statusFilter}
                            />
                            <input
                              name="workItemId"
                              type="hidden"
                              value={row.id}
                            />
                            <select
                              aria-label={`Runtime for ${row.issue.identifier}`}
                              defaultValue={row.desiredRuntime ?? "default"}
                              disabled={row.status === "running"}
                              name="desiredRuntime"
                              title="Desired runtime"
                            >
                              {runtimeOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                            <button
                              aria-label={`Save runtime for ${row.issue.identifier}`}
                              className="actionButton runtimeSubmit"
                              disabled={row.status === "running"}
                              title="Save runtime"
                              type="submit"
                            >
                              <Save size={14} />
                            </button>
                          </form>
                          <span className="ownerCell">
                            {row.claimedBy ??
                              row.latestRun?.agentRuntime ??
                              "unclaimed"}
                          </span>
                          <span className="updatedCell">
                            {formatRelativeTime(row.updatedAt)}
                          </span>
                          <div className="actionGroup">
                            <a
                              aria-label="Inspect run"
                              className={`actionButton ${selected?.id === row.id ? "selectedAction" : ""}`}
                              href={buildDashboardHref({
                                projectId: dashboard.selectedProjectId,
                                status: statusFilter,
                                workItemId: row.id,
                              })}
                              title="Inspect run"
                            >
                              <Eye size={14} />
                            </a>
                            <form action={submitWorkItemAction}>
                              <input
                                name="projectId"
                                type="hidden"
                                value={dashboard.selectedProjectId}
                              />
                              <input
                                name="status"
                                type="hidden"
                                value={statusFilter}
                              />
                              <input
                                name="workItemId"
                                type="hidden"
                                value={row.id}
                              />
                              {getAvailableActions(row.status).map((action) => (
                                <button
                                  aria-label={action.label}
                                  className={`actionButton ${action.name === "cancel" ? "dangerAction" : ""}`}
                                  key={action.name}
                                  name="action"
                                  title={action.label}
                                  type="submit"
                                  value={action.name}
                                >
                                  <ActionIcon action={action.name} />
                                </button>
                              ))}
                            </form>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : dashboard.items.length === 0 ? (
                    <div className="emptyState">
                      <Database size={18} />
                      <strong>No work items yet</strong>
                      <span>
                        Run the worker with the fake tracker, or connect Linear
                        and move an issue into an active state.
                      </span>
                    </div>
                  ) : (
                    <div className="emptyState">
                      <Database size={18} />
                      <strong>
                        No {formatStatusFilterLabel(statusFilter)} work items
                      </strong>
                      <span>
                        Choose another lane or move a tracker issue into this
                        status.
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <aside className="panel runDetail">
                {selected ? (
                  <>
                    <div className="panelHeader compact">
                      <div>
                        <h2>Run detail</h2>
                        <p>
                          {selected.issue.identifier} ·{" "}
                          {selected.latestRun?.agentRuntime ?? "no run yet"}
                        </p>
                      </div>
                      <span
                        className={
                          selected.status === "running" ? "liveDot" : "quietDot"
                        }
                      />
                    </div>

                    <div className="statusStack">
                      <div>
                        <span>Workspace</span>
                        <strong>
                          {selected.latestRun?.workspacePath ??
                            "Not prepared yet"}
                        </strong>
                      </div>
                      <div>
                        <span>Run status</span>
                        <strong>
                          {selected.latestRun
                            ? formatStatus(selected.latestRun.status)
                            : "No run yet"}
                        </strong>
                      </div>
                      <div>
                        <span>Policy</span>
                        <strong className="inlineIcon">
                          <ShieldCheck size={15} />
                          Manual merge gate
                        </strong>
                      </div>
                    </div>

                    <div className="logBox">
                      <p>
                        <Square size={10} />
                        {selected.lastEvent?.type ?? "waiting.for.events"}
                      </p>
                      <p>
                        <Square size={10} />
                        {selected.lastEvent?.message ??
                          "No events captured yet"}
                      </p>
                      <p>
                        <Square size={10} />
                        {selected.eventCount} events
                      </p>
                      <p>
                        <Square size={10} />
                        retries: {selected.retryCount}
                      </p>
                    </div>

                    {selectedPullRequestArtifact ? (
                      <div className="pullRequestReadiness">
                        <div className="eventTimelineHeader">
                          <span>PR readiness</span>
                          <strong
                            className={`readinessBadge ${
                              selectedPullRequest?.readiness.status ?? "unknown"
                            }`}
                          >
                            {formatReadinessStatus(
                              selectedPullRequest?.readiness.status ??
                                "unknown",
                            )}
                          </strong>
                        </div>

                        {pullRequestStatus.error ? (
                          <div className="timelineNotice">
                            {pullRequestStatus.error}
                          </div>
                        ) : selectedPullRequest ? (
                          <>
                            <div className="pullRequestSummary">
                              <a
                                href={selectedPullRequest.url}
                                rel="noreferrer"
                                target="_blank"
                              >
                                #{selectedPullRequest.number}{" "}
                                {selectedPullRequest.title ??
                                  `${selectedPullRequest.owner}/${selectedPullRequest.repo}`}
                              </a>
                              <span>
                                {formatPullRequestBranchPair(
                                  selectedPullRequest,
                                )}
                              </span>
                              <span>
                                {formatPullRequestEvidence(selectedPullRequest)}
                              </span>
                            </div>
                            <div className="pullRequestReadinessGrid">
                              <div>
                                <span>State</span>
                                <strong>
                                  {formatPullRequestState(selectedPullRequest)}
                                </strong>
                              </div>
                              <div>
                                <span>Review</span>
                                <strong>
                                  {formatReviewStatus(
                                    selectedPullRequest.review,
                                  )}
                                </strong>
                              </div>
                              <div>
                                <span>Checks</span>
                                <strong>
                                  {formatChecksStatus(
                                    selectedPullRequest.checks,
                                  )}
                                </strong>
                              </div>
                              <div>
                                <span>Mergeability</span>
                                <strong>
                                  {formatMergeability(selectedPullRequest)}
                                </strong>
                              </div>
                            </div>
                            <div
                              className="pullRequestReadinessReasons"
                              role="list"
                            >
                              {selectedPullRequest.readiness.reasons.map(
                                (reason) => (
                                  <p key={reason} role="listitem">
                                    {reason}
                                  </p>
                                ),
                              )}
                            </div>
                            {selectedPullRequest.checks.checkRuns.length > 0 ? (
                              <div className="pullRequestCheckList" role="list">
                                {selectedPullRequest.checks.checkRuns
                                  .slice(0, 4)
                                  .map((check) => (
                                    <a
                                      href={check.url}
                                      key={`${check.name}-${check.status}-${check.conclusion}`}
                                      rel="noreferrer"
                                      role="listitem"
                                      target="_blank"
                                    >
                                      <span>{check.name}</span>
                                      <strong>
                                        {formatCheckStatus(check)}
                                      </strong>
                                    </a>
                                  ))}
                              </div>
                            ) : null}
                          </>
                        ) : (
                          <div className="timelineNotice">
                            {pullRequestStatus.skippedReason ??
                              "No PR readiness available."}
                          </div>
                        )}
                      </div>
                    ) : null}

                    {completionGate ? (
                      <div className={`completionGate ${completionGate.tone}`}>
                        <div className="completionGateHeader">
                          <div>
                            <span>Manual completion</span>
                            <strong>{completionGate.title}</strong>
                          </div>
                          <span
                            className={`readinessBadge ${completionGate.tone}`}
                          >
                            {completionGate.label}
                          </span>
                        </div>
                        <p>{completionGate.detail}</p>
                        <div className="completionGateNext">
                          <span>Next step</span>
                          <strong>{completionGate.nextStep}</strong>
                        </div>
                        {completionGate.reasons.length > 0 ? (
                          <div className="completionGateReasons" role="list">
                            {completionGate.reasons.map((reason) => (
                              <span key={reason} role="listitem">
                                {reason}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        <form action={submitWorkItemAction}>
                          <input
                            name="projectId"
                            type="hidden"
                            value={dashboard.selectedProjectId}
                          />
                          <input
                            name="status"
                            type="hidden"
                            value={statusFilter}
                          />
                          <input
                            name="workItemId"
                            type="hidden"
                            value={selected.id}
                          />
                          <input name="action" type="hidden" value="complete" />
                          <button
                            disabled={!completionGate.canComplete}
                            title={completionGate.buttonTitle}
                            type="submit"
                          >
                            <CheckCircle2 size={14} />
                            <span>Mark complete</span>
                          </button>
                        </form>
                      </div>
                    ) : null}

                    {canRequestReviewChanges ? (
                      <div className="reviewLoopStack">
                        <form
                          action={submitReviewChangeRequest}
                          className="reviewConflictForm"
                        >
                          <input
                            name="projectId"
                            type="hidden"
                            value={dashboard.selectedProjectId}
                          />
                          <input
                            name="status"
                            type="hidden"
                            value={statusFilter}
                          />
                          <input
                            name="workItemId"
                            type="hidden"
                            value={selected.id}
                          />
                          <input
                            name="desiredRuntime"
                            type="hidden"
                            value={reviewChangeDefaultRuntime}
                          />
                          <input
                            name="feedback"
                            type="hidden"
                            value={CONFLICT_RESOLUTION_FEEDBACK}
                          />
                          <button
                            aria-label="Update / Resolve Conflicts"
                            title={CONFLICT_RESOLUTION_FEEDBACK}
                            type="submit"
                          >
                            <GitBranch size={14} />
                            <span>Update / Resolve Conflicts</span>
                          </button>
                        </form>

                        <form
                          action={submitReviewChangeRequest}
                          className="reviewRequestForm"
                        >
                          <input
                            name="projectId"
                            type="hidden"
                            value={dashboard.selectedProjectId}
                          />
                          <input
                            name="status"
                            type="hidden"
                            value={statusFilter}
                          />
                          <input
                            name="workItemId"
                            type="hidden"
                            value={selected.id}
                          />
                          <div className="reviewRequestHeader">
                            <div>
                              <span>Review loop</span>
                              <strong>Request changes</strong>
                            </div>
                            <select
                              aria-label="Runtime for change request"
                              defaultValue={reviewChangeDefaultRuntime}
                              name="desiredRuntime"
                              title="Runtime for change request"
                            >
                              {runtimeOptions
                                .filter((option) => option.value !== "default")
                                .map((option) => (
                                  <option
                                    key={option.value}
                                    value={option.value}
                                  >
                                    {option.label}
                                  </option>
                                ))}
                            </select>
                          </div>
                          <textarea
                            maxLength={4000}
                            name="feedback"
                            placeholder="Describe the follow-up change needed on this PR"
                            rows={3}
                            required
                          />
                          <button type="submit">
                            <RotateCcw size={14} />
                            <span>Fix with agent</span>
                          </button>
                        </form>
                      </div>
                    ) : null}

                    {isReviewChangeInProgress ? (
                      <div className="reviewLoopNotice">
                        <div className="reviewRequestHeader">
                          <div>
                            <span>Review loop</span>
                            <strong>Follow-up in progress</strong>
                          </div>
                          <span className="readinessBadge pending">
                            {formatStatus(selected?.status ?? "queued")}
                          </span>
                        </div>
                        <p>
                          The latest feedback has been queued for the same PR
                          branch. The request controls return after the
                          follow-up run reaches review again.
                        </p>
                        <div className="completionGateNext">
                          <span>Next step</span>
                          <strong>
                            Wait for the worker to push the follow-up commit,
                            then add the next feedback turn if needed.
                          </strong>
                        </div>
                      </div>
                    ) : null}

                    <div className="feedbackHistory">
                      <div className="eventTimelineHeader">
                        <span>Feedback history</span>
                        <strong>{reviewFeedback.feedback.length} turns</strong>
                      </div>

                      {reviewFeedback.error ? (
                        <div className="timelineNotice">
                          {reviewFeedback.error}
                        </div>
                      ) : reviewFeedback.feedback.length > 0 ? (
                        <div className="feedbackStack" role="list">
                          {reviewFeedback.feedback.map((feedback) => (
                            <div
                              className="feedbackItem"
                              key={feedback.id}
                              role="listitem"
                            >
                              <div className="feedbackItemHeader">
                                <strong>
                                  {feedback.desiredRuntime
                                    ? formatRuntime(feedback.desiredRuntime)
                                    : "Default runtime"}
                                </strong>
                                <span>
                                  {formatRelativeTime(feedback.createdAt)}
                                </span>
                              </div>
                              <p>{feedback.feedback}</p>
                              <span>
                                {feedback.actorId ?? "operator"}
                                {feedback.branchName
                                  ? ` · ${formatBranchName(feedback.branchName)}`
                                  : ""}
                                {feedback.baseCommitSha
                                  ? ` · ${feedback.baseCommitSha.slice(0, 7)}`
                                  : ""}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="timelineNotice">
                          No review feedback recorded yet.
                        </div>
                      )}
                    </div>

                    <div className="artifactList">
                      <div className="eventTimelineHeader">
                        <span>Artifacts</span>
                        <strong>{runArtifacts.artifacts.length} items</strong>
                      </div>

                      {runArtifacts.error ? (
                        <div className="timelineNotice">
                          {runArtifacts.error}
                        </div>
                      ) : runArtifacts.artifacts.length > 0 ? (
                        <div
                          aria-label="Run artifacts"
                          className={artifactStackClassName}
                          role="list"
                        >
                          {runArtifacts.artifacts.map((artifact) => {
                            const action = getArtifactAction(artifact);
                            const canLinkPullRequest =
                              artifact.type === "pr" &&
                              !readMetadataString(
                                artifact.metadata,
                                "remotePrUrl",
                              );

                            return (
                              <div
                                className="artifactItem"
                                key={artifact.id}
                                role="listitem"
                              >
                                <FileText size={14} />
                                <div>
                                  <div className="artifactTitleRow">
                                    <strong>
                                      {formatArtifactType(artifact.type)}
                                    </strong>
                                    {action ? (
                                      <a
                                        className="artifactAction"
                                        href={action.href}
                                        rel="noreferrer"
                                        target="_blank"
                                        title={action.title}
                                      >
                                        <ExternalLink size={12} />
                                        <span>{action.label}</span>
                                      </a>
                                    ) : null}
                                  </div>
                                  <p>{artifact.summary ?? artifact.uri}</p>
                                  <span>
                                    {formatArtifactUri(artifact.uri)} ·{" "}
                                    {formatRelativeTime(artifact.createdAt)}
                                  </span>
                                  {canLinkPullRequest ? (
                                    <form
                                      action={submitPullRequestLink}
                                      className="artifactLinkForm"
                                    >
                                      <input
                                        name="artifactId"
                                        type="hidden"
                                        value={artifact.id}
                                      />
                                      <input
                                        name="projectId"
                                        type="hidden"
                                        value={dashboard.selectedProjectId}
                                      />
                                      <input
                                        name="status"
                                        type="hidden"
                                        value={statusFilter}
                                      />
                                      <input
                                        name="view"
                                        type="hidden"
                                        value={view}
                                      />
                                      <input
                                        name="workItemId"
                                        type="hidden"
                                        value={selected.id}
                                      />
                                      <input
                                        aria-label="Remote PR URL"
                                        maxLength={2000}
                                        name="remotePrUrl"
                                        placeholder="https://github.com/org/repo/pull/1"
                                        type="url"
                                      />
                                      <button
                                        title="Link remote pull request"
                                        type="submit"
                                      >
                                        <Save size={12} />
                                        <span>Link</span>
                                      </button>
                                    </form>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="timelineNotice">
                          No artifacts captured yet.
                        </div>
                      )}
                    </div>

                    <div className="eventTimeline">
                      <div className="eventTimelineHeader">
                        <span>Timeline</span>
                        <strong>{selected.eventCount} events</strong>
                      </div>

                      {runEvents.error ? (
                        <div className="timelineNotice">{runEvents.error}</div>
                      ) : timelineEvents.length > 0 ? (
                        <div
                          aria-label="Run event timeline"
                          className={timelineListClassName}
                          role="list"
                        >
                          {timelineEvents.map((event) => (
                            <div
                              className="timelineItem"
                              key={event.id}
                              role="listitem"
                            >
                              <div className="timelineItemHeader">
                                <strong>{event.type}</strong>
                                <span className="timelineMeta">
                                  <span className={`eventLevel ${event.level}`}>
                                    {event.level}
                                  </span>
                                  <span>
                                    {formatRelativeTime(event.createdAt)}
                                  </span>
                                </span>
                              </div>
                              <p>{event.message}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="timelineNotice">
                          No run events captured yet.
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="emptyState detailEmpty">
                    <Database size={18} />
                    <strong>No run selected</strong>
                    <span>
                      The latest run will appear here after the worker claims an
                      issue.
                    </span>
                  </div>
                )}
              </aside>
            </section>
          </>
        ) : view === "audit" ? (
          <WebhookAuditView
            audit={webhookAudit}
            selectedProjectId={dashboard.selectedProjectId}
          />
        ) : (
          <ConfigView
            integrations={dashboard.integrations}
            repositoryConnectivityChecks={
              dashboard.repositoryConnectivityChecks
            }
            repositoryConnectivityChecksByRepository={
              dashboard.repositoryConnectivityChecksByRepository
            }
            repositories={dashboard.repositories}
            selectedProjectId={dashboard.selectedProjectId}
          />
        )}
      </section>
    </main>
  );
}

async function fetchDashboardData(
  requestedProjectId?: string,
): Promise<DashboardData> {
  try {
    const projectState = await fetchProjectOptions();
    const selectedProjectId = selectProjectId(
      requestedProjectId,
      projectState.projects,
      projectState.defaultProjectId,
    );
    const projectQuery = `projectId=${encodeURIComponent(selectedProjectId)}`;
    const [response, dispatch, integrations, repositories] = await Promise.all([
      fetch(`${apiUrl}/work-items?limit=50&${projectQuery}`, {
        cache: "no-store",
      }),
      fetchDispatchControl(selectedProjectId),
      fetchIntegrationHealth(),
      fetchRepositories(selectedProjectId),
    ]);
    const [
      repositoryConnectivityChecks,
      repositoryConnectivityChecksByRepository,
    ] = await Promise.all([
      fetchRepositoryConnectivityChecks(selectedProjectId),
      fetchRepositoryConnectivityCheckMap(selectedProjectId, repositories),
    ]);

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const payload = (await response.json()) as WorkItemsResponse;
    return {
      items: payload.data,
      dispatch,
      integrations,
      projects: projectState.projects,
      repositories,
      repositoryConnectivityChecks,
      repositoryConnectivityChecksByRepository,
      defaultProjectId: projectState.defaultProjectId,
      selectedProjectId,
      generatedAt: payload.meta?.generatedAt,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown API error";
    const fallbackProjectId = "project_local";
    return {
      items: [],
      dispatch: createDefaultDispatchControl(),
      integrations: createUnavailableIntegrationHealth(),
      projects: [createDefaultProjectOption(fallbackProjectId)],
      repositories: [],
      repositoryConnectivityChecks: [],
      repositoryConnectivityChecksByRepository: {},
      defaultProjectId: fallbackProjectId,
      selectedProjectId: fallbackProjectId,
      error: `API unavailable at ${apiUrl}: ${message}`,
    };
  }
}

async function fetchProjectOptions(): Promise<{
  projects: ProjectOption[];
  defaultProjectId: string;
}> {
  const response = await fetch(`${apiUrl}/projects`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Project API returned ${response.status}`);
  }

  const payload = (await response.json()) as ProjectsResponse;
  const defaultProjectId = payload.meta?.defaultProjectId ?? "project_local";
  const projects =
    payload.data.length > 0
      ? payload.data
      : [createDefaultProjectOption(defaultProjectId)];

  return {
    projects,
    defaultProjectId,
  };
}

async function fetchRepositories(
  projectId: string,
): Promise<RepositoryOption[]> {
  try {
    const response = await fetch(
      `${apiUrl}/repositories?projectId=${encodeURIComponent(projectId)}`,
      {
        cache: "no-store",
      },
    );

    if (!response.ok) {
      throw new Error(`Repository API returned ${response.status}`);
    }

    const payload = (await response.json()) as RepositoriesResponse;
    return payload.data;
  } catch {
    return [];
  }
}

async function fetchRepositoryConnectivityChecks(
  projectId: string,
  repositoryId?: string,
  limit = 5,
): Promise<RepositoryConnectivityCheckResult[]> {
  try {
    const params = new URLSearchParams({
      projectId,
      limit: String(limit),
    });
    if (repositoryId) {
      params.set("repositoryId", repositoryId);
    }

    const response = await fetch(
      `${apiUrl}/repositories/connectivity-checks?${params.toString()}`,
      {
        cache: "no-store",
      },
    );

    if (!response.ok) {
      throw new Error(`Repository check API returned ${response.status}`);
    }

    const payload =
      (await response.json()) as RepositoryConnectivityChecksResponse;
    return payload.data;
  } catch {
    return [];
  }
}

async function fetchRepositoryConnectivityCheckMap(
  projectId: string,
  repositories: RepositoryOption[],
): Promise<Record<string, RepositoryConnectivityCheckResult[]>> {
  const entries = await Promise.all(
    repositories.map(
      async (repository) =>
        [
          repository.id,
          await fetchRepositoryConnectivityChecks(projectId, repository.id, 3),
        ] as const,
    ),
  );

  return Object.fromEntries(entries);
}

function selectRepositoryConnectivityChecks(
  repository: RepositoryOption,
  byRepository: Record<string, RepositoryConnectivityCheckResult[]>,
  projectResults: RepositoryConnectivityCheckResult[],
): RepositoryConnectivityCheckResult[] {
  const directResults = byRepository[repository.id] ?? [];
  if (directResults.length > 0) {
    return directResults;
  }

  return projectResults
    .filter(
      (result) =>
        result.repositoryId === repository.id ||
        (!result.repositoryId && result.repositoryName === repository.name),
    )
    .slice(0, 3);
}

async function fetchDispatchControl(
  projectId: string,
): Promise<DispatchControl> {
  try {
    const response = await fetch(
      `${apiUrl}/dispatch-control?projectId=${encodeURIComponent(projectId)}`,
      {
        cache: "no-store",
      },
    );

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const payload = (await response.json()) as DispatchControlResponse;
    return payload.data;
  } catch {
    return createDefaultDispatchControl(projectId);
  }
}

async function fetchIntegrationHealth(): Promise<IntegrationHealth> {
  try {
    const response = await fetch(`${apiUrl}/integrations/health`, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const payload = (await response.json()) as IntegrationHealthResponse;
    return payload.data;
  } catch {
    return createUnavailableIntegrationHealth();
  }
}

async function fetchRunEvents(runId: string): Promise<RunEventsData> {
  try {
    const response = await fetch(`${apiUrl}/runs/${runId}/events`, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const payload = (await response.json()) as RunEventsResponse;
    return {
      events: payload.data,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown API error";
    return {
      events: [],
      error: `Could not load run events: ${message}`,
    };
  }
}

async function fetchRunArtifacts(runId: string): Promise<RunArtifactsData> {
  try {
    const response = await fetch(`${apiUrl}/runs/${runId}/artifacts`, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const payload = (await response.json()) as ArtifactsResponse;
    return {
      artifacts: payload.data,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown API error";
    return {
      artifacts: [],
      error: `Could not load artifacts: ${message}`,
    };
  }
}

async function fetchPullRequestStatus(
  artifact: ArtifactSummary,
): Promise<PullRequestStatusData> {
  const remotePrUrl = readMetadataString(artifact.metadata, "remotePrUrl");
  if (!remotePrUrl) {
    return {
      skippedReason: "Link a remote PR to track readiness.",
    };
  }

  try {
    const response = await fetch(
      `${apiUrl}/artifacts/${artifact.id}/pr-status`,
      {
        cache: "no-store",
      },
    );

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      throw new Error(payload.error ?? `API returned ${response.status}`);
    }

    const payload = (await response.json()) as PullRequestStatusResponse;
    return {
      pullRequest: payload.data,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown API error";
    return {
      error: `Could not load PR readiness: ${message}`,
    };
  }
}

async function fetchReviewFeedback(
  workItemId: string,
): Promise<ReviewFeedbackData> {
  try {
    const response = await fetch(
      `${apiUrl}/work-items/${workItemId}/review-feedback?limit=20`,
      {
        cache: "no-store",
      },
    );

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const payload = (await response.json()) as ReviewFeedbackResponse;
    return {
      feedback: payload.data,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown API error";
    return {
      feedback: [],
      error: `Could not load review feedback: ${message}`,
    };
  }
}

async function fetchWebhookDeliveries(
  projectId: string,
): Promise<WebhookAuditData> {
  try {
    const response = await fetch(
      `${apiUrl}/webhook-deliveries?limit=50&projectId=${encodeURIComponent(projectId)}`,
      {
        cache: "no-store",
      },
    );

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const payload = (await response.json()) as WebhookDeliveriesResponse;
    return {
      deliveries: payload.data,
      generatedAt: payload.meta?.generatedAt,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown API error";
    return {
      deliveries: [],
      error: `Could not load webhook deliveries: ${message}`,
    };
  }
}

function createDefaultDispatchControl(
  projectId = "project_local",
): DispatchControl {
  const now = new Date().toISOString();
  return {
    projectId,
    paused: false,
    createdAt: now,
    updatedAt: now,
  };
}

function createDefaultProjectOption(projectId: string): ProjectOption {
  return {
    id: projectId,
    name:
      projectId === "project_local"
        ? "Local project"
        : formatProjectId(projectId),
    workItemCount: 0,
    isDefault: true,
  };
}

function createUnavailableIntegrationHealth(): IntegrationHealth {
  return {
    tracker: {
      kind: "unknown",
      status: "error",
      message: "Integration health unavailable",
    },
    linear: {
      enabled: false,
      status: "error",
      apiKeyConfigured: false,
      teamKeyConfigured: false,
      webhookSecretConfigured: false,
      webhookSetup: {
        status: "disabled",
        message: "Integration health unavailable",
        endpointPath: "/webhooks/linear",
        localCallbackUrl: "http://127.0.0.1:4000/webhooks/linear",
        publicCallbackConfigured: false,
        secretConfigured: false,
        toleranceMs: 0,
        signatureHeader: "Linear-Signature",
        deliveryHeader: "Linear-Delivery",
        timestampField: "webhookTimestamp",
      },
      webhookToleranceMs: 0,
      activeStates: [],
      runningState: "Unknown",
      reviewState: "Unknown",
      failureState: "Unknown",
      doneState: "Unknown",
      cancelledState: "Unknown",
    },
    runtime: {
      kind: "fake",
      status: "error",
      message: "Runtime health unavailable",
      configError: "API unavailable",
      workflow: {
        root: "unknown",
        loaded: false,
        error: "API unavailable",
      },
      codex: {
        enabled: false,
        command: "codex",
        args: ["exec", "--json", "-"],
        approvalPolicy: "never",
        sandbox: "workspace-write",
        skipGitRepoCheck: false,
        apiKeyConfigured: false,
        turnTimeoutMs: 0,
        stallTimeoutMs: 0,
      },
      cursor: {
        enabled: false,
        command: "cursor-agent",
        outputFormat: "stream-json",
        trustWorkspace: false,
        force: false,
        apiKeyConfigured: false,
      },
    },
  };
}

function parseActionFeedback(
  params: DashboardSearchParams,
): ActionFeedback | undefined {
  const feedback = firstParam(params.feedback);
  const message = firstParam(params.message)?.trim();

  if ((feedback !== "success" && feedback !== "error") || !message) {
    return undefined;
  }

  return {
    tone: feedback,
    message: message.slice(0, 220),
  };
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseDashboardView(value: string | undefined): DashboardView {
  if (value === "audit" || value === "config") {
    return value;
  }

  return "work";
}

function parseStatusFilter(value: string | undefined): StatusFilter {
  return statusFilterTabs.some((tab) => tab.value === value)
    ? (value as StatusFilter)
    : "all";
}

function parseProjectId(value: string | undefined): string | undefined {
  const projectId = value?.trim();
  return projectId && /^[A-Za-z0-9_.:-]{1,128}$/.test(projectId)
    ? projectId
    : undefined;
}

function selectProjectId(
  requestedProjectId: string | undefined,
  projects: ProjectOption[],
  defaultProjectId: string,
): string {
  if (
    requestedProjectId &&
    projects.some((project) => project.id === requestedProjectId)
  ) {
    return requestedProjectId;
  }

  if (projects.some((project) => project.id === defaultProjectId)) {
    return defaultProjectId;
  }

  return projects[0]?.id ?? defaultProjectId;
}

function filterWorkItemsByStatus(
  items: WorkItemSummary[],
  statusFilter: StatusFilter,
): WorkItemSummary[] {
  if (statusFilter === "all") {
    return items;
  }

  return items.filter((item) => item.status === statusFilter);
}

function buildStatusFilterTabs(
  items: WorkItemSummary[],
  activeFilter: StatusFilter,
) {
  return statusFilterTabs.map((tab) => ({
    ...tab,
    active: tab.value === activeFilter,
    count: tab.value === "all" ? items.length : countStatus(items, tab.value),
  }));
}

function buildDashboardHref(input: {
  projectId?: string;
  status?: StatusFilter;
  view?: DashboardView;
  workItemId?: string;
}): string {
  const params = new URLSearchParams();
  const view = input.view ?? "work";

  if (input.projectId) {
    params.set("projectId", input.projectId);
  }

  if (view !== "work") {
    params.set("view", view);
  }

  if (view === "work" && input.status && input.status !== "all") {
    params.set("status", input.status);
  }

  if (view === "work" && input.workItemId) {
    params.set("workItemId", input.workItemId);
  }

  const query = params.toString();
  return query ? `/?${query}` : "/";
}

function dashboardTitle(view: DashboardView): string {
  switch (view) {
    case "audit":
      return "Webhook audit";
    case "config":
      return "Configuration";
    case "work":
      return "Agent runs";
  }
}

function selectedProjectLabel(
  projects: ProjectOption[],
  projectId: string,
): string {
  return (
    projects.find((project) => project.id === projectId)?.name ??
    formatProjectId(projectId)
  );
}

function formatProjectId(projectId: string): string {
  return projectId
    .replace(/^project_/, "")
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatWorkBoardCount(
  filteredCount: number,
  totalCount: number,
): string {
  if (filteredCount === totalCount) {
    return `${totalCount} work items`;
  }

  return `${filteredCount} of ${totalCount} work items`;
}

function formatStatusFilterLabel(statusFilter: StatusFilter): string {
  if (statusFilter === "all") {
    return "matching";
  }

  return formatStatus(statusFilter);
}

function buildLanes(items: WorkItemSummary[]) {
  return [
    { label: "Queued", value: countStatus(items, "queued"), tone: "neutral" },
    { label: "Running", value: countStatus(items, "running"), tone: "blue" },
    { label: "Paused", value: countStatus(items, "paused"), tone: "neutral" },
    {
      label: "Review",
      value: countStatus(items, "waiting_for_review"),
      tone: "amber",
    },
    { label: "Blocked", value: countStatus(items, "blocked"), tone: "red" },
  ];
}

function countStatus(items: WorkItemSummary[], status: WorkItemStatus): number {
  return items.filter((item) => item.status === status).length;
}

function getTimelineEvents(events: RunEventSummary[]): RunEventSummary[] {
  return [...events].reverse();
}

function selectRunDetailItem(
  items: WorkItemSummary[],
  requestedWorkItemId?: string,
): WorkItemSummary | undefined {
  const requested = requestedWorkItemId
    ? items.find((item) => item.id === requestedWorkItemId)
    : undefined;

  return (
    requested ??
    items.find((item) => item.status === "running") ??
    items.find((item) => item.status === "waiting_for_review") ??
    items[0]
  );
}

function getAvailableActions(status: WorkItemStatus): Array<{
  name: "start" | "retry" | "pause" | "resume" | "cancel" | "complete";
  label: string;
}> {
  switch (status) {
    case "queued":
      return [
        { name: "pause", label: "Pause" },
        { name: "cancel", label: "Cancel" },
      ];
    case "running":
      return [
        { name: "pause", label: "Pause" },
        { name: "cancel", label: "Cancel" },
      ];
    case "waiting_for_review":
      return [
        { name: "retry", label: "Retry" },
        { name: "cancel", label: "Cancel" },
      ];
    case "paused":
    case "blocked":
      return [
        { name: "resume", label: "Resume" },
        { name: "cancel", label: "Cancel" },
      ];
    case "failed":
      return [
        { name: "retry", label: "Retry" },
        { name: "cancel", label: "Cancel" },
      ];
    case "cancelled":
      return [
        { name: "start", label: "Start" },
        { name: "retry", label: "Retry" },
      ];
    case "completed":
      return [];
  }
}

function buildReviewCompletionGate(
  selected: WorkItemSummary | undefined,
  pullRequestArtifact: ArtifactSummary | undefined,
  pullRequestStatus: PullRequestStatusData,
): ReviewCompletionGate | undefined {
  if (selected?.status !== "waiting_for_review") {
    return undefined;
  }

  if (!pullRequestArtifact) {
    return {
      buttonTitle: "A PR or review artifact is required before completion.",
      canComplete: false,
      detail:
        "No pull request artifact was captured for this review-state run.",
      label: "Blocked",
      nextStep:
        "Rerun the work item or link review evidence before using the completion gate.",
      reasons: ["Capture or link review evidence before completing the work."],
      title: "Review evidence missing",
      tone: "blocked",
    };
  }

  if (pullRequestStatus.error) {
    return {
      buttonTitle: "Resolve the PR readiness error before completion.",
      canComplete: false,
      detail:
        "Symphony could not verify the linked GitHub PR, so completion is paused.",
      label: "Unknown",
      nextStep:
        "Restore GitHub/API access, then refresh PR readiness before completing.",
      reasons: [pullRequestStatus.error],
      title: "PR readiness unavailable",
      tone: "unknown",
    };
  }

  const pullRequest = pullRequestStatus.pullRequest;
  if (!pullRequest) {
    return {
      buttonTitle:
        "Complete only after manually reviewing the local PR artifact.",
      canComplete: true,
      detail:
        pullRequestStatus.skippedReason ??
        "No remote PR is linked, so this gate relies on manual local review.",
      label: "Manual",
      nextStep:
        "Open the local PR artifact, complete the external review, then mark complete.",
      reasons: ["Link a GitHub PR URL to enable live readiness checks."],
      title: "Local review gate",
      tone: "unknown",
    };
  }

  if (pullRequest.readiness.status === "ready") {
    const isMerged = Boolean(pullRequest.merged);
    return {
      buttonTitle:
        "Mark complete after the PR has been reviewed and merged externally.",
      canComplete: true,
      detail: isMerged
        ? "GitHub shows this PR is already merged. Symphony can now close the manual gate."
        : "GitHub readiness is clear. Completion still records only the human merge gate result.",
      label: "Ready",
      nextStep: isMerged
        ? "Mark complete to sync Symphony and Linear with the merged PR."
        : "Merge or approve externally as needed, then mark complete.",
      reasons: pullRequest.readiness.reasons,
      title: "Ready for human completion",
      tone: "ready",
    };
  }

  if (pullRequest.readiness.status === "pending") {
    return {
      buttonTitle: "Wait for pending PR checks or reviews before completion.",
      canComplete: false,
      detail: "The linked PR still has pending review or check signals.",
      label: "Pending",
      nextStep:
        "Wait for checks or reviews to settle, then refresh PR readiness.",
      reasons: pullRequest.readiness.reasons,
      title: "Waiting on PR readiness",
      tone: "pending",
    };
  }

  if (pullRequest.readiness.status === "blocked") {
    return buildBlockedReviewCompletionGate(pullRequest);
  }

  return {
    buttonTitle: "Resolve unknown PR readiness before completion.",
    canComplete: false,
    detail:
      "The linked PR state is unknown, so Symphony is holding the manual completion action.",
    label: "Unknown",
    nextStep: "Refresh PR readiness once GitHub state is available.",
    reasons: pullRequest.readiness.reasons,
    title: "PR readiness unknown",
    tone: "unknown",
  };
}

function buildBlockedReviewCompletionGate(
  pullRequest: PullRequestStatusSummary,
): ReviewCompletionGate {
  const hasMergeConflict =
    pullRequest.mergeable === false || pullRequest.mergeableState === "dirty";
  const hasRequestedChanges =
    pullRequest.review.status === "changes_requested";
  const hasFailingChecks = pullRequest.checks.status === "failure";
  const isClosed = pullRequest.state !== "open" && !pullRequest.merged;

  if (
    pullRequest.draft &&
    !hasMergeConflict &&
    !hasRequestedChanges &&
    !hasFailingChecks &&
    !isClosed
  ) {
    return {
      buttonTitle:
        "Mark the GitHub PR ready or merge it externally before completing.",
      canComplete: false,
      detail:
        "The linked PR branch is clean, but GitHub still marks the PR as a draft.",
      label: "Draft",
      nextStep:
        "Mark the PR ready for review in GitHub, complete the human review or merge step, then refresh.",
      reasons: pullRequest.readiness.reasons,
      title: "Manual PR action pending",
      tone: "blocked",
    };
  }

  if (hasMergeConflict) {
    return {
      buttonTitle: "Resolve PR merge conflicts before completing.",
      canComplete: false,
      detail:
        "The linked PR has merge conflicts that should be fixed on the PR branch.",
      label: "Conflict",
      nextStep:
        "Use Update / Resolve Conflicts, then refresh PR readiness.",
      reasons: pullRequest.readiness.reasons,
      title: "Merge conflict blocked",
      tone: "blocked",
    };
  }

  if (hasRequestedChanges || hasFailingChecks) {
    return {
      buttonTitle: "Resolve review or check blockers before completing.",
      canComplete: false,
      detail:
        "The linked PR has review or check blockers that likely need a follow-up commit.",
      label: "Blocked",
      nextStep:
        "Use Fix with agent for the requested change, then refresh PR readiness.",
      reasons: pullRequest.readiness.reasons,
      title: "Code follow-up needed",
      tone: "blocked",
    };
  }

  if (isClosed) {
    return {
      buttonTitle: "Reopen or relink the PR before completing.",
      canComplete: false,
      detail:
        "The linked PR is not open, so Symphony cannot use it as merge-ready evidence.",
      label: "Closed",
      nextStep:
        "Reopen the PR, link a current PR artifact, or rerun the work item.",
      reasons: pullRequest.readiness.reasons,
      title: "PR link needs attention",
      tone: "blocked",
    };
  }

  return {
    buttonTitle: "Resolve PR blockers before marking this work complete.",
    canComplete: false,
    detail:
      "The linked PR still has blockers before Symphony can close the manual gate.",
    label: "Blocked",
    nextStep: "Resolve the GitHub blocker, then refresh PR readiness.",
    reasons: pullRequest.readiness.reasons,
    title: "Completion blocked",
    tone: "blocked",
  };
}

function ProjectMenu({
  projects,
  selectedProjectId,
  statusFilter,
  view,
}: {
  projects: ProjectOption[];
  selectedProjectId: string;
  statusFilter: StatusFilter;
  view: DashboardView;
}) {
  const selectedProject =
    projects.find((project) => project.id === selectedProjectId) ?? projects[0];

  return (
    <details className="projectMenu">
      <summary title="Switch project">
        <FolderKanban size={15} />
        <div>
          <strong>
            {selectedProject?.name ?? formatProjectId(selectedProjectId)}
          </strong>
          <span>{selectedProjectId}</span>
        </div>
        <ChevronDown size={14} />
      </summary>
      <div className="projectMenuList">
        {projects.map((project) => (
          <a
            aria-current={project.id === selectedProjectId ? "page" : undefined}
            className={project.id === selectedProjectId ? "activeProject" : ""}
            href={buildDashboardHref({
              projectId: project.id,
              status: statusFilter,
              view,
            })}
            key={project.id}
          >
            <span>
              <strong>{project.name}</strong>
              <small>{project.id}</small>
            </span>
            <em>{project.workItemCount}</em>
          </a>
        ))}
      </div>
    </details>
  );
}

function ConfigView({
  integrations,
  repositoryConnectivityChecks,
  repositoryConnectivityChecksByRepository,
  repositories,
  selectedProjectId,
}: {
  integrations: IntegrationHealth;
  repositoryConnectivityChecks: RepositoryConnectivityCheckResult[];
  repositoryConnectivityChecksByRepository: Record<
    string,
    RepositoryConnectivityCheckResult[]
  >;
  repositories: RepositoryOption[];
  selectedProjectId: string;
}) {
  const verification = integrations.linear.verification;
  const verificationTone = getLinearVerificationTone(verification?.status);
  const stateChecks = [
    ...integrations.linear.activeStates.map((state) => ({
      label: "Active",
      value: state,
    })),
    { label: "Running", value: integrations.linear.runningState },
    { label: "Review", value: integrations.linear.reviewState },
    { label: "Failure", value: integrations.linear.failureState },
    { label: "Done", value: integrations.linear.doneState },
    { label: "Cancelled", value: integrations.linear.cancelledState },
  ];

  return (
    <section className="configView">
      <section className="metrics auditMetrics">
        <div className="metric">
          <span>Repositories</span>
          <strong className="neutral">{repositories.length}</strong>
        </div>
        <div className="metric">
          <span>With local path</span>
          <strong className="green">
            {repositories.filter((repository) => repository.localPath).length}
          </strong>
        </div>
        <div className="metric">
          <span>Queued routes</span>
          <strong className="blue">
            {repositories.reduce(
              (total, repository) => total + repository.workItemCount,
              0,
            )}
          </strong>
        </div>
        <div className="metric">
          <span>Default branch</span>
          <strong className="neutral">
            {repositories[0]?.defaultBranch ?? "main"}
          </strong>
        </div>
      </section>

      <section className="panel linearConfigPanel">
        <div className="panelHeader compact">
          <div>
            <h2>Linear verification</h2>
            <p>{verification?.message ?? integrations.tracker.message}</p>
          </div>
          {verificationTone === "ok" ? (
            <ShieldCheck size={17} />
          ) : (
            <AlertTriangle size={17} />
          )}
        </div>

        <div className="linearStatusGrid">
          <div className={`linearStatusCard ${verificationTone}`}>
            <span>Status</span>
            <strong>
              {formatLinearVerificationStatus(verification?.status)}
            </strong>
            <small>
              {verification?.checkedAt
                ? `checked ${formatRelativeTime(verification.checkedAt)}`
                : integrations.linear.enabled
                  ? "not checked"
                  : "tracker inactive"}
            </small>
          </div>
          <div className="linearStatusCard">
            <span>API key</span>
            <strong>
              {integrations.linear.apiKeyConfigured ? "configured" : "missing"}
            </strong>
            <small>secret hidden</small>
          </div>
          <div className="linearStatusCard">
            <span>Team</span>
            <strong>{verification?.team?.key ?? "unverified"}</strong>
            <small>{verification?.team?.name ?? "TypeScript config"}</small>
          </div>
          <div className="linearStatusCard">
            <span>Webhook</span>
            <strong>
              {integrations.linear.webhookSecretConfigured
                ? "configured"
                : "missing"}
            </strong>
            <small>{integrations.linear.webhookToleranceMs}ms window</small>
          </div>
        </div>

        {verification?.error ? (
          <div className="linearError">{verification.error}</div>
        ) : null}

        <div className="stateCheckGrid">
          {stateChecks.map((state, index) => {
            const matched =
              verification?.matchedStateNames.includes(state.value) ?? false;
            const missing =
              verification?.missingStateNames.includes(state.value) ?? false;
            return (
              <div
                className={`stateCheck ${matched ? "ok" : missing ? "error" : ""}`}
                key={`${state.label}-${state.value}-${index}`}
              >
                {matched ? <CheckCircle2 size={14} /> : <Square size={14} />}
                <span>{state.label}</span>
                <strong>{state.value}</strong>
              </div>
            );
          })}
        </div>
      </section>

      <LinearWebhookSetupPanel setup={integrations.linear.webhookSetup} />

      <section className="panel runtimeConfigPanel">
        <div className="panelHeader compact">
          <div>
            <h2>Runtime policy</h2>
            <p>{integrations.runtime.message}</p>
          </div>
          {integrations.runtime.status === "error" ? (
            <AlertTriangle size={17} />
          ) : (
            <ShieldCheck size={17} />
          )}
        </div>

        <div className="runtimeStatusGrid">
          <div className={`linearStatusCard ${integrations.runtime.status}`}>
            <span>Selected runtime</span>
            <strong>{formatRuntime(integrations.runtime.kind)}</strong>
            <small>
              {integrations.runtime.workflow.loaded
                ? "workflow loaded"
                : "workflow missing"}
            </small>
          </div>
          <div className="linearStatusCard">
            <span>Workflow root</span>
            <strong>{shortenPath(integrations.runtime.workflow.root)}</strong>
            <small>
              {integrations.runtime.workflow.path
                ? shortenPath(integrations.runtime.workflow.path)
                : "default path"}
            </small>
          </div>
          <div className="linearStatusCard">
            <span>Turn timeout</span>
            <strong>
              {formatDurationMs(integrations.runtime.codex.turnTimeoutMs)}
            </strong>
            <small>
              stall{" "}
              {formatDurationMs(integrations.runtime.codex.stallTimeoutMs)}
            </small>
          </div>
        </div>

        {integrations.runtime.workflow.error ||
        integrations.runtime.configError ? (
          <div className="linearError">
            {integrations.runtime.workflow.error ??
              integrations.runtime.configError}
          </div>
        ) : null}

        <div className="runtimePolicyGrid">
          <div
            className={
              integrations.runtime.codex.enabled
                ? "runtimePolicy active"
                : "runtimePolicy"
            }
          >
            <div className="runtimePolicyHeader">
              <strong>Codex</strong>
              <span>
                {integrations.runtime.codex.enabled ? "active" : "standby"}
              </span>
            </div>
            <dl>
              <div>
                <dt>Command</dt>
                <dd>{integrations.runtime.codex.command}</dd>
              </div>
              <div>
                <dt>Args</dt>
                <dd>{integrations.runtime.codex.args.join(" ")}</dd>
              </div>
              <div>
                <dt>Approval</dt>
                <dd>
                  {integrations.runtime.codex.approvalPolicy ?? "default"}
                </dd>
              </div>
              <div>
                <dt>Sandbox</dt>
                <dd>{integrations.runtime.codex.sandbox ?? "default"}</dd>
              </div>
              <div>
                <dt>Skip git check</dt>
                <dd>
                  {integrations.runtime.codex.skipGitRepoCheck
                    ? "enabled"
                    : "disabled"}
                </dd>
              </div>
              <div>
                <dt>Auth</dt>
                <dd>
                  {integrations.runtime.codex.apiKeyConfigured
                    ? (integrations.runtime.codex.apiKeySource ?? "configured")
                    : "CLI login"}
                </dd>
              </div>
              <div>
                <dt>Model</dt>
                <dd>{integrations.runtime.codex.model ?? "CLI default"}</dd>
              </div>
              <div>
                <dt>Reasoning</dt>
                <dd>
                  {integrations.runtime.codex.reasoningEffort ?? "CLI default"}
                </dd>
              </div>
            </dl>
          </div>

          <div
            className={
              integrations.runtime.cursor.enabled
                ? "runtimePolicy active"
                : "runtimePolicy"
            }
          >
            <div className="runtimePolicyHeader">
              <strong>Cursor</strong>
              <span>
                {integrations.runtime.cursor.enabled ? "active" : "standby"}
              </span>
            </div>
            <dl>
              <div>
                <dt>Command</dt>
                <dd>{integrations.runtime.cursor.command}</dd>
              </div>
              <div>
                <dt>Args</dt>
                <dd>
                  {integrations.runtime.cursor.args?.join(" ") ??
                    `--print --output-format ${integrations.runtime.cursor.outputFormat}`}
                </dd>
              </div>
              <div>
                <dt>Sandbox</dt>
                <dd>{integrations.runtime.cursor.sandbox ?? "default"}</dd>
              </div>
              <div>
                <dt>Trust workspace</dt>
                <dd>
                  {integrations.runtime.cursor.trustWorkspace
                    ? "enabled"
                    : "disabled"}
                </dd>
              </div>
              <div>
                <dt>Force</dt>
                <dd>
                  {integrations.runtime.cursor.force ? "enabled" : "disabled"}
                </dd>
              </div>
              <div>
                <dt>Auth</dt>
                <dd>
                  {integrations.runtime.cursor.apiKeyConfigured
                    ? "CURSOR_API_KEY"
                    : "CLI login"}
                </dd>
              </div>
              <div>
                <dt>Model</dt>
                <dd>{integrations.runtime.cursor.model ?? "CLI default"}</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      <RepositoryConnectivityPanel results={repositoryConnectivityChecks} />

      <section className="configGrid">
        <div className="panel configPanel">
          <div className="panelHeader compact">
            <div>
              <h2>Register repository</h2>
              <p>{selectedProjectId}</p>
            </div>
            <GitBranch size={17} />
          </div>

          <form action={submitRepositoryRegistration} className="repoForm">
            <input name="projectId" type="hidden" value={selectedProjectId} />
            <input name="view" type="hidden" value="config" />
            <label>
              <span>Name</span>
              <input
                maxLength={120}
                name="name"
                placeholder="agentic-project-management"
                required
              />
            </label>
            <label>
              <span>Repository URL</span>
              <input
                maxLength={2000}
                name="url"
                placeholder="file:///path/to/repo or git@github.com:org/repo.git"
                required
              />
            </label>
            <label>
              <span>Default branch</span>
              <input maxLength={120} name="defaultBranch" placeholder="main" />
            </label>
            <label>
              <span>Local path</span>
              <input
                maxLength={2000}
                name="localPath"
                placeholder="/path/to/local/repo"
              />
            </label>
            <label>
              <span>PR mode</span>
              <select defaultValue="local_draft" name="prMode">
                <option value="local_draft">Local draft</option>
                <option value="github_draft">GitHub draft</option>
                <option value="disabled">Disabled</option>
              </select>
            </label>
            <label>
              <span>PR remote</span>
              <input maxLength={120} name="prRemoteName" placeholder="origin" />
            </label>
            <label>
              <span>PR base branch</span>
              <input maxLength={120} name="prBaseBranch" placeholder="main" />
            </label>
            <label>
              <span>PR branch prefix</span>
              <input
                maxLength={80}
                name="prBranchPrefix"
                placeholder="agent"
              />
            </label>
            <label>
              <span>PR branch max length</span>
              <input
                max={240}
                min={32}
                name="prBranchMaxLength"
                placeholder="120"
                type="number"
              />
            </label>
            <label className="checkboxLine">
              <input defaultChecked name="prDraft" type="checkbox" />
              <span>Create as draft</span>
            </label>
            <label className="checkboxLine">
              <input name="prBranchIncludeTimestamp" type="checkbox" />
              <span>Add timestamp to branch</span>
            </label>
            <div className="repoFormActions">
              <button
                formAction={submitRepositoryConnectivityCheck}
                title="Check repository access"
                type="submit"
              >
                <ShieldCheck size={16} />
                Check access
              </button>
              <button
                className="primary"
                title="Register repository"
                type="submit"
              >
                <Plus size={16} />
                Register
              </button>
            </div>
          </form>
        </div>

        <div className="panel configPanel">
          <div className="panelHeader compact">
            <div>
              <h2>Managed repositories</h2>
              <p>{repositories.length} repository refs</p>
            </div>
            <HardDrive size={17} />
          </div>

          {repositories.length > 0 ? (
            <div className="repoList">
              {repositories.map((repository) => {
                const repositoryChecks = selectRepositoryConnectivityChecks(
                  repository,
                  repositoryConnectivityChecksByRepository,
                  repositoryConnectivityChecks,
                );
                return (
                  <article className="repoItem" key={repository.id}>
                    <div>
                      <strong>{repository.name}</strong>
                      <span>{repository.id}</span>
                    </div>
                    <dl>
                      <div>
                        <dt>URL</dt>
                        <dd>{repository.url}</dd>
                      </div>
                      <div>
                        <dt>Local path</dt>
                        <dd>{repository.localPath ?? "not set"}</dd>
                      </div>
                      <div>
                        <dt>Branch</dt>
                        <dd>{repository.defaultBranch}</dd>
                      </div>
                      <div>
                        <dt>PR mode</dt>
                        <dd>
                          {formatPullRequestMode(repository.pullRequest?.mode)}
                        </dd>
                      </div>
                      <div>
                        <dt>PR target</dt>
                        <dd>
                          {[
                            repository.pullRequest?.remoteName,
                            repository.pullRequest?.baseBranch,
                          ]
                            .filter(Boolean)
                            .join(" / ") || "not set"}
                        </dd>
                      </div>
                      <div>
                        <dt>PR branch</dt>
                        <dd>
                          {formatPullRequestBranchPolicy(
                            repository.pullRequest?.branch,
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Work items</dt>
                        <dd>{repository.workItemCount}</dd>
                      </div>
                    </dl>
                    <RepositoryConnectivityInline results={repositoryChecks} />
                    <details className="repoEditDetails">
                      <summary>Edit repository</summary>
                      <form
                        action={submitRepositoryUpdate}
                        className="repoEditForm"
                      >
                        <input
                          name="projectId"
                          type="hidden"
                          value={selectedProjectId}
                        />
                        <input name="view" type="hidden" value="config" />
                        <input
                          name="repositoryId"
                          type="hidden"
                          value={repository.id}
                        />
                        <label>
                          <span>Name</span>
                          <input
                            defaultValue={repository.name}
                            maxLength={120}
                            name="name"
                            required
                          />
                        </label>
                        <label className="fullLine">
                          <span>Repository URL</span>
                          <input
                            defaultValue={repository.url}
                            maxLength={2000}
                            name="url"
                            required
                          />
                        </label>
                        <label>
                          <span>Default branch</span>
                          <input
                            defaultValue={repository.defaultBranch}
                            maxLength={120}
                            name="defaultBranch"
                          />
                        </label>
                        <label className="fullLine">
                          <span>Local path</span>
                          <input
                            defaultValue={repository.localPath ?? ""}
                            maxLength={2000}
                            name="localPath"
                          />
                        </label>
                        <label>
                          <span>PR mode</span>
                          <select
                            defaultValue={
                              repository.pullRequest?.mode ?? "local_draft"
                            }
                            name="prMode"
                          >
                            <option value="local_draft">Local draft</option>
                            <option value="github_draft">GitHub draft</option>
                            <option value="disabled">Disabled</option>
                          </select>
                        </label>
                        <label>
                          <span>PR remote</span>
                          <input
                            defaultValue={
                              repository.pullRequest?.remoteName ?? ""
                            }
                            maxLength={120}
                            name="prRemoteName"
                          />
                        </label>
                        <label>
                          <span>PR base branch</span>
                          <input
                            defaultValue={
                              repository.pullRequest?.baseBranch ?? ""
                            }
                            maxLength={120}
                            name="prBaseBranch"
                          />
                        </label>
                        <label>
                          <span>PR branch prefix</span>
                          <input
                            defaultValue={
                              repository.pullRequest?.branch?.prefix ?? ""
                            }
                            maxLength={80}
                            name="prBranchPrefix"
                          />
                        </label>
                        <label>
                          <span>PR branch max length</span>
                          <input
                            defaultValue={
                              repository.pullRequest?.branch?.maxLength ?? ""
                            }
                            max={240}
                            min={32}
                            name="prBranchMaxLength"
                            type="number"
                          />
                        </label>
                        <label className="checkboxLine">
                          <input
                            defaultChecked={
                              repository.pullRequest?.draft ?? true
                            }
                            name="prDraft"
                            type="checkbox"
                          />
                          <span>Create as draft</span>
                        </label>
                        <label className="checkboxLine">
                          <input
                            defaultChecked={
                              repository.pullRequest?.branch
                                ?.includeTimestamp ?? false
                            }
                            name="prBranchIncludeTimestamp"
                            type="checkbox"
                          />
                          <span>Add timestamp to branch</span>
                        </label>
                        <div className="repoEditActions">
                          <button
                            formAction={submitRepositoryConnectivityCheck}
                            title="Check repository access"
                            type="submit"
                          >
                            <ShieldCheck size={14} />
                            Check access
                          </button>
                          <button title="Save repository changes" type="submit">
                            <Save size={14} />
                            Save changes
                          </button>
                        </div>
                      </form>
                    </details>
                    <details className="repoArchiveDetails">
                      <summary>Archive repository</summary>
                      <form
                        action={submitRepositoryArchive}
                        className="repoArchiveForm"
                      >
                        <input
                          name="projectId"
                          type="hidden"
                          value={selectedProjectId}
                        />
                        <input name="view" type="hidden" value="config" />
                        <input
                          name="repositoryId"
                          type="hidden"
                          value={repository.id}
                        />
                        <input
                          name="repositoryName"
                          type="hidden"
                          value={repository.name}
                        />
                        <p className="repoArchiveHint">
                          Existing work items stay readable; future routing
                          ignores this repo.
                        </p>
                        <label>
                          <span>Confirm name</span>
                          <input
                            maxLength={120}
                            name="confirmationName"
                            placeholder={repository.name}
                            required
                          />
                        </label>
                        <label>
                          <span>Reason</span>
                          <input
                            maxLength={500}
                            name="archiveReason"
                            placeholder="optional"
                          />
                        </label>
                        <button
                          className="dangerButton"
                          title="Archive repository"
                          type="submit"
                        >
                          <Archive size={14} />
                          Archive
                        </button>
                      </form>
                    </details>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="emptyState">
              <Database size={18} />
              <strong>No repositories registered</strong>
              <span>
                Register a repository to make it available in the work item
                intake selector.
              </span>
            </div>
          )}
        </div>
      </section>
    </section>
  );
}

function LinearWebhookSetupPanel({
  setup,
}: {
  setup: IntegrationHealth["linear"]["webhookSetup"];
}) {
  const tone = getLinearWebhookSetupTone(setup.status);

  return (
    <section className="panel webhookSetupPanel">
      <div className="panelHeader compact">
        <div>
          <h2>Webhook setup</h2>
          <p>{setup.message}</p>
        </div>
        {tone === "ok" ? (
          <ShieldCheck size={17} />
        ) : (
          <AlertTriangle size={17} />
        )}
      </div>

      <div className="webhookSetupGrid">
        <div className={`linearStatusCard ${tone}`}>
          <span>Public callback</span>
          <strong>{setup.publicCallbackUrl ?? "missing"}</strong>
          <small>
            {setup.publicCallbackConfigured
              ? "ready for Linear"
              : "set LINEAR_WEBHOOK_PUBLIC_URL"}
          </small>
        </div>
        <div className="linearStatusCard">
          <span>Local callback</span>
          <strong>{setup.localCallbackUrl}</strong>
          <small>{setup.endpointPath}</small>
        </div>
        <div
          className={`linearStatusCard ${
            setup.secretConfigured ? "ok" : "error"
          }`}
        >
          <span>Signing secret</span>
          <strong>{setup.secretConfigured ? "configured" : "missing"}</strong>
          <small>LINEAR_WEBHOOK_SECRET</small>
        </div>
        <div className="linearStatusCard">
          <span>Verification</span>
          <strong>{setup.signatureHeader}</strong>
          <small>
            {setup.timestampField} · {setup.toleranceMs}ms
          </small>
        </div>
      </div>

      <div className="webhookSetupChecklist">
        <div
          className={
            setup.secretConfigured ? "stateCheck ok" : "stateCheck error"
          }
        >
          {setup.secretConfigured ? (
            <CheckCircle2 size={14} />
          ) : (
            <AlertTriangle size={14} />
          )}
          <span>Secret</span>
          <strong>{setup.secretConfigured ? "ready" : "required"}</strong>
        </div>
        <div
          className={
            setup.publicCallbackConfigured ? "stateCheck ok" : "stateCheck"
          }
        >
          {setup.publicCallbackConfigured ? (
            <CheckCircle2 size={14} />
          ) : (
            <Square size={14} />
          )}
          <span>Public URL</span>
          <strong>
            {setup.publicCallbackConfigured ? "configured" : "local only"}
          </strong>
        </div>
        <div className="stateCheck ok">
          <CheckCircle2 size={14} />
          <span>Deduping</span>
          <strong>{setup.deliveryHeader}</strong>
        </div>
      </div>
    </section>
  );
}

function RepositoryConnectivityInline({
  results,
}: {
  results: RepositoryConnectivityCheckResult[];
}) {
  const latest = results[0];

  if (!latest) {
    return (
      <div className="repositoryCheckInline empty">
        <div>
          <ShieldCheck size={14} />
          <strong>No access check</strong>
        </div>
        <p>Run Check access to capture repository readiness.</p>
      </div>
    );
  }

  const checkSummary =
    latest.checks.length > 0
      ? latest.checks
          .map(
            (check) =>
              `${formatRepositoryConnectivityCheckName(check.name)}: ${formatRepositoryConnectivityStatus(check.status)}`,
          )
          .join(" · ")
      : latest.message;

  return (
    <div className={`repositoryCheckInline ${latest.status}`}>
      <div>
        {getRepositoryConnectivityIcon(latest.status, 14)}
        <strong>{formatRepositoryConnectivityStatus(latest.status)}</strong>
        <span>{formatRelativeTime(latest.createdAt)}</span>
      </div>
      <p>{checkSummary}</p>
    </div>
  );
}

function RepositoryConnectivityPanel({
  results,
}: {
  results: RepositoryConnectivityCheckResult[];
}) {
  const latest = results[0];

  return (
    <section className="panel repositoryCheckPanel">
      <div className="panelHeader compact">
        <div>
          <h2>Repository access checks</h2>
          <p>
            {latest
              ? `${latest.repositoryName} checked ${formatRelativeTime(latest.createdAt)}`
              : "No checks captured yet"}
          </p>
        </div>
        {latest ? (
          getRepositoryConnectivityIcon(latest.status, 17)
        ) : (
          <ShieldCheck size={17} />
        )}
      </div>

      {results.length > 0 ? (
        <div className="repositoryCheckStack" role="list">
          {results.map((result) => (
            <article
              className={`repositoryCheckItem ${result.status}`}
              key={result.id}
              role="listitem"
            >
              <div className="repositoryCheckSummary">
                <div>
                  <strong>{result.repositoryName}</strong>
                  <span>
                    {[
                      formatRelativeTime(result.createdAt),
                      result.actorId,
                      result.pullRequestMode
                        ? formatPullRequestMode(result.pullRequestMode)
                        : undefined,
                      result.hasLocalPath ? "local path" : undefined,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
                <span className={`eventLevel ${result.status}`}>
                  {formatRepositoryConnectivityStatus(result.status)}
                </span>
              </div>

              {result.checks.length > 0 ? (
                <div className="repositoryCheckGrid">
                  {result.checks.map((check) => (
                    <div
                      className={`repositoryCheckRow ${check.status}`}
                      key={`${result.id}-${check.name}`}
                    >
                      {getRepositoryConnectivityIcon(check.status, 14)}
                      <div>
                        <strong>
                          {formatRepositoryConnectivityCheckName(check.name)}
                        </strong>
                        <span>{check.message}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="repositoryCheckEmpty">{result.message}</p>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="emptyState compactEmpty">
          <ShieldCheck size={18} />
          <strong>No repository checks yet</strong>
          <span>Use Check access on a repository form to capture a probe.</span>
        </div>
      )}
    </section>
  );
}

function WebhookAuditView({
  audit,
  selectedProjectId,
}: {
  audit: WebhookAuditData;
  selectedProjectId: string;
}) {
  const stats = buildWebhookAuditStats(audit.deliveries);

  return (
    <section className="auditView">
      <section className="metrics auditMetrics">
        {stats.map((stat) => (
          <div className="metric" key={stat.label}>
            <span>{stat.label}</span>
            <strong className={stat.tone}>{stat.value}</strong>
          </div>
        ))}
      </section>

      <div className="panel auditPanel">
        <div className="panelHeader">
          <div>
            <h2>Webhook deliveries</h2>
            <p>
              {audit.deliveries.length} recent deliveries
              {audit.generatedAt
                ? ` · refreshed ${formatRelativeTime(audit.generatedAt)}`
                : ""}
            </p>
          </div>
          <a
            className="iconButton"
            href={buildDashboardHref({
              projectId: selectedProjectId,
              view: "audit",
            })}
            title="Refresh audit"
          >
            <RefreshCw size={16} />
          </a>
        </div>

        {audit.error ? (
          <div className="timelineNotice">{audit.error}</div>
        ) : audit.deliveries.length > 0 ? (
          <div className="auditTable">
            <div className="auditRow auditHead">
              <span>Delivery</span>
              <span>Status</span>
              <span>Result</span>
              <span>Received</span>
            </div>
            {audit.deliveries.map((delivery) => (
              <div className="auditRow" key={delivery.id}>
                <div>
                  <strong>{delivery.deliveryId}</strong>
                  <span>
                    {delivery.provider}
                    {delivery.event ? ` · ${delivery.event}` : ""}
                    {delivery.action ? ` · ${delivery.action}` : ""}
                  </span>
                </div>
                <div>
                  <span className={`pill ${delivery.status}`}>
                    {formatStatus(delivery.status)}
                  </span>
                  <span>{formatAttemptCount(delivery.attemptCount)}</span>
                </div>
                <div>
                  <strong>{formatWebhookResult(delivery)}</strong>
                  <span>{delivery.type ?? "unknown payload type"}</span>
                </div>
                <div>
                  <strong>{formatRelativeTime(delivery.lastReceivedAt)}</strong>
                  <span>
                    {delivery.processedAt
                      ? `processed ${formatRelativeTime(delivery.processedAt)}`
                      : "not processed"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="emptyState">
            <Database size={18} />
            <strong>No webhook deliveries yet</strong>
            <span>
              After Linear sends a signed webhook, delivery attempts and replay
              status will appear here.
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

function buildWebhookAuditStats(deliveries: WebhookDeliverySummary[]) {
  return [
    { label: "Deliveries", value: deliveries.length, tone: "neutral" },
    {
      label: "Replayed",
      value: deliveries.filter((delivery) => delivery.attemptCount > 1).length,
      tone: "amber",
    },
    {
      label: "Failed",
      value: deliveries.filter((delivery) => delivery.status === "failed")
        .length,
      tone: "red",
    },
    {
      label: "Processing",
      value: deliveries.filter((delivery) => delivery.status === "processing")
        .length,
      tone: "blue",
    },
  ];
}

function getLinearVerificationTone(
  status: LinearVerificationStatus | undefined,
): "ok" | "warn" | "error" {
  if (status === "verified") {
    return "ok";
  }

  if (status === "disabled") {
    return "warn";
  }

  return "error";
}

function getLinearWebhookSetupTone(
  status: LinearWebhookSetupStatus,
): "ok" | "warn" | "error" {
  switch (status) {
    case "ready":
      return "ok";
    case "local_only":
    case "disabled":
      return "warn";
    case "missing_secret":
      return "error";
  }
}

function formatLinearVerificationStatus(
  status: LinearVerificationStatus | undefined,
): string {
  switch (status) {
    case "verified":
      return "verified";
    case "missing_states":
      return "missing states";
    case "missing_config":
      return "missing config";
    case "failed":
      return "failed";
    case "disabled":
      return "disabled";
    default:
      return "unknown";
  }
}

function TrackerHealthBadge({ health }: { health: IntegrationHealth }) {
  const title = [
    health.linear.enabled
      ? [
          `Linear tracker: ${health.tracker.message}`,
          `API key: ${health.linear.apiKeyConfigured ? "configured" : "missing"}`,
          `Team key: ${health.linear.teamKeyConfigured ? "configured" : "missing"}`,
          `Webhook secret: ${health.linear.webhookSecretConfigured ? "configured" : "missing"}`,
          `Verification: ${formatLinearVerificationStatus(health.linear.verification?.status)}`,
          `Review state: ${health.linear.reviewState}`,
          `Done state: ${health.linear.doneState}`,
          `Cancelled state: ${health.linear.cancelledState}`,
        ].join("\n")
      : health.tracker.message,
    [
      `Runtime: ${formatRuntime(health.runtime.kind)}`,
      `Workflow: ${health.runtime.workflow.loaded ? "loaded" : "missing"}`,
      `Codex sandbox: ${health.runtime.codex.sandbox ?? "default"}`,
      `Codex approval: ${health.runtime.codex.approvalPolicy ?? "default"}`,
      `Codex skip git check: ${health.runtime.codex.skipGitRepoCheck ? "enabled" : "disabled"}`,
    ].join("\n"),
  ].join("\n\n");

  return (
    <div className={`healthBadge ${combineHealthStatus(health)}`} title={title}>
      {combineHealthStatus(health) === "ok" ? (
        <CheckCircle2 size={15} />
      ) : (
        <AlertTriangle size={15} />
      )}
      <div>
        <strong>
          {health.linear.enabled ? "Linear" : health.tracker.kind}
        </strong>
        <span>
          {health.tracker.message} · {formatRuntime(health.runtime.kind)}
        </span>
      </div>
    </div>
  );
}

function combineHealthStatus(
  health: IntegrationHealth,
): IntegrationHealthStatus {
  if (health.tracker.status === "error" || health.runtime.status === "error") {
    return "error";
  }

  if (health.tracker.status === "warn" || health.runtime.status === "warn") {
    return "warn";
  }

  return "ok";
}

function ActionIcon({
  action,
}: {
  action: "start" | "retry" | "pause" | "resume" | "cancel" | "complete";
}) {
  switch (action) {
    case "start":
    case "resume":
      return <Play size={14} />;
    case "retry":
      return <RotateCcw size={14} />;
    case "pause":
      return <CirclePause size={14} />;
    case "cancel":
      return <XCircle size={14} />;
    case "complete":
      return <CheckCircle2 size={14} />;
  }
}

function formatStatus(status: string): string {
  return status.replaceAll("_", " ");
}

function formatPullRequestMode(mode: string | undefined): string {
  return mode ? formatStatus(mode) : "local draft";
}

function formatPullRequestBranchPolicy(
  branch:
    | {
        includeTimestamp?: boolean;
        maxLength?: number;
        prefix?: string;
      }
    | undefined,
): string {
  const prefix = branch?.prefix || "agent";
  const maxLength = branch?.maxLength ?? 120;
  const timestamp = branch?.includeTimestamp ? "timestamp" : "run id";
  return `${prefix} / ${maxLength} chars / ${timestamp}`;
}

function formatRepositoryConnectivityStatus(
  status: RepositoryConnectivityStatus,
): string {
  switch (status) {
    case "ok":
      return "ok";
    case "warn":
      return "warning";
    case "error":
      return "error";
  }
}

function formatRepositoryConnectivityCheckName(name: string): string {
  switch (name) {
    case "local_path":
      return "Local path";
    case "repository_url":
      return "Repository URL";
    case "pr_remote":
      return "PR remote";
    default:
      return formatStatus(name);
  }
}

function getRepositoryConnectivityIcon(
  status: RepositoryConnectivityStatus,
  size: number,
) {
  switch (status) {
    case "ok":
      return <CheckCircle2 size={size} />;
    case "warn":
      return <AlertTriangle size={size} />;
    case "error":
      return <XCircle size={size} />;
  }
}

function formatArtifactType(type: string): string {
  return type.replaceAll("_", " ");
}

function formatRuntime(runtime: DesiredAgentRuntime): string {
  const labels: Record<DesiredAgentRuntime, string> = {
    codex: "Codex",
    cursor: "Cursor",
    fake: "Fake",
    generic: "Generic",
  };
  return labels[runtime];
}

function formatDurationMs(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "not set";
  }

  if (value < 1000) {
    return `${value}ms`;
  }

  const seconds = Math.round(value / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.round(minutes / 60);
  return `${hours}h`;
}

function shortenPath(value: string): string {
  if (value.length <= 44) {
    return value;
  }

  return `...${value.slice(-41)}`;
}

function formatBranchName(branchName: string): string {
  const compact = branchName.replace(/^agent\//, "");
  return compact.length > 34 ? `${compact.slice(0, 31)}...` : compact;
}

function formatReadinessStatus(status: PullRequestReadinessStatus): string {
  const labels: Record<PullRequestReadinessStatus, string> = {
    blocked: "Blocked",
    pending: "Pending",
    ready: "Ready",
    unknown: "Unknown",
  };
  return labels[status];
}

function formatPullRequestState(pullRequest: PullRequestStatusSummary): string {
  if (pullRequest.merged) {
    return "merged";
  }

  return [pullRequest.state, pullRequest.draft ? "draft" : undefined]
    .filter(Boolean)
    .join(" · ");
}

function formatPullRequestBranchPair(
  pullRequest: PullRequestStatusSummary,
): string {
  return [pullRequest.headRef, pullRequest.baseRef]
    .filter(Boolean)
    .join(" -> ");
}

function formatPullRequestEvidence(
  pullRequest: PullRequestStatusSummary,
): string {
  const evidence = [
    pullRequest.headSha ? `head ${pullRequest.headSha.slice(0, 7)}` : undefined,
    pullRequest.fetchedAt
      ? `checked ${formatRelativeTime(pullRequest.fetchedAt)}`
      : undefined,
  ].filter(Boolean);

  return evidence.length > 0 ? evidence.join(" · ") : "readiness not checked";
}

function formatReviewStatus(
  review: PullRequestStatusSummary["review"],
): string {
  if (review.status === "approved") {
    return `${review.approvals} approved`;
  }
  if (review.status === "changes_requested") {
    return `${review.changesRequested} changes requested`;
  }
  if (review.status === "commented") {
    return `${review.comments} commented`;
  }
  if (review.status === "review_required") {
    return "review required";
  }
  return "unknown";
}

function formatChecksStatus(
  checks: PullRequestStatusSummary["checks"],
): string {
  if (checks.status === "none") {
    return "none reported";
  }
  if (checks.status === "unknown") {
    return "unknown";
  }

  return [
    checks.passed > 0 ? `${checks.passed} passing` : undefined,
    checks.failed > 0 ? `${checks.failed} failed` : undefined,
    checks.pending > 0 ? `${checks.pending} pending` : undefined,
    checks.skipped > 0 ? `${checks.skipped} skipped` : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
}

function formatMergeability(pullRequest: PullRequestStatusSummary): string {
  if (pullRequest.mergeable === true) {
    return pullRequest.mergeableState ?? "mergeable";
  }

  if (pullRequest.mergeable === false) {
    return pullRequest.mergeableState ?? "conflict";
  }

  return pullRequest.mergeableState ?? "calculating";
}

function formatCheckStatus(check: PullRequestCheckSummary): string {
  return check.conclusion ?? check.status;
}

function normalizeRuntimePreference(
  runtime: string | undefined,
): DesiredAgentRuntime | undefined {
  if (!runtime) {
    return undefined;
  }

  const normalized = runtime.toLowerCase();
  if (normalized.includes("codex")) {
    return "codex";
  }
  if (normalized.includes("cursor")) {
    return "cursor";
  }
  if (normalized.includes("fake")) {
    return "fake";
  }
  if (normalized.includes("generic")) {
    return "generic";
  }

  return undefined;
}

function formatArtifactUri(uri: string): string {
  const normalized = uri.replaceAll("\\", "/");
  const parts = normalized.split("/");
  return parts.slice(-2).join("/");
}

function formatAttemptCount(attemptCount: number): string {
  return attemptCount === 1 ? "1 attempt" : `${attemptCount} attempts`;
}

function formatWebhookResult(delivery: WebhookDeliverySummary): string {
  const status = readMetadataString(delivery.result, "status");
  const issueIdentifier = readMetadataString(
    delivery.result,
    "issueIdentifier",
  );
  const state = readMetadataString(delivery.result, "state");
  const reason = readMetadataString(delivery.result, "reason");

  if (status === "reconciled") {
    return [issueIdentifier ?? "issue", state].filter(Boolean).join(" · ");
  }

  if (reason) {
    return reason.replaceAll("_", " ");
  }

  return status ? formatStatus(status) : "No result stored";
}

function getArtifactAction(
  artifact: ArtifactSummary,
): ArtifactAction | undefined {
  const remotePrUrl = readMetadataString(artifact.metadata, "remotePrUrl");
  if (remotePrUrl) {
    return {
      href: remotePrUrl,
      label: "Open PR",
      title: "Open remote pull request",
    };
  }

  if (!isReadableLocalTextArtifact(artifact)) {
    return undefined;
  }

  const labels: Partial<Record<ArtifactSummary["type"], string>> = {
    log: "Open log",
    patch: "Open patch",
    pr: "Open draft",
    test_report: "Open report",
    review_packet: "Open packet",
    plan: "Open plan",
  };

  return {
    href: `${apiUrl}/artifacts/${artifact.id}/content`,
    label: labels[artifact.type] ?? "Open file",
    title: `Open ${formatArtifactType(artifact.type).toLowerCase()} artifact`,
  };
}

function isReadableLocalTextArtifact(artifact: ArtifactSummary): boolean {
  return (
    artifact.metadata?.local === true &&
    artifact.type !== "screenshot" &&
    artifact.type !== "video"
  );
}

function readMetadataString(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function formatRelativeTime(value: string): string {
  const date = new Date(value);
  const timestamp = date.getTime();

  if (Number.isNaN(timestamp)) {
    return "unknown";
  }

  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 10) {
    return "just now";
  }

  if (seconds < 60) {
    return `${seconds}s ago`;
  }

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

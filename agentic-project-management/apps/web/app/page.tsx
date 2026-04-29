import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  CirclePause,
  Database,
  Eye,
  ExternalLink,
  FileText,
  FolderKanban,
  GitBranch,
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
  submitRuntimePreference,
  submitWorkItemAction,
} from "./actions";

export const dynamic = "force-dynamic";

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
  workItemCount: number;
  isDefault: boolean;
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
    webhookToleranceMs: number;
    activeStates: string[];
    runningState: string;
    reviewState: string;
    failureState: string;
    doneState: string;
    cancelledState: string;
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

type DashboardView = "work" | "audit";

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
  const [runEvents, runArtifacts] =
    view === "work" && selected?.latestRun
      ? await Promise.all([
          fetchRunEvents(selected.latestRun.id),
          fetchRunArtifacts(selected.latestRun.id),
        ])
      : [{ events: [] }, { artifacts: [] }];
  const recentEvents = getRecentEvents(runEvents.events);

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
          <a>Config</a>
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
            <h1>{view === "audit" ? "Webhook audit" : "Agent runs"}</h1>
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
                        <span>{row.issue.title}</span>
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

                    <div className="eventTimeline">
                      <div className="eventTimelineHeader">
                        <span>Timeline</span>
                        <strong>{selected.eventCount} events</strong>
                      </div>

                      {runEvents.error ? (
                        <div className="timelineNotice">{runEvents.error}</div>
                      ) : recentEvents.length > 0 ? (
                        <div className="timelineList">
                          {recentEvents.map((event) => (
                            <div className="timelineItem" key={event.id}>
                              <div>
                                <strong>{event.type}</strong>
                                <span>
                                  {formatRelativeTime(event.createdAt)}
                                </span>
                              </div>
                              <p>{event.message}</p>
                              <span className={`eventLevel ${event.level}`}>
                                {event.level}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="timelineNotice">
                          No run events captured yet.
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
                        <div className="artifactStack">
                          {runArtifacts.artifacts.map((artifact) => {
                            const action = getArtifactAction(artifact);

                            return (
                              <div className="artifactItem" key={artifact.id}>
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
        ) : (
          <WebhookAuditView
            audit={webhookAudit}
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
      webhookToleranceMs: 0,
      activeStates: [],
      runningState: "Unknown",
      reviewState: "Unknown",
      failureState: "Unknown",
      doneState: "Unknown",
      cancelledState: "Unknown",
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
  return value === "audit" ? "audit" : "work";
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

  if (view === "audit") {
    params.set("view", "audit");
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

function getRecentEvents(events: RunEventSummary[]): RunEventSummary[] {
  return events.slice(-8).reverse();
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
        { name: "complete", label: "Mark complete" },
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

function TrackerHealthBadge({ health }: { health: IntegrationHealth }) {
  const title = health.linear.enabled
    ? [
        `Linear tracker: ${health.tracker.message}`,
        `API key: ${health.linear.apiKeyConfigured ? "configured" : "missing"}`,
        `Team key: ${health.linear.teamKeyConfigured ? "configured" : "missing"}`,
        `Webhook secret: ${health.linear.webhookSecretConfigured ? "configured" : "missing"}`,
        `Review state: ${health.linear.reviewState}`,
        `Done state: ${health.linear.doneState}`,
        `Cancelled state: ${health.linear.cancelledState}`,
      ].join("\n")
    : health.tracker.message;

  return (
    <div className={`healthBadge ${health.tracker.status}`} title={title}>
      {health.tracker.status === "ok" ? (
        <CheckCircle2 size={15} />
      ) : (
        <AlertTriangle size={15} />
      )}
      <div>
        <strong>
          {health.linear.enabled ? "Linear" : health.tracker.kind}
        </strong>
        <span>{health.tracker.message}</span>
      </div>
    </div>
  );
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

function formatArtifactType(type: string): string {
  return type.replaceAll("_", " ");
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
  if (artifact.type !== "pr") {
    return undefined;
  }

  const remotePrUrl = readMetadataString(artifact.metadata, "remotePrUrl");
  if (remotePrUrl) {
    return {
      href: remotePrUrl,
      label: "Open PR",
      title: "Open remote pull request",
    };
  }

  return {
    href: `${apiUrl}/artifacts/${artifact.id}/content`,
    label: "Open draft",
    title: "Open local pull request draft",
  };
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

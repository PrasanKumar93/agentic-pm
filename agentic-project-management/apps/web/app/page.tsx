import {
  AlertTriangle,
  CirclePause,
  Database,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Square,
  XCircle
} from "lucide-react";
import { submitDispatchAction, submitWorkItemAction } from "./actions";

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

type WorkItemsResponse = {
  data: WorkItemSummary[];
  meta?: {
    limit: number;
    count: number;
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

type RunEventsResponse = {
  data: RunEventSummary[];
};

type DashboardData = {
  items: WorkItemSummary[];
  dispatch: DispatchControl;
  generatedAt?: string;
  error?: string;
};

type RunEventsData = {
  events: RunEventSummary[];
  error?: string;
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default async function DashboardPage() {
  const dashboard = await fetchDashboardData();
  const lanes = buildLanes(dashboard.items);
  const selected = selectRunDetailItem(dashboard.items);
  const runEvents = selected?.latestRun ? await fetchRunEvents(selected.latestRun.id) : { events: [] };
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
          <a className="active">Work</a>
          <a>Runs</a>
          <a>Artifacts</a>
          <a>Config</a>
          <a>Audit</a>
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Symphony-style orchestration</p>
            <h1>Agent runs</h1>
          </div>

          <div className="toolbar">
            <a className="iconButton" href="/" title="Refresh">
              <RefreshCw size={16} />
            </a>
            <form action={submitDispatchAction}>
              <button
                name="action"
                title={dashboard.dispatch.paused ? "Resume dispatch" : "Pause dispatch"}
                type="submit"
                value={dashboard.dispatch.paused ? "resume" : "pause"}
              >
                {dashboard.dispatch.paused ? <Play size={16} /> : <CirclePause size={16} />}
                {dashboard.dispatch.paused ? "Resume dispatch" : "Pause dispatch"}
              </button>
            </form>
            <form action={submitDispatchAction}>
              <button className="primary" name="action" title="Start eligible" type="submit" value="start_eligible">
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
              {dashboard.generatedAt ? ` · refreshed ${formatRelativeTime(dashboard.generatedAt)}` : ""}
              {dashboard.dispatch.paused ? " · dispatch paused" : ""}
            </span>
          </section>
        )}

        <section className="metrics">
          {lanes.map((lane) => (
            <div className="metric" key={lane.label}>
              <span>{lane.label}</span>
              <strong className={lane.tone}>{lane.value}</strong>
            </div>
          ))}
        </section>

        <section className="contentGrid">
          <div className="panel board">
            <div className="panelHeader">
              <div>
                <h2>Work board</h2>
                <p>Issues normalized into agent work items.</p>
              </div>
              <button disabled title="Retry failed">
                <RotateCcw size={16} />
              </button>
            </div>

            {dashboard.items.length > 0 ? (
              <div className="table">
                <div className="row tableHead">
                  <span>Issue</span>
                  <span>Title</span>
                  <span>Status</span>
                  <span>Owner</span>
                  <span>Updated</span>
                  <span>Actions</span>
                </div>
                {dashboard.items.map((row) => (
                  <div className="row" key={row.id}>
                    {row.issue.url ? (
                      <a href={row.issue.url} target="_blank" rel="noreferrer">
                        {row.issue.identifier}
                      </a>
                    ) : (
                      <strong>{row.issue.identifier}</strong>
                    )}
                    <span>{row.issue.title}</span>
                    <span className={`pill ${row.status}`}>{formatStatus(row.status)}</span>
                    <span>{row.claimedBy ?? row.latestRun?.agentRuntime ?? "unclaimed"}</span>
                    <span>{formatRelativeTime(row.updatedAt)}</span>
                    <form action={submitWorkItemAction} className="actionGroup">
                      <input name="workItemId" type="hidden" value={row.id} />
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
                ))}
              </div>
            ) : (
              <div className="emptyState">
                <Database size={18} />
                <strong>No work items yet</strong>
                <span>Run the worker with the fake tracker, or connect Linear and move an issue into an active state.</span>
              </div>
            )}
          </div>

          <aside className="panel runDetail">
            {selected ? (
              <>
                <div className="panelHeader compact">
                  <div>
                    <h2>Run detail</h2>
                    <p>
                      {selected.issue.identifier} · {selected.latestRun?.agentRuntime ?? "no run yet"}
                    </p>
                  </div>
                  <span className={selected.status === "running" ? "liveDot" : "quietDot"} />
                </div>

                <div className="statusStack">
                  <div>
                    <span>Workspace</span>
                    <strong>{selected.latestRun?.workspacePath ?? "Not prepared yet"}</strong>
                  </div>
                  <div>
                    <span>Run status</span>
                    <strong>{selected.latestRun ? formatStatus(selected.latestRun.status) : "No run yet"}</strong>
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
                    {selected.lastEvent?.message ?? "No events captured yet"}
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
                            <span>{formatRelativeTime(event.createdAt)}</span>
                          </div>
                          <p>{event.message}</p>
                          <span className={`eventLevel ${event.level}`}>{event.level}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="timelineNotice">No run events captured yet.</div>
                  )}
                </div>
              </>
            ) : (
              <div className="emptyState detailEmpty">
                <Database size={18} />
                <strong>No run selected</strong>
                <span>The latest run will appear here after the worker claims an issue.</span>
              </div>
            )}
          </aside>
        </section>
      </section>
    </main>
  );
}

async function fetchDashboardData(): Promise<DashboardData> {
  try {
    const [response, dispatch] = await Promise.all([
      fetch(`${apiUrl}/work-items?limit=50`, {
        cache: "no-store"
      }),
      fetchDispatchControl()
    ]);

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const payload = (await response.json()) as WorkItemsResponse;
    return {
      items: payload.data,
      dispatch,
      generatedAt: payload.meta?.generatedAt
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown API error";
    return {
      items: [],
      dispatch: createDefaultDispatchControl(),
      error: `API unavailable at ${apiUrl}: ${message}`
    };
  }
}

async function fetchDispatchControl(): Promise<DispatchControl> {
  try {
    const response = await fetch(`${apiUrl}/dispatch-control`, {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const payload = (await response.json()) as DispatchControlResponse;
    return payload.data;
  } catch {
    return createDefaultDispatchControl();
  }
}

async function fetchRunEvents(runId: string): Promise<RunEventsData> {
  try {
    const response = await fetch(`${apiUrl}/runs/${runId}/events`, {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const payload = (await response.json()) as RunEventsResponse;
    return {
      events: payload.data
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown API error";
    return {
      events: [],
      error: `Could not load run events: ${message}`
    };
  }
}

function createDefaultDispatchControl(): DispatchControl {
  const now = new Date().toISOString();
  return {
    projectId: "project_local",
    paused: false,
    createdAt: now,
    updatedAt: now
  };
}

function buildLanes(items: WorkItemSummary[]) {
  return [
    { label: "Queued", value: countStatus(items, "queued"), tone: "neutral" },
    { label: "Running", value: countStatus(items, "running"), tone: "blue" },
    { label: "Paused", value: countStatus(items, "paused"), tone: "neutral" },
    { label: "Review", value: countStatus(items, "waiting_for_review"), tone: "amber" },
    { label: "Blocked", value: countStatus(items, "blocked"), tone: "red" }
  ];
}

function countStatus(items: WorkItemSummary[], status: WorkItemStatus): number {
  return items.filter((item) => item.status === status).length;
}

function getRecentEvents(events: RunEventSummary[]): RunEventSummary[] {
  return events.slice(-8).reverse();
}

function selectRunDetailItem(items: WorkItemSummary[]): WorkItemSummary | undefined {
  return (
    items.find((item) => item.status === "running") ??
    items.find((item) => item.status === "waiting_for_review") ??
    items[0]
  );
}

function getAvailableActions(status: WorkItemStatus): Array<{
  name: "start" | "retry" | "pause" | "resume" | "cancel";
  label: string;
}> {
  switch (status) {
    case "queued":
      return [
        { name: "pause", label: "Pause" },
        { name: "cancel", label: "Cancel" }
      ];
    case "running":
      return [
        { name: "pause", label: "Pause" },
        { name: "cancel", label: "Cancel" }
      ];
    case "waiting_for_review":
      return [
        { name: "retry", label: "Retry" },
        { name: "cancel", label: "Cancel" }
      ];
    case "paused":
    case "blocked":
      return [
        { name: "resume", label: "Resume" },
        { name: "cancel", label: "Cancel" }
      ];
    case "failed":
      return [
        { name: "retry", label: "Retry" },
        { name: "cancel", label: "Cancel" }
      ];
    case "cancelled":
      return [
        { name: "start", label: "Start" },
        { name: "retry", label: "Retry" }
      ];
    case "completed":
      return [];
  }
}

function ActionIcon({
  action
}: {
  action: "start" | "retry" | "pause" | "resume" | "cancel";
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
  }
}

function formatStatus(status: string): string {
  return status.replaceAll("_", " ");
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

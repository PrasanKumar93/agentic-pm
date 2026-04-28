import { CirclePause, Play, RefreshCw, RotateCcw, ShieldCheck, Square } from "lucide-react";

type WorkItemRow = {
  id: string;
  issue: string;
  title: string;
  status: "queued" | "running" | "waiting_for_review" | "blocked";
  owner: string;
  updated: string;
};

const rows: WorkItemRow[] = [
  {
    id: "work_1",
    issue: "ENG-1",
    title: "Wire the first local agent run",
    status: "running",
    owner: "worker_local",
    updated: "just now"
  },
  {
    id: "work_2",
    issue: "ENG-2",
    title: "Create Linear webhook verifier",
    status: "queued",
    owner: "unclaimed",
    updated: "4m ago"
  },
  {
    id: "work_3",
    issue: "ENG-3",
    title: "Review packet artifact model",
    status: "waiting_for_review",
    owner: "worker_local",
    updated: "18m ago"
  }
];

const lanes = [
  { label: "Queued", value: 12, tone: "neutral" },
  { label: "Running", value: 3, tone: "blue" },
  { label: "Review", value: 5, tone: "amber" },
  { label: "Blocked", value: 1, tone: "red" }
];

export default function DashboardPage() {
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
            <button title="Refresh">
              <RefreshCw size={16} />
            </button>
            <button title="Pause dispatch">
              <CirclePause size={16} />
            </button>
            <button className="primary">
              <Play size={16} />
              Start eligible
            </button>
          </div>
        </header>

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
                <p>Linear issues normalized into agent work items.</p>
              </div>
              <button title="Retry failed">
                <RotateCcw size={16} />
              </button>
            </div>

            <div className="table">
              <div className="row tableHead">
                <span>Issue</span>
                <span>Title</span>
                <span>Status</span>
                <span>Owner</span>
                <span>Updated</span>
              </div>
              {rows.map((row) => (
                <div className="row" key={row.id}>
                  <strong>{row.issue}</strong>
                  <span>{row.title}</span>
                  <span className={`pill ${row.status}`}>{row.status.replaceAll("_", " ")}</span>
                  <span>{row.owner}</span>
                  <span>{row.updated}</span>
                </div>
              ))}
            </div>
          </div>

          <aside className="panel runDetail">
            <div className="panelHeader compact">
              <div>
                <h2>Run detail</h2>
                <p>ENG-1 · fake-agent</p>
              </div>
              <span className="liveDot" />
            </div>

            <div className="statusStack">
              <div>
                <span>Workspace</span>
                <strong>workspaces/local/eng-1-wire-first-local-agent-run</strong>
              </div>
              <div>
                <span>Runtime</span>
                <strong>fake-agent</strong>
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
              <p><Square size={10} /> worker.started</p>
              <p><Square size={10} /> tracker.issue.reconciled</p>
              <p><Square size={10} /> run.started</p>
              <p><Square size={10} /> agent.session.started</p>
            </div>
          </aside>
        </section>
      </section>
    </main>
  );
}

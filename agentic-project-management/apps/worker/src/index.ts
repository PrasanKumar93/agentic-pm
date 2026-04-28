import "dotenv/config";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CodexCliRuntime, FakeAgentRuntime, type AgentRuntime } from "@agentic-pm/agents";
import { expandEnvReference, loadWorkflowDocument, renderWorkflowPrompt } from "@agentic-pm/config";
import { createId, type Issue } from "@agentic-pm/core";
import { AgenticRepository, connectMongo, ensureIndexes, getCollections, readMongoConfig } from "@agentic-pm/db";
import { ConsoleEventSink } from "@agentic-pm/observability";
import { FakeTrackerAdapter, LinearTrackerAdapter, type TrackerAdapter } from "@agentic-pm/trackers";
import { WorkspaceManager } from "@agentic-pm/workspaces";

const workerId = process.env.AGENTIC_PM_WORKER_ID ?? createId("worker");
const projectId = process.env.AGENTIC_PM_PROJECT_ID ?? "project_local";
const projectSlug = process.env.AGENTIC_PM_PROJECT_SLUG ?? "local";
const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const workflowRoot = resolve(process.env.AGENTIC_PM_WORKFLOW_ROOT ?? `${repoRoot}/examples/workflow`);
const eventSink = new ConsoleEventSink();
const runOnce = process.env.AGENTIC_PM_RUN_ONCE === "true";

process.env.AGENTIC_PM_WORKSPACE_ROOT ??= resolve(repoRoot, "workspaces");

const workflow = await loadWorkflowDocument(workflowRoot);
const mongo = await connectMongo(readMongoConfig());
await ensureIndexes(getCollections(mongo.db));

const repository = new AgenticRepository(mongo.db);
const tracker = createTracker();
const runtime = createRuntime();
const workspaceRoot = expandEnvReference(workflow.config.workspace.root);
const workspaces = new WorkspaceManager({
  root: workspaceRoot,
  eventSink
});

await eventSink.emit({
  type: "worker.started",
  level: "info",
  message: "Agentic worker started",
  payload: {
    workerId,
    projectId,
    projectSlug,
    tracker: tracker.kind,
    runtime: runtime.name
  }
});

let stopping = false;
process.on("SIGINT", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
});

while (!stopping) {
  await reconcileTracker();
  await dispatchOne();
  if (runOnce) {
    break;
  }
  await sleep(workflow.config.polling.interval_ms);
}

await mongo.client.close();

async function reconcileTracker(): Promise<void> {
  const issues = await tracker.listActiveIssues({
    activeStates: workflow.config.tracker.active_states,
    teamKey: workflow.config.tracker.team_key ?? process.env.LINEAR_TEAM_KEY,
    projectSlug: workflow.config.tracker.project_slug
  });

  for (const issue of issues) {
    const storedIssue = await repository.upsertIssue(issue);
    await repository.ensureWorkItemForIssue(projectId, storedIssue);
    await repository.appendEvent({
      projectId,
      type: "tracker.issue.reconciled",
      level: "info",
      message: `Reconciled ${storedIssue.identifier}`,
      payload: {
        issueId: storedIssue.id,
        state: storedIssue.state
      }
    });
  }
}

async function dispatchOne(): Promise<void> {
  const workItem = await repository.claimNextQueuedWorkItem(projectId, workerId);
  if (!workItem) {
    return;
  }

  const issue = await repository.getIssue(workItem.issueId);
  if (!issue) {
    await repository.markWorkItemStatus(workItem.id, "failed");
    return;
  }

  await tracker.moveIssue({
    issueExternalId: issue.externalId,
    stateName: workflow.config.tracker.running_state
  });

  const workspacePath = await workspaces.prepareIssueWorkspace({
    projectSlug,
    issue,
    hooks: process.env.AGENTIC_PM_ENABLE_HOOKS === "true" ? workflow.config.hooks : {}
  });

  const run = await repository.createRun({
    workItem,
    workspacePath,
    agentRuntime: runtime.name
  });

  await repository.setRunStatus(run.id, "running");
  await repository.appendEvent({
    projectId,
    workItemId: workItem.id,
    runId: run.id,
    type: "run.started",
    level: "info",
    message: `Started run for ${issue.identifier}`,
    payload: {
      workspacePath
    }
  });

  try {
    const prompt = await renderWorkflowPrompt(workflow, {
      issue,
      repository: {
        name: projectSlug
      },
      run
    });

    const session = await runtime.start({
      workspacePath,
      prompt
    });

    let failed = false;
    for await (const agentEvent of runtime.run(session, prompt)) {
      await repository.heartbeatRun(run.id);
      await repository.appendEvent({
        projectId,
        workItemId: workItem.id,
        runId: run.id,
        type: `agent.${agentEvent.type}`,
        level: agentEvent.type === "stderr" || agentEvent.type === "session.failed" ? "error" : "info",
        message: agentEvent.message,
        payload: agentEvent.payload
      });

      if (agentEvent.type === "session.failed") {
        failed = true;
      }
    }

    if (failed) {
      await repository.setRunStatus(run.id, "failed", "agent failed");
      await repository.markWorkItemStatus(workItem.id, "failed");
      return;
    }

    await repository.setRunStatus(run.id, "waiting_for_review");
    await repository.markWorkItemStatus(workItem.id, "waiting_for_review");
    await tracker.moveIssue({
      issueExternalId: issue.externalId,
      stateName: workflow.config.tracker.review_state
    });
    await tracker.commentOnIssue({
      issueExternalId: issue.externalId,
      body: `Agent run ${run.id} finished and is ready for human review.`
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await repository.setRunStatus(run.id, "failed", message);
    await repository.markWorkItemStatus(workItem.id, "failed");
    await repository.appendEvent({
      projectId,
      workItemId: workItem.id,
      runId: run.id,
      type: "run.failed",
      level: "error",
      message
    });
  }
}

function createTracker(): TrackerAdapter {
  const requestedTracker = process.env.AGENTIC_PM_TRACKER ?? workflow.config.tracker.kind;

  if (requestedTracker === "linear") {
    const apiKey = process.env.LINEAR_API_KEY;
    if (apiKey) {
      return new LinearTrackerAdapter({ apiKey });
    }
  }

  const now = new Date();
  const fakeIssue: Issue = {
    id: createId("issue"),
    tracker: "fake",
    externalId: "fake-1",
    identifier: "ENG-1",
    title: "Wire the first local agent run",
    description: "A safe fake issue for verifying the orchestrator loop before connecting Linear.",
    state: workflow.config.tracker.active_states[0] ?? "Ready for Agent",
    labels: ["agent"],
    blockedBy: [],
    repoRefs: [],
    createdAt: now,
    updatedAt: now
  };

  return new FakeTrackerAdapter([fakeIssue]);
}

function createRuntime(): AgentRuntime {
  if (process.env.AGENT_RUNTIME === "codex") {
    return new CodexCliRuntime({
      command: workflow.config.codex.command,
      args: workflow.config.codex.args,
      turnTimeoutMs: workflow.config.codex.turn_timeout_ms
    });
  }

  return new FakeAgentRuntime();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

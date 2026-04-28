import "dotenv/config";
import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  CodexCliRuntime,
  FakeAgentRuntime,
  GenericCliRuntime,
  type AgentRuntime,
  type AgentSession
} from "@agentic-pm/agents";
import { expandEnvReference, loadWorkflowDocument, renderWorkflowPrompt } from "@agentic-pm/config";
import { createId, type Artifact, type ArtifactType, type EventLevel, type Issue, type Run } from "@agentic-pm/core";
import {
  AgenticRepository,
  connectMongo,
  ensureIndexes,
  getCollections,
  readMongoConfig,
  type RunStopRequest
} from "@agentic-pm/db";
import { ConsoleEventSink } from "@agentic-pm/observability";
import { FakeTrackerAdapter, LinearTrackerAdapter, type TrackerAdapter } from "@agentic-pm/trackers";
import { WorkspaceManager } from "@agentic-pm/workspaces";

const workerId = process.env.AGENTIC_PM_WORKER_ID ?? createId("worker");
const projectId = process.env.AGENTIC_PM_PROJECT_ID ?? "project_local";
const projectSlug = process.env.AGENTIC_PM_PROJECT_SLUG ?? "local";
const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const workflowRoot = resolve(process.env.AGENTIC_PM_WORKFLOW_ROOT ?? `${repoRoot}/examples/workflow`);
const artifactRoot = resolve(process.env.AGENTIC_PM_ARTIFACT_ROOT ?? `${repoRoot}/artifacts`);
const eventSink = new ConsoleEventSink();
const runOnce = process.env.AGENTIC_PM_RUN_ONCE === "true";
const execFileAsync = promisify(execFile);

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

interface CapturedAgentEvent {
  type: string;
  level: EventLevel;
  message: string;
  payload?: Record<string, unknown>;
  createdAt: Date;
}

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
  if (await repository.isDispatchPaused(projectId)) {
    return;
  }

  const workItem = await repository.claimNextQueuedWorkItem(projectId, workerId);
  if (!workItem) {
    return;
  }

  const issue = await repository.getIssue(workItem.issueId);
  if (!issue) {
    await repository.markWorkItemStatus(workItem.id, "failed");
    return;
  }

  let run: Run | undefined;
  const capturedAgentEvents: CapturedAgentEvent[] = [];

  try {
    await tracker.moveIssue({
      issueExternalId: issue.externalId,
      stateName: workflow.config.tracker.running_state
    });

    const workspacePath = await workspaces.prepareIssueWorkspace({
      projectSlug,
      issue,
      hooks: process.env.AGENTIC_PM_ENABLE_HOOKS === "true" ? workflow.config.hooks : {}
    });

    run = await repository.createRun({
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

    const stopBeforeEvents = await repository.getRunStopRequest({
      runId: run.id,
      workItemId: workItem.id
    });
    if (stopBeforeEvents.shouldStop) {
      await stopRun({ run, workItem, session, stopRequest: stopBeforeEvents });
      return;
    }

    let failed = false;
    for await (const agentEvent of runtime.run(session, prompt)) {
      await repository.heartbeatRun(run.id);

      if (agentEvent.type !== "heartbeat") {
        const level: EventLevel =
          agentEvent.type === "stderr" || agentEvent.type === "session.failed" ? "error" : "info";
        capturedAgentEvents.push({
          type: agentEvent.type,
          level,
          message: agentEvent.message,
          payload: agentEvent.payload,
          createdAt: new Date()
        });

        await repository.appendEvent({
          projectId,
          workItemId: workItem.id,
          runId: run.id,
          type: `agent.${agentEvent.type}`,
          level,
          message: agentEvent.message,
          payload: agentEvent.payload
        });
      }

      if (agentEvent.type === "session.failed") {
        failed = true;
      }

      const stopRequest = await repository.getRunStopRequest({
        runId: run.id,
        workItemId: workItem.id
      });
      if (stopRequest.shouldStop) {
        await stopRun({ run, workItem, session, stopRequest });
        return;
      }
    }

    const stopBeforeFinalize = await repository.getRunStopRequest({
      runId: run.id,
      workItemId: workItem.id
    });
    if (stopBeforeFinalize.shouldStop) {
      await stopRun({ run, workItem, session, stopRequest: stopBeforeFinalize });
      return;
    }

    if (failed) {
      await captureRunLogArtifact({ run, workItem, issue, capturedAgentEvents });
      await repository.setRunStatus(run.id, "failed", "agent failed");
      await repository.markWorkItemStatus(workItem.id, "failed");
      return;
    }

    const artifacts = await captureReviewArtifacts({ run, workItem, issue, capturedAgentEvents });
    await repository.setRunStatus(run.id, "waiting_for_review");
    await repository.markWorkItemStatus(workItem.id, "waiting_for_review");
    await tracker.moveIssue({
      issueExternalId: issue.externalId,
      stateName: workflow.config.tracker.review_state
    });
    await tracker.commentOnIssue({
      issueExternalId: issue.externalId,
      body: buildReviewComment(run, artifacts)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await repository.markWorkItemStatus(workItem.id, "failed");

    if (run) {
      await captureRunLogArtifact({ run, workItem, issue, capturedAgentEvents });
      await repository.setRunStatus(run.id, "failed", message);
      await repository.appendEvent({
        projectId,
        workItemId: workItem.id,
        runId: run.id,
        type: "run.failed",
        level: "error",
        message
      });
      return;
    }

    await repository.appendEvent({
      projectId,
      workItemId: workItem.id,
      type: "run.setup_failed",
      level: "error",
      message
    });
  }
}

async function stopRun(input: {
  run: { id: string };
  workItem: { id: string; projectId: string };
  session: AgentSession;
  stopRequest: RunStopRequest;
}): Promise<void> {
  const reason = input.stopRequest.reason ?? "run stop requested";
  await runtime.cancel(input.session, reason);
  await repository.setRunStatus(input.run.id, "cancelled", reason);

  if (input.stopRequest.workItemStatus !== "paused") {
    await repository.markWorkItemStatus(input.workItem.id, "cancelled");
  }

  await repository.appendEvent({
    projectId: input.workItem.projectId,
    workItemId: input.workItem.id,
    runId: input.run.id,
    type: "run.cancelled",
    level: "warn",
    message: reason,
    payload: {
      runStatus: input.stopRequest.runStatus,
      workItemStatus: input.stopRequest.workItemStatus
    }
  });
}

async function captureReviewArtifacts(input: {
  run: Run;
  workItem: { id: string; projectId: string };
  issue: Issue;
  capturedAgentEvents: CapturedAgentEvent[];
}): Promise<Artifact[]> {
  const artifacts: Artifact[] = [];
  const logArtifact = await captureRunLogArtifact(input);
  if (logArtifact) {
    artifacts.push(logArtifact);
  }

  const patchArtifact = await capturePatchArtifact(input);
  if (patchArtifact) {
    artifacts.push(patchArtifact);
  }

  const reviewPacket = await registerTextArtifact({
    run: input.run,
    workItem: input.workItem,
    type: "review_packet",
    fileName: "review-packet.md",
    summary: `Review packet for ${input.issue.identifier}`,
    content: buildReviewPacket(input.issue, input.run, artifacts),
    metadata: {
      issueId: input.issue.id,
      issueIdentifier: input.issue.identifier,
      artifactCount: artifacts.length
    }
  });

  if (reviewPacket) {
    artifacts.push(reviewPacket);
  }

  return artifacts;
}

async function captureRunLogArtifact(input: {
  run: Run;
  workItem: { id: string; projectId: string };
  issue: Issue;
  capturedAgentEvents: CapturedAgentEvent[];
}): Promise<Artifact | undefined> {
  return registerTextArtifact({
    run: input.run,
    workItem: input.workItem,
    type: "log",
    fileName: "agent-events.log",
    summary: `Agent event log for ${input.issue.identifier}`,
    content: buildRunLog(input.issue, input.run, input.capturedAgentEvents),
    metadata: {
      eventCount: input.capturedAgentEvents.length,
      issueId: input.issue.id,
      issueIdentifier: input.issue.identifier
    }
  });
}

async function capturePatchArtifact(input: {
  run: Run;
  workItem: { id: string; projectId: string };
  issue: Issue;
}): Promise<Artifact | undefined> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--show-toplevel"], {
      cwd: input.run.workspacePath
    });
    if (resolve(stdout.trim()) !== resolve(input.run.workspacePath)) {
      return undefined;
    }
  } catch {
    return undefined;
  }

  try {
    const { stdout } = await execFileAsync("git", ["diff", "--patch", "--binary"], {
      cwd: input.run.workspacePath,
      maxBuffer: 20 * 1024 * 1024
    });

    if (!stdout.trim()) {
      return undefined;
    }

    return registerTextArtifact({
      run: input.run,
      workItem: input.workItem,
      type: "patch",
      fileName: "workspace.patch",
      summary: `Workspace patch for ${input.issue.identifier}`,
      content: stdout,
      metadata: {
        issueId: input.issue.id,
        issueIdentifier: input.issue.identifier
      }
    });
  } catch (error) {
    await recordArtifactWarning(input.run, input.workItem, "Patch artifact capture skipped", error);
    return undefined;
  }
}

async function registerTextArtifact(input: {
  run: Run;
  workItem: { id: string; projectId: string };
  type: ArtifactType;
  fileName: string;
  summary: string;
  content: string;
  metadata?: Record<string, unknown>;
}): Promise<Artifact | undefined> {
  try {
    const dir = join(artifactRoot, projectSlug, input.run.id);
    const uri = join(dir, input.fileName);
    await mkdir(dir, { recursive: true });
    await writeFile(uri, input.content, "utf8");

    const artifact = await repository.registerArtifact({
      id: createId("art"),
      runId: input.run.id,
      type: input.type,
      uri,
      summary: input.summary,
      metadata: {
        ...input.metadata,
        byteLength: Buffer.byteLength(input.content, "utf8"),
        local: true
      },
      createdAt: new Date()
    });

    await repository.appendEvent({
      projectId: input.workItem.projectId,
      workItemId: input.workItem.id,
      runId: input.run.id,
      type: "artifact.created",
      level: "info",
      message: `Captured ${input.type} artifact`,
      payload: {
        artifactId: artifact.id,
        type: artifact.type,
        uri: artifact.uri
      }
    });

    return artifact;
  } catch (error) {
    await recordArtifactWarning(input.run, input.workItem, `Could not capture ${input.type} artifact`, error);
    return undefined;
  }
}

async function recordArtifactWarning(
  run: Run,
  workItem: { id: string; projectId: string },
  message: string,
  error: unknown
): Promise<void> {
  const detail = error instanceof Error ? error.message : String(error);
  await repository.appendEvent({
    projectId: workItem.projectId,
    workItemId: workItem.id,
    runId: run.id,
    type: "artifact.capture_failed",
    level: "warn",
    message,
    payload: {
      detail
    }
  });
}

function buildRunLog(issue: Issue, run: Run, events: CapturedAgentEvent[]): string {
  const lines = [
    `Run: ${run.id}`,
    `Issue: ${issue.identifier} ${issue.title}`,
    `Runtime: ${run.agentRuntime}`,
    `Workspace: ${run.workspacePath}`,
    `Captured events: ${events.length}`,
    "",
    "## Events",
    ""
  ];

  for (const event of events) {
    lines.push(`[${event.createdAt.toISOString()}] ${event.level} ${event.type}`);
    lines.push(event.message.trim() || "(empty message)");
    if (event.payload) {
      lines.push(JSON.stringify(event.payload));
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function buildReviewPacket(issue: Issue, run: Run, artifacts: Artifact[]): string {
  const artifactLines = artifacts.length
    ? artifacts.map((artifact) => `- ${artifact.type}: ${artifact.summary ?? artifact.uri}`).join("\n")
    : "- No supporting artifacts were captured.";

  return `# Review Packet

Issue: ${issue.identifier} ${issue.title}
Run: ${run.id}
Runtime: ${run.agentRuntime}
Workspace: ${run.workspacePath}

## Summary

The agent run completed and is ready for human review.

## Tests

- Not reported by the runtime yet.

## Risks

- Review the generated workspace changes before merge.

## Artifacts

${artifactLines}

## Follow-ups

- Add runtime-specific parsing for structured test results and final summaries.
`;
}

function buildReviewComment(run: Run, artifacts: Artifact[]): string {
  const reviewPacket = artifacts.find((artifact) => artifact.type === "review_packet");
  const suffix = reviewPacket ? ` Review packet artifact: ${reviewPacket.id}.` : "";
  return `Agent run ${run.id} finished and is ready for human review.${suffix}`;
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
  const requestedRuntime = process.env.AGENT_RUNTIME ?? "fake";
  const turnTimeoutMs = readPositiveNumber(
    process.env.AGENT_RUNTIME_TURN_TIMEOUT_MS ?? process.env.CODEX_TURN_TIMEOUT_MS,
    workflow.config.codex.turn_timeout_ms
  );
  const stallTimeoutMs = readPositiveNumber(
    process.env.AGENT_RUNTIME_STALL_TIMEOUT_MS ?? process.env.CODEX_STALL_TIMEOUT_MS,
    workflow.config.codex.stall_timeout_ms
  );
  const cancelGraceMs = readPositiveNumber(process.env.AGENT_RUNTIME_CANCEL_GRACE_MS, 5000);

  if (requestedRuntime === "codex") {
    return new CodexCliRuntime({
      command: process.env.CODEX_COMMAND ?? workflow.config.codex.command,
      args: parseCommandArgs(process.env.CODEX_ARGS, workflow.config.codex.args),
      turnTimeoutMs,
      stallTimeoutMs,
      cancelGraceMs
    });
  }

  if (requestedRuntime === "generic") {
    const command = process.env.AGENT_RUNTIME_COMMAND;
    if (!command) {
      throw new Error("AGENT_RUNTIME_COMMAND is required when AGENT_RUNTIME=generic");
    }

    return new GenericCliRuntime({
      name: process.env.AGENT_RUNTIME_NAME,
      command,
      args: parseCommandArgs(process.env.AGENT_RUNTIME_ARGS, []),
      turnTimeoutMs,
      stallTimeoutMs,
      cancelGraceMs
    });
  }

  return new FakeAgentRuntime();
}

function parseCommandArgs(value: string | undefined, fallback: string[]): string[] {
  if (!value) {
    return fallback;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }

  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
      throw new Error("Runtime args JSON must be an array of strings");
    }
    return parsed;
  }

  return trimmed.split(/\s+/).filter(Boolean);
}

function readPositiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

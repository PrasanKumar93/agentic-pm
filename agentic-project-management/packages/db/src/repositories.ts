import type { Db } from "mongodb";
import { createId, nextRetryAt, type Artifact, type Issue, type Run, type RunEvent, type WorkItem } from "@agentic-pm/core";
import { getCollections, type AgenticCollections } from "./collections.js";

export class AgenticRepository {
  readonly collections: AgenticCollections;

  constructor(db: Db) {
    this.collections = getCollections(db);
  }

  async upsertIssue(issue: Issue): Promise<Issue> {
    const now = new Date();
    const nextIssue = {
      ...issue,
      updatedAt: now,
      createdAt: issue.createdAt ?? now
    };
    const { id, createdAt, ...mutableIssue } = nextIssue;

    await this.collections.issues.updateOne(
      { tracker: issue.tracker, externalId: issue.externalId },
      { $set: mutableIssue, $setOnInsert: { id, createdAt } },
      { upsert: true }
    );

    const stored = await this.collections.issues.findOne({
      tracker: issue.tracker,
      externalId: issue.externalId
    });

    if (!stored) {
      throw new Error(`Issue ${issue.identifier} was not found after upsert`);
    }

    return stored;
  }

  async ensureWorkItemForIssue(projectId: string, issue: Issue): Promise<WorkItem> {
    const now = new Date();
    const workItem: WorkItem = {
      id: createId("work"),
      issueId: issue.id,
      projectId,
      status: "queued",
      retryCount: 0,
      createdAt: now,
      updatedAt: now
    };
    const { projectId: _projectId, updatedAt: _updatedAt, ...insertWorkItem } = workItem;

    await this.collections.workItems.updateOne(
      { issueId: issue.id },
      {
        $setOnInsert: insertWorkItem,
        $set: {
          projectId,
          updatedAt: now
        }
      },
      { upsert: true }
    );

    const stored = await this.collections.workItems.findOne({ issueId: issue.id });
    if (!stored) {
      throw new Error(`Work item for issue ${issue.identifier} was not found after upsert`);
    }

    return stored;
  }

  async getIssue(issueId: string): Promise<Issue | null> {
    return this.collections.issues.findOne({ id: issueId });
  }

  async listWorkItems(limit = 50): Promise<WorkItem[]> {
    return this.collections.workItems
      .find({})
      .sort({ updatedAt: -1 })
      .limit(limit)
      .toArray();
  }

  async claimNextQueuedWorkItem(projectId: string, workerId: string, now = new Date()): Promise<WorkItem | null> {
    const claimed = await this.collections.workItems.findOneAndUpdate(
      {
        projectId,
        status: "queued",
        $or: [{ nextAttemptAt: { $exists: false } }, { nextAttemptAt: { $lte: now } }]
      },
      {
        $set: {
          status: "running",
          claimedBy: workerId,
          updatedAt: now
        }
      },
      {
        sort: { retryCount: 1, updatedAt: 1 },
        returnDocument: "after"
      }
    );

    return claimed;
  }

  async createRun(input: {
    workItem: WorkItem;
    workspacePath: string;
    agentRuntime: string;
  }): Promise<Run> {
    const now = new Date();
    const run: Run = {
      id: createId("run"),
      workItemId: input.workItem.id,
      attempt: input.workItem.retryCount + 1,
      workspacePath: input.workspacePath,
      agentRuntime: input.agentRuntime,
      status: "preparing",
      startedAt: now,
      createdAt: now,
      updatedAt: now
    };

    await this.collections.runs.insertOne(run);
    await this.collections.workItems.updateOne(
      { id: input.workItem.id },
      {
        $set: {
          lastRunId: run.id,
          updatedAt: now
        }
      }
    );

    return run;
  }

  async setRunStatus(runId: string, status: Run["status"], exitReason?: string): Promise<void> {
    const now = new Date();
    await this.collections.runs.updateOne(
      { id: runId },
      {
        $set: {
          status,
          exitReason,
          updatedAt: now,
          ...(status === "completed" || status === "failed" || status === "cancelled" || status === "waiting_for_review"
            ? { endedAt: now }
            : {})
        }
      }
    );
  }

  async heartbeatRun(runId: string): Promise<void> {
    const now = new Date();
    await this.collections.runs.updateOne(
      { id: runId },
      {
        $set: {
          lastHeartbeatAt: now,
          updatedAt: now
        }
      }
    );
  }

  async scheduleRetry(workItemId: string, retryCount: number, maxBackoffMs: number): Promise<void> {
    const now = new Date();
    await this.collections.workItems.updateOne(
      { id: workItemId },
      {
        $set: {
          status: "queued",
          retryCount,
          nextAttemptAt: nextRetryAt(retryCount, maxBackoffMs, now),
          updatedAt: now
        },
        $unset: {
          claimedBy: ""
        }
      }
    );
  }

  async markWorkItemStatus(workItemId: string, status: WorkItem["status"]): Promise<void> {
    await this.collections.workItems.updateOne(
      { id: workItemId },
      {
        $set: {
          status,
          updatedAt: new Date()
        },
        $unset: {
          claimedBy: ""
        }
      }
    );
  }

  async appendEvent(event: Omit<RunEvent, "id" | "createdAt"> & { id?: string; createdAt?: Date }): Promise<RunEvent> {
    const stored: RunEvent = {
      ...event,
      id: event.id ?? createId("evt"),
      createdAt: event.createdAt ?? new Date()
    };

    await this.collections.runEvents.insertOne(stored);
    return stored;
  }

  async listRunEvents(runId: string, limit = 500): Promise<RunEvent[]> {
    return this.collections.runEvents
      .find({ runId })
      .sort({ createdAt: 1 })
      .limit(limit)
      .toArray();
  }

  async registerArtifact(artifact: Artifact): Promise<Artifact> {
    await this.collections.artifacts.insertOne(artifact);
    return artifact;
  }

  async listArtifacts(runId: string): Promise<Artifact[]> {
    return this.collections.artifacts.find({ runId }).sort({ createdAt: 1 }).toArray();
  }
}

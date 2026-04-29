import type { Db, UpdateFilter, WithId } from "mongodb";
import {
  createId,
  nextRetryAt,
  type Artifact,
  type DispatchActionName,
  type DispatchActionResult,
  type DispatchControl,
  type Issue,
  type OperatorActionName,
  type OperatorActionResult,
  type Run,
  type RunEvent,
  type WorkItem,
  type WorkItemStatus,
  type WorkItemSummary
} from "@agentic-pm/core";
import { getCollections, type AgenticCollections } from "./collections.js";

const activeRunStatuses: Run["status"][] = ["preparing", "running", "stalled", "retrying"];
const startEligibleStatuses: WorkItemStatus[] = ["paused", "blocked", "failed", "cancelled"];

export class WorkItemNotFoundError extends Error {
  constructor(workItemId: string) {
    super(`Work item not found: ${workItemId}`);
    this.name = "WorkItemNotFoundError";
  }
}

export class InvalidWorkItemActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidWorkItemActionError";
  }
}

export interface RunStopRequest {
  shouldStop: boolean;
  reason?: string;
  runStatus?: Run["status"];
  workItemStatus?: WorkItemStatus;
}

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
    const { updatedAt: _updatedAt, ...insertWorkItem } = workItem;

    await this.collections.workItems.updateOne(
      { projectId, issueId: issue.id },
      {
        $setOnInsert: insertWorkItem,
        $set: {
          updatedAt: now
        }
      },
      { upsert: true }
    );

    const stored = await this.collections.workItems.findOne({ projectId, issueId: issue.id });
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

  async listWorkItemSummaries(limit = 50): Promise<WorkItemSummary[]> {
    const workItems = await this.listWorkItems(limit);
    return Promise.all(workItems.map((workItem) => this.toWorkItemSummary(workItem)));
  }

  async getWorkItemSummary(workItemId: string): Promise<WorkItemSummary | null> {
    const workItem = await this.collections.workItems.findOne({ id: workItemId });
    return workItem ? this.toWorkItemSummary(workItem) : null;
  }

  async getDispatchControl(projectId: string): Promise<DispatchControl> {
    const existing = await this.collections.dispatchControls.findOne({ projectId });
    if (existing) {
      return this.toDispatchControl(existing);
    }

    const now = new Date();
    return {
      projectId,
      paused: false,
      createdAt: now,
      updatedAt: now
    };
  }

  async isDispatchPaused(projectId: string): Promise<boolean> {
    const control = await this.collections.dispatchControls.findOne({ projectId });
    return control?.paused ?? false;
  }

  async getRunStopRequest(input: { runId: string; workItemId: string }): Promise<RunStopRequest> {
    const [run, workItem] = await Promise.all([
      this.collections.runs.findOne({ id: input.runId }),
      this.collections.workItems.findOne({ id: input.workItemId })
    ]);

    if (!workItem) {
      return {
        shouldStop: true,
        reason: `work item ${input.workItemId} is no longer available`,
        runStatus: run?.status
      };
    }

    if (run?.status === "cancelled") {
      return {
        shouldStop: true,
        reason: run.exitReason ?? "run was cancelled",
        runStatus: run.status,
        workItemStatus: workItem.status
      };
    }

    if (workItem.status === "cancelled") {
      return {
        shouldStop: true,
        reason: "work item was cancelled",
        runStatus: run?.status,
        workItemStatus: workItem.status
      };
    }

    if (workItem.status === "paused") {
      return {
        shouldStop: true,
        reason: "work item was paused",
        runStatus: run?.status,
        workItemStatus: workItem.status
      };
    }

    return {
      shouldStop: false,
      runStatus: run?.status,
      workItemStatus: workItem.status
    };
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

  async performWorkItemAction(input: {
    workItemId: string;
    action: OperatorActionName;
    actorId?: string;
    reason?: string;
  }): Promise<OperatorActionResult> {
    const workItem = await this.collections.workItems.findOne({ id: input.workItemId });
    if (!workItem) {
      throw new WorkItemNotFoundError(input.workItemId);
    }

    const actorId = input.actorId || "local-operator";
    const fromStatus = workItem.status;
    const transition = this.resolveActionTransition(workItem, input.action);
    const now = new Date();

    const update = this.buildActionUpdate({
      workItem,
      action: input.action,
      toStatus: transition.toStatus,
      now
    });

    await this.collections.workItems.updateOne({ id: workItem.id }, update);

    if (input.action === "cancel" && workItem.lastRunId) {
      await this.collections.runs.updateOne(
        {
          id: workItem.lastRunId,
          status: { $in: activeRunStatuses }
        },
        {
          $set: {
            status: "cancelled",
            exitReason: `cancelled by ${actorId}`,
            endedAt: now,
            updatedAt: now
          }
        }
      );
    }

    if (input.action === "complete" && workItem.lastRunId) {
      await this.collections.runs.updateOne(
        {
          id: workItem.lastRunId,
          status: "waiting_for_review"
        },
        {
          $set: {
            status: "completed",
            exitReason: `completed by ${actorId} after manual review`,
            endedAt: now,
            updatedAt: now
          }
        }
      );
    }

    await this.collections.operatorActions.insertOne({
      id: createId("act"),
      projectId: workItem.projectId,
      workItemId: workItem.id,
      runId: workItem.lastRunId,
      actorId,
      action: input.action,
      payload: {
        reason: input.reason,
        fromStatus,
        toStatus: transition.toStatus
      },
      createdAt: now
    });

    await this.appendEvent({
      projectId: workItem.projectId,
      workItemId: workItem.id,
      runId: workItem.lastRunId,
      type: `operator.${input.action}`,
      level: "info",
      message: `${actorId} requested ${input.action}`,
      payload: {
        actorId,
        reason: input.reason,
        fromStatus,
        toStatus: transition.toStatus
      },
      createdAt: now
    });

    const updated = await this.collections.workItems.findOne({ id: workItem.id });
    if (!updated) {
      throw new WorkItemNotFoundError(workItem.id);
    }

    return {
      action: input.action,
      workItem: updated,
      fromStatus,
      toStatus: updated.status,
      message: transition.message
    };
  }

  async performDispatchAction(input: {
    projectId: string;
    action: DispatchActionName;
    actorId?: string;
    reason?: string;
  }): Promise<DispatchActionResult> {
    const actorId = input.actorId || "local-operator";
    const now = new Date();

    if (input.action === "start_eligible") {
      const result = await this.collections.workItems.updateMany(
        {
          projectId: input.projectId,
          status: { $in: startEligibleStatuses }
        },
        {
          $set: {
            status: "queued",
            updatedAt: now
          },
          $unset: {
            claimedBy: "",
            nextAttemptAt: ""
          }
        }
      );

      await this.recordDispatchAction({
        projectId: input.projectId,
        actorId,
        action: input.action,
        reason: input.reason,
        affectedWorkItemCount: result.modifiedCount,
        createdAt: now
      });

      return {
        action: input.action,
        dispatch: await this.getDispatchControl(input.projectId),
        affectedWorkItemCount: result.modifiedCount,
        message: `Queued ${result.modifiedCount} eligible work items`
      };
    }

    const paused = input.action === "pause";
    const update: UpdateFilter<DispatchControl> =
      input.action === "pause"
        ? {
            $set: {
              paused,
              pausedBy: actorId,
              pausedReason: input.reason,
              pausedAt: now,
              updatedAt: now
            },
            $setOnInsert: {
              projectId: input.projectId,
              createdAt: now
            }
          }
        : {
            $set: {
              paused,
              updatedAt: now
            },
            $setOnInsert: {
              projectId: input.projectId,
              createdAt: now
            },
            $unset: {
              pausedBy: "" as const,
              pausedReason: "" as const,
              pausedAt: "" as const
            }
          };

    await this.collections.dispatchControls.updateOne({ projectId: input.projectId }, update, { upsert: true });

    await this.recordDispatchAction({
      projectId: input.projectId,
      actorId,
      action: input.action,
      reason: input.reason,
      affectedWorkItemCount: 0,
      createdAt: now
    });

    return {
      action: input.action,
      dispatch: await this.getDispatchControl(input.projectId),
      affectedWorkItemCount: 0,
      message: paused ? "Dispatch paused" : "Dispatch resumed"
    };
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

  private async recordDispatchAction(input: {
    projectId: string;
    actorId: string;
    action: DispatchActionName;
    reason?: string;
    affectedWorkItemCount: number;
    createdAt: Date;
  }): Promise<void> {
    await this.collections.operatorActions.insertOne({
      id: createId("act"),
      projectId: input.projectId,
      actorId: input.actorId,
      action: `dispatch.${input.action}`,
      payload: {
        reason: input.reason,
        affectedWorkItemCount: input.affectedWorkItemCount
      },
      createdAt: input.createdAt
    });

    await this.appendEvent({
      projectId: input.projectId,
      type: `dispatch.${input.action}`,
      level: "info",
      message: `${input.actorId} requested ${input.action.replace("_", " ")}`,
      payload: {
        actorId: input.actorId,
        reason: input.reason,
        affectedWorkItemCount: input.affectedWorkItemCount
      },
      createdAt: input.createdAt
    });
  }

  private toDispatchControl(dispatch: DispatchControl | WithId<DispatchControl>): DispatchControl {
    const { _id: _ignored, ...control } = dispatch as WithId<DispatchControl>;
    return control;
  }

  private resolveActionTransition(
    workItem: WorkItem,
    action: OperatorActionName
  ): { toStatus: WorkItemStatus; message: string } {
    const status = workItem.status;

    if (status === "completed") {
      throw new InvalidWorkItemActionError("Completed work items cannot be changed by operator actions");
    }

    switch (action) {
      case "start":
        if (status === "running") {
          throw new InvalidWorkItemActionError("Cannot start a running work item");
        }
        if (status === "queued") {
          return { toStatus: "queued", message: "Work item is already queued" };
        }
        return { toStatus: "queued", message: "Work item queued for dispatch" };

      case "retry":
        if (status === "running") {
          throw new InvalidWorkItemActionError("Cannot retry a running work item");
        }
        if (status === "queued") {
          return { toStatus: "queued", message: "Work item is already queued" };
        }
        return { toStatus: "queued", message: "Work item queued for retry" };

      case "pause":
        if (status === "cancelled") {
          throw new InvalidWorkItemActionError("Cannot pause a cancelled work item");
        }
        if (status === "paused") {
          return { toStatus: "paused", message: "Work item is already paused" };
        }
        return { toStatus: "paused", message: "Work item paused" };

      case "resume":
        if (status !== "paused" && status !== "blocked" && status !== "queued") {
          throw new InvalidWorkItemActionError(`Cannot resume a ${status} work item`);
        }
        if (status === "queued") {
          return { toStatus: "queued", message: "Work item is already queued" };
        }
        return { toStatus: "queued", message: "Work item resumed" };

      case "cancel":
        if (status === "cancelled") {
          return { toStatus: "cancelled", message: "Work item is already cancelled" };
        }
        return { toStatus: "cancelled", message: "Work item cancelled" };

      case "complete":
        if (status !== "waiting_for_review") {
          throw new InvalidWorkItemActionError(`Cannot complete a ${status} work item`);
        }
        return { toStatus: "completed", message: "Work item marked complete after manual review" };
    }
  }

  private buildActionUpdate(input: {
    workItem: WorkItem;
    action: OperatorActionName;
    toStatus: WorkItemStatus;
    now: Date;
  }) {
    const retryIncrement = input.action === "retry" && input.workItem.status !== "queued" ? 1 : 0;

    return {
      $set: {
        status: input.toStatus,
        retryCount: input.workItem.retryCount + retryIncrement,
        updatedAt: input.now
      },
      $unset: {
        claimedBy: "" as const,
        nextAttemptAt: "" as const
      }
    };
  }

  private async toWorkItemSummary(workItem: WorkItem): Promise<WorkItemSummary> {
    const issue = await this.collections.issues.findOne({ id: workItem.issueId });
    const latestRun = workItem.lastRunId
      ? await this.collections.runs.findOne({ id: workItem.lastRunId })
      : await this.collections.runs.findOne({ workItemId: workItem.id }, { sort: { startedAt: -1 } });

    const [eventCount, lastEvent] = latestRun
      ? await Promise.all([
          this.collections.runEvents.countDocuments({ runId: latestRun.id }),
          this.collections.runEvents.findOne({ runId: latestRun.id }, { sort: { createdAt: -1 } })
        ])
      : [0, null] as const;

    return {
      id: workItem.id,
      status: workItem.status,
      issue: {
        id: issue?.id ?? workItem.issueId,
        identifier: issue?.identifier ?? "Unknown",
        title: issue?.title ?? "Issue unavailable",
        state: issue?.state ?? "Unknown",
        url: issue?.url
      },
      latestRun: latestRun
        ? {
            id: latestRun.id,
            status: latestRun.status,
            agentRuntime: latestRun.agentRuntime,
            workspacePath: latestRun.workspacePath,
            startedAt: latestRun.startedAt,
            endedAt: latestRun.endedAt
          }
        : undefined,
      eventCount,
      lastEvent: lastEvent
        ? {
            type: lastEvent.type,
            level: lastEvent.level,
            message: lastEvent.message,
            createdAt: lastEvent.createdAt
          }
        : undefined,
      claimedBy: workItem.claimedBy,
      retryCount: workItem.retryCount,
      updatedAt: workItem.updatedAt
    };
  }
}

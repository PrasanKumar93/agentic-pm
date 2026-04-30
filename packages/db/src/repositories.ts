import type { Db, Filter, UpdateFilter, WithId } from "mongodb";
import {
  createId,
  nextRetryAt,
  type Artifact,
  type DesiredAgentRuntime,
  type DispatchActionName,
  type DispatchActionResult,
  type DispatchControl,
  type Issue,
  type OperatorActionName,
  type OperatorActionResult,
  type Project,
  type RepositoryRef,
  type RepositorySummary,
  type ReviewChangeRequest,
  type Run,
  type RunEvent,
  type TrackerKind,
  type WorkItem,
  type WorkItemStatus,
  type WorkItemSummary,
} from "@agentic-pm/core";
import {
  getCollections,
  type AgenticCollections,
  type WebhookDelivery,
  type WebhookDeliveryStatus,
} from "./collections.js";

const activeRunStatuses: Run["status"][] = [
  "preparing",
  "running",
  "stalled",
  "retrying",
];
const startEligibleStatuses: WorkItemStatus[] = [
  "paused",
  "blocked",
  "failed",
  "cancelled",
];

export class WorkItemNotFoundError extends Error {
  constructor(workItemId: string) {
    super(`Work item not found: ${workItemId}`);
    this.name = "WorkItemNotFoundError";
  }
}

export class RepositoryNotFoundError extends Error {
  constructor(repositoryId: string) {
    super(`Repository not found: ${repositoryId}`);
    this.name = "RepositoryNotFoundError";
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

export interface WebhookDeliveryClaimResult {
  claimed: boolean;
  delivery: WebhookDelivery;
}

export interface ProjectOption {
  id: string;
  name: string;
  slug?: string;
  workItemCount: number;
  isDefault: boolean;
}

export interface RepositoryOption extends RepositorySummary {
  workItemCount: number;
  isDefault: boolean;
}

export class AgenticRepository {
  readonly collections: AgenticCollections;

  constructor(db: Db) {
    this.collections = getCollections(db);
  }

  async ensureProject(input: {
    id: string;
    name: string;
    slug: string;
    trackerKind: TrackerKind;
    repositoryIds?: string[];
    workflowPath?: string;
  }): Promise<Project> {
    const existing = await this.collections.projects.findOne({ id: input.id });
    const now = new Date();

    if (existing) {
      await this.collections.projects.updateOne(
        { id: input.id },
        {
          $set: {
            name: input.name,
            slug: input.slug,
            trackerKind: input.trackerKind,
            workflowPath: input.workflowPath,
            updatedAt: now,
          },
          ...(input.repositoryIds?.length
            ? {
                $addToSet: {
                  repositoryIds: { $each: input.repositoryIds },
                },
              }
            : {}),
        },
      );
    } else {
      await this.collections.projects.insertOne({
        id: input.id,
        name: input.name,
        slug: input.slug,
        trackerKind: input.trackerKind,
        repositoryIds: input.repositoryIds ?? [],
        workflowPath: input.workflowPath,
        createdAt: now,
        updatedAt: now,
      });
    }

    const stored = await this.collections.projects.findOne({ id: input.id });
    if (!stored) {
      throw new Error(`Project ${input.id} was not found after upsert`);
    }

    return stored;
  }

  async ensureRepository(repository: RepositoryRef): Promise<RepositoryRef> {
    const now = new Date();
    const nextRepository = {
      ...repository,
      updatedAt: now,
      createdAt: repository.createdAt ?? now,
    };
    const { id, createdAt, ...mutableRepository } = nextRepository;

    await this.collections.repositories.updateOne(
      { id },
      {
        $set: mutableRepository,
        $setOnInsert: { id, createdAt },
      },
      { upsert: true },
    );

    await this.collections.projects.updateOne(
      { id: repository.projectId },
      {
        $addToSet: {
          repositoryIds: id,
        },
        $set: {
          updatedAt: now,
        },
      },
    );

    const stored = await this.collections.repositories.findOne({ id });
    if (!stored) {
      throw new Error(`Repository ${repository.name} was not found after upsert`);
    }

    return stored;
  }

  async upsertIssue(issue: Issue): Promise<Issue> {
    const now = new Date();
    const nextIssue = {
      ...issue,
      updatedAt: now,
      createdAt: issue.createdAt ?? now,
    };
    const { id, createdAt, ...mutableIssue } = nextIssue;

    await this.collections.issues.updateOne(
      { tracker: issue.tracker, externalId: issue.externalId },
      { $set: mutableIssue, $setOnInsert: { id, createdAt } },
      { upsert: true },
    );

    const stored = await this.collections.issues.findOne({
      tracker: issue.tracker,
      externalId: issue.externalId,
    });

    if (!stored) {
      throw new Error(`Issue ${issue.identifier} was not found after upsert`);
    }

    return stored;
  }

  async ensureWorkItemForIssue(
    projectId: string,
    issue: Issue,
  ): Promise<WorkItem> {
    const now = new Date();
    const repositoryId = await this.resolveIssueRepositoryId(projectId, issue);
    const repositoryPatch = repositoryId ? { repositoryId } : {};
    const workItem: WorkItem = {
      id: createId("work"),
      issueId: issue.id,
      projectId,
      ...repositoryPatch,
      status: "queued",
      retryCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    const {
      repositoryId: _repositoryId,
      updatedAt: _updatedAt,
      ...insertWorkItem
    } = workItem;

    await this.collections.workItems.updateOne(
      { projectId, issueId: issue.id },
      {
        $setOnInsert: insertWorkItem,
        $set: {
          updatedAt: now,
          ...repositoryPatch,
        },
      },
      { upsert: true },
    );

    const stored = await this.collections.workItems.findOne({
      projectId,
      issueId: issue.id,
    });
    if (!stored) {
      throw new Error(
        `Work item for issue ${issue.identifier} was not found after upsert`,
      );
    }

    return stored;
  }

  private async resolveIssueRepositoryId(
    projectId: string,
    issue: Issue,
  ): Promise<string | undefined> {
    const explicitRepositoryId = issue.repoRefs[0];
    if (explicitRepositoryId) {
      return explicitRepositoryId;
    }

    const project = await this.collections.projects.findOne({ id: projectId });
    return project?.repositoryIds[0];
  }

  async getIssue(issueId: string): Promise<Issue | null> {
    return this.collections.issues.findOne({ id: issueId });
  }

  async listWorkItems(limit = 50, projectId?: string): Promise<WorkItem[]> {
    return this.collections.workItems
      .find(projectId ? { projectId } : {})
      .sort({ updatedAt: -1 })
      .limit(limit)
      .toArray();
  }

  async listWorkItemSummaries(
    limit = 50,
    projectId?: string,
  ): Promise<WorkItemSummary[]> {
    const workItems = await this.listWorkItems(limit, projectId);
    return Promise.all(
      workItems.map((workItem) => this.toWorkItemSummary(workItem)),
    );
  }

  async listProjectOptions(defaultProjectId: string): Promise<ProjectOption[]> {
    const [storedProjects, observedProjectIds] = await Promise.all([
      this.collections.projects.find({}, { projection: { _id: 0 } }).toArray(),
      this.listObservedProjectIds(defaultProjectId),
    ]);
    const storedById = new Map(
      storedProjects.map((project) => [project.id, project]),
    );
    const projectIds = [
      ...new Set([
        defaultProjectId,
        ...observedProjectIds,
        ...storedById.keys(),
      ]),
    ];

    const options = await Promise.all(
      projectIds.map(async (id) => {
        const project = storedById.get(id);
        return {
          id,
          name: project?.name ?? formatProjectName(id),
          slug: project?.slug,
          workItemCount: await this.collections.workItems.countDocuments({
            projectId: id,
          }),
          isDefault: id === defaultProjectId,
        };
      }),
    );

    return options.sort((left, right) => {
      if (left.isDefault !== right.isDefault) {
        return left.isDefault ? -1 : 1;
      }

      if (left.workItemCount !== right.workItemCount) {
        return right.workItemCount - left.workItemCount;
      }

      return left.name.localeCompare(right.name);
    });
  }

  async listRepositoryOptions(
    projectId: string,
  ): Promise<RepositoryOption[]> {
    const repositories = await this.collections.repositories
      .find({ projectId }, { projection: { _id: 0 } })
      .sort({ name: 1 })
      .toArray();
    const defaultRepositoryId = repositories[0]?.id;

    const options = await Promise.all(
      repositories.map(async (repository) => ({
        ...toRepositorySummary(repository),
        workItemCount: await this.collections.workItems.countDocuments({
          projectId,
          repositoryId: repository.id,
        }),
        isDefault: repository.id === defaultRepositoryId,
      })),
    );

    return options.sort((left, right) => {
      if (left.isDefault !== right.isDefault) {
        return left.isDefault ? -1 : 1;
      }

      return left.name.localeCompare(right.name);
    });
  }

  async getRepository(
    repositoryId: string,
    projectId?: string,
  ): Promise<RepositoryRef | null> {
    return this.collections.repositories.findOne(
      projectId ? { id: repositoryId, projectId } : { id: repositoryId },
    );
  }

  async getDefaultRepository(
    projectId: string,
  ): Promise<RepositoryRef | null> {
    return this.collections.repositories.findOne(
      { projectId },
      { sort: { name: 1 } },
    );
  }

  async createLocalWorkItem(input: {
    projectId: string;
    repositoryId?: string;
    title: string;
    description?: string;
    desiredRuntime?: DesiredAgentRuntime;
    actorId?: string;
  }): Promise<WorkItem> {
    const repositoryRef = input.repositoryId
      ? await this.getRepository(input.repositoryId, input.projectId)
      : await this.getDefaultRepository(input.projectId);
    if (!repositoryRef) {
      throw new RepositoryNotFoundError(
        input.repositoryId ?? `${input.projectId}:default`,
      );
    }

    const now = new Date();
    const actorId = input.actorId || "local-operator";
    const issueExternalId = createId("local_issue");
    const identifier = await this.nextLocalIssueIdentifier(input.projectId);
    const issue: Issue = {
      id: createId("issue"),
      tracker: "fake",
      externalId: issueExternalId,
      identifier,
      title: input.title,
      description: input.description,
      state: "Ready for Agent",
      labels: ["local-intake"],
      assignee: actorId,
      blockedBy: [],
      repoRefs: [repositoryRef.id],
      raw: {
        source: "dashboard.intake",
        repositoryId: repositoryRef.id,
      },
      createdAt: now,
      updatedAt: now,
    };
    const workItem: WorkItem = {
      id: createId("work"),
      issueId: issue.id,
      projectId: input.projectId,
      repositoryId: repositoryRef.id,
      status: "queued",
      ...(input.desiredRuntime
        ? { desiredRuntime: input.desiredRuntime }
        : {}),
      retryCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    await this.collections.issues.insertOne(issue);
    await this.collections.workItems.insertOne(workItem);

    await this.collections.operatorActions.insertOne({
      id: createId("act"),
      projectId: input.projectId,
      workItemId: workItem.id,
      actorId,
      action: "work_item.create",
      payload: {
        issueId: issue.id,
        issueIdentifier: issue.identifier,
        repositoryId: repositoryRef.id,
        repositoryName: repositoryRef.name,
        desiredRuntime: input.desiredRuntime,
      },
      createdAt: now,
    });

    await this.appendEvent({
      projectId: input.projectId,
      workItemId: workItem.id,
      type: "work_item.created",
      level: "info",
      message: `${actorId} created ${issue.identifier}`,
      payload: {
        actorId,
        issueId: issue.id,
        issueIdentifier: issue.identifier,
        repositoryId: repositoryRef.id,
        repositoryName: repositoryRef.name,
        desiredRuntime: input.desiredRuntime,
      },
      createdAt: now,
    });

    return workItem;
  }

  async getWorkItemSummary(
    workItemId: string,
  ): Promise<WorkItemSummary | null> {
    const workItem = await this.collections.workItems.findOne({
      id: workItemId,
    });
    return workItem ? this.toWorkItemSummary(workItem) : null;
  }

  async getDispatchControl(projectId: string): Promise<DispatchControl> {
    const existing = await this.collections.dispatchControls.findOne({
      projectId,
    });
    if (existing) {
      return this.toDispatchControl(existing);
    }

    const now = new Date();
    return {
      projectId,
      paused: false,
      createdAt: now,
      updatedAt: now,
    };
  }

  async isDispatchPaused(projectId: string): Promise<boolean> {
    const control = await this.collections.dispatchControls.findOne({
      projectId,
    });
    return control?.paused ?? false;
  }

  async getRunStopRequest(input: {
    runId: string;
    workItemId: string;
  }): Promise<RunStopRequest> {
    const [run, workItem] = await Promise.all([
      this.collections.runs.findOne({ id: input.runId }),
      this.collections.workItems.findOne({ id: input.workItemId }),
    ]);

    if (!workItem) {
      return {
        shouldStop: true,
        reason: `work item ${input.workItemId} is no longer available`,
        runStatus: run?.status,
      };
    }

    if (run?.status === "cancelled") {
      return {
        shouldStop: true,
        reason: run.exitReason ?? "run was cancelled",
        runStatus: run.status,
        workItemStatus: workItem.status,
      };
    }

    if (workItem.status === "cancelled") {
      return {
        shouldStop: true,
        reason: "work item was cancelled",
        runStatus: run?.status,
        workItemStatus: workItem.status,
      };
    }

    if (workItem.status === "paused") {
      return {
        shouldStop: true,
        reason: "work item was paused",
        runStatus: run?.status,
        workItemStatus: workItem.status,
      };
    }

    return {
      shouldStop: false,
      runStatus: run?.status,
      workItemStatus: workItem.status,
    };
  }

  async claimNextQueuedWorkItem(
    projectId: string,
    workerId: string,
    now = new Date(),
    runtimeClaims: DesiredAgentRuntime[] = [],
  ): Promise<WorkItem | null> {
    const filters: Filter<WorkItem>[] = [
      {
        $or: [
          { nextAttemptAt: { $exists: false } },
          { nextAttemptAt: { $lte: now } },
        ],
      },
    ];

    if (runtimeClaims.length > 0) {
      filters.push({
        $or: [
          { desiredRuntime: { $exists: false } },
          { desiredRuntime: { $in: runtimeClaims } },
        ],
      });
    }

    const claimed = await this.collections.workItems.findOneAndUpdate(
      {
        projectId,
        status: "queued",
        $and: filters,
      },
      {
        $set: {
          status: "running",
          claimedBy: workerId,
          updatedAt: now,
        },
      },
      {
        sort: { retryCount: 1, updatedAt: 1 },
        returnDocument: "after",
      },
    );

    return claimed;
  }

  async setWorkItemRuntimePreference(input: {
    workItemId: string;
    desiredRuntime?: DesiredAgentRuntime;
    actorId?: string;
    reason?: string;
  }): Promise<WorkItem> {
    const workItem = await this.collections.workItems.findOne({
      id: input.workItemId,
    });
    if (!workItem) {
      throw new WorkItemNotFoundError(input.workItemId);
    }

    if (workItem.status === "running") {
      throw new InvalidWorkItemActionError(
        "Cannot change runtime preference for a running work item",
      );
    }

    const actorId = input.actorId || "local-operator";
    const now = new Date();
    const update: UpdateFilter<WorkItem> = input.desiredRuntime
      ? {
          $set: {
            desiredRuntime: input.desiredRuntime,
            updatedAt: now,
          },
        }
      : {
          $set: {
            updatedAt: now,
          },
          $unset: {
            desiredRuntime: "" as const,
          },
        };

    await this.collections.workItems.updateOne({ id: workItem.id }, update);

    await this.collections.operatorActions.insertOne({
      id: createId("act"),
      projectId: workItem.projectId,
      workItemId: workItem.id,
      runId: workItem.lastRunId,
      actorId,
      action: "runtime.select",
      payload: {
        reason: input.reason,
        fromRuntime: workItem.desiredRuntime,
        toRuntime: input.desiredRuntime,
      },
      createdAt: now,
    });

    await this.appendEvent({
      projectId: workItem.projectId,
      workItemId: workItem.id,
      runId: workItem.lastRunId,
      type: "operator.runtime_selected",
      level: "info",
      message: `${actorId} selected ${input.desiredRuntime ?? "default"} runtime`,
      payload: {
        actorId,
        reason: input.reason,
        fromRuntime: workItem.desiredRuntime,
        toRuntime: input.desiredRuntime,
      },
      createdAt: now,
    });

    const updated = await this.collections.workItems.findOne({
      id: workItem.id,
    });
    if (!updated) {
      throw new WorkItemNotFoundError(workItem.id);
    }

    return updated;
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
      updatedAt: now,
    };

    await this.collections.runs.insertOne(run);
    await this.collections.workItems.updateOne(
      { id: input.workItem.id },
      {
        $set: {
          lastRunId: run.id,
          updatedAt: now,
        },
      },
    );

    return run;
  }

  async setRunStatus(
    runId: string,
    status: Run["status"],
    exitReason?: string,
  ): Promise<void> {
    const now = new Date();
    await this.collections.runs.updateOne(
      { id: runId },
      {
        $set: {
          status,
          exitReason,
          updatedAt: now,
          ...(status === "completed" ||
          status === "failed" ||
          status === "cancelled" ||
          status === "waiting_for_review"
            ? { endedAt: now }
            : {}),
        },
      },
    );
  }

  async heartbeatRun(runId: string): Promise<void> {
    const now = new Date();
    await this.collections.runs.updateOne(
      { id: runId },
      {
        $set: {
          lastHeartbeatAt: now,
          updatedAt: now,
        },
      },
    );
  }

  async scheduleRetry(
    workItemId: string,
    retryCount: number,
    maxBackoffMs: number,
  ): Promise<void> {
    const now = new Date();
    await this.collections.workItems.updateOne(
      { id: workItemId },
      {
        $set: {
          status: "queued",
          retryCount,
          nextAttemptAt: nextRetryAt(retryCount, maxBackoffMs, now),
          updatedAt: now,
        },
        $unset: {
          claimedBy: "",
        },
      },
    );
  }

  async markWorkItemStatus(
    workItemId: string,
    status: WorkItem["status"],
  ): Promise<void> {
    const shouldClearReviewRequest =
      status === "waiting_for_review" ||
      status === "failed" ||
      status === "completed" ||
      status === "cancelled";

    await this.collections.workItems.updateOne(
      { id: workItemId },
      {
        $set: {
          status,
          updatedAt: new Date(),
        },
        $unset: {
          claimedBy: "",
          ...(shouldClearReviewRequest ? { reviewRequest: "" as const } : {}),
        },
      },
    );
  }

  async assignWorkItemRepository(input: {
    workItemId: string;
    repositoryId: string;
    actorId?: string;
    reason?: string;
    now?: Date;
  }): Promise<WorkItem> {
    const workItem = await this.collections.workItems.findOne({
      id: input.workItemId,
    });
    if (!workItem) {
      throw new WorkItemNotFoundError(input.workItemId);
    }

    const repositoryRef = await this.getRepository(
      input.repositoryId,
      workItem.projectId,
    );
    if (!repositoryRef) {
      throw new RepositoryNotFoundError(input.repositoryId);
    }

    const now = input.now ?? new Date();
    await this.collections.workItems.updateOne(
      { id: input.workItemId },
      {
        $set: {
          repositoryId: repositoryRef.id,
          updatedAt: now,
        },
      },
    );

    await this.appendEvent({
      projectId: workItem.projectId,
      workItemId: workItem.id,
      type: "work_item.repository_assigned",
      level: "info",
      message: `${input.actorId ?? "worker"} assigned ${repositoryRef.name} repository`,
      payload: {
        actorId: input.actorId,
        reason: input.reason,
        repositoryId: repositoryRef.id,
        repositoryName: repositoryRef.name,
      },
      createdAt: now,
    });

    return {
      ...workItem,
      repositoryId: repositoryRef.id,
      updatedAt: now,
    };
  }

  async performWorkItemAction(input: {
    workItemId: string;
    action: OperatorActionName;
    actorId?: string;
    reason?: string;
  }): Promise<OperatorActionResult> {
    const workItem = await this.collections.workItems.findOne({
      id: input.workItemId,
    });
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
      now,
    });

    await this.collections.workItems.updateOne({ id: workItem.id }, update);

    if (input.action === "cancel" && workItem.lastRunId) {
      await this.collections.runs.updateOne(
        {
          id: workItem.lastRunId,
          status: { $in: activeRunStatuses },
        },
        {
          $set: {
            status: "cancelled",
            exitReason: `cancelled by ${actorId}`,
            endedAt: now,
            updatedAt: now,
          },
        },
      );
    }

    if (input.action === "complete" && workItem.lastRunId) {
      await this.collections.runs.updateOne(
        {
          id: workItem.lastRunId,
          status: "waiting_for_review",
        },
        {
          $set: {
            status: "completed",
            exitReason: `completed by ${actorId} after manual review`,
            endedAt: now,
            updatedAt: now,
          },
        },
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
        toStatus: transition.toStatus,
      },
      createdAt: now,
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
        toStatus: transition.toStatus,
      },
      createdAt: now,
    });

    const updated = await this.collections.workItems.findOne({
      id: workItem.id,
    });
    if (!updated) {
      throw new WorkItemNotFoundError(workItem.id);
    }

    return {
      action: input.action,
      workItem: updated,
      fromStatus,
      toStatus: updated.status,
      message: transition.message,
    };
  }

  async requestWorkItemChanges(input: {
    workItemId: string;
    feedback: string;
    actorId?: string;
    desiredRuntime?: DesiredAgentRuntime;
  }): Promise<OperatorActionResult> {
    const workItem = await this.collections.workItems.findOne({
      id: input.workItemId,
    });
    if (!workItem) {
      throw new WorkItemNotFoundError(input.workItemId);
    }

    if (workItem.status !== "waiting_for_review") {
      throw new InvalidWorkItemActionError(
        `Cannot request changes for a ${workItem.status} work item`,
      );
    }

    const feedback = input.feedback.trim();
    if (!feedback) {
      throw new InvalidWorkItemActionError(
        "Review change requests require feedback",
      );
    }

    const latestRun = workItem.lastRunId
      ? await this.collections.runs.findOne({ id: workItem.lastRunId })
      : await this.collections.runs.findOne(
          { workItemId: workItem.id },
          { sort: { startedAt: -1 } },
        );
    const pullRequestArtifact = latestRun
      ? await this.collections.artifacts.findOne(
          { runId: latestRun.id, type: "pr" },
          { sort: { createdAt: -1 } },
        )
      : null;
    const branchName =
      readMetadataString(pullRequestArtifact?.metadata, "branchName") ??
      readMetadataString(pullRequestArtifact?.metadata, "remoteBranchName");

    if (!latestRun || !pullRequestArtifact || !branchName) {
      throw new InvalidWorkItemActionError(
        "Review changes require a latest run with a PR artifact and branch metadata",
      );
    }

    const actorId = input.actorId || "local-operator";
    const now = new Date();
    const fromStatus = workItem.status;
    const desiredRuntime = input.desiredRuntime ?? workItem.desiredRuntime;
    const reviewRequest: ReviewChangeRequest = {
      feedback,
      requestedAt: now,
      requestedBy: actorId,
      baseRunId: latestRun.id,
      branchName,
      baseBranch:
        readMetadataString(pullRequestArtifact.metadata, "baseBranch") ??
        readMetadataString(pullRequestArtifact.metadata, "remoteBaseBranch"),
      remoteName: readMetadataString(pullRequestArtifact.metadata, "remoteName"),
      remotePrUrl: readMetadataString(
        pullRequestArtifact.metadata,
        "remotePrUrl",
      ),
      preferredRuntime: desiredRuntime,
    };

    await this.collections.workItems.updateOne(
      { id: workItem.id },
      {
        $set: {
          status: "queued",
          retryCount: workItem.retryCount + 1,
          reviewRequest,
          updatedAt: now,
          ...(input.desiredRuntime
            ? { desiredRuntime: input.desiredRuntime }
            : {}),
        },
        $unset: {
          claimedBy: "" as const,
          nextAttemptAt: "" as const,
        },
      },
    );

    await this.collections.operatorActions.insertOne({
      id: createId("act"),
      projectId: workItem.projectId,
      workItemId: workItem.id,
      runId: latestRun.id,
      actorId,
      action: "request_changes",
      payload: {
        branchName,
        feedback,
        fromStatus,
        toStatus: "queued",
        desiredRuntime,
        pullRequestArtifactId: pullRequestArtifact.id,
        remotePrUrl: reviewRequest.remotePrUrl,
      },
      createdAt: now,
    });

    await this.appendEvent({
      projectId: workItem.projectId,
      workItemId: workItem.id,
      runId: latestRun.id,
      type: "operator.request_changes",
      level: "info",
      message: `${actorId} requested PR changes`,
      payload: {
        actorId,
        branchName,
        feedback,
        fromStatus,
        toStatus: "queued",
        desiredRuntime,
        pullRequestArtifactId: pullRequestArtifact.id,
        remotePrUrl: reviewRequest.remotePrUrl,
      },
      createdAt: now,
    });

    const updated = await this.collections.workItems.findOne({
      id: workItem.id,
    });
    if (!updated) {
      throw new WorkItemNotFoundError(workItem.id);
    }

    return {
      action: "request_changes",
      workItem: updated,
      fromStatus,
      toStatus: updated.status,
      message: "Work item queued for PR changes",
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
          status: { $in: startEligibleStatuses },
        },
        {
          $set: {
            status: "queued",
            updatedAt: now,
          },
          $unset: {
            claimedBy: "",
            nextAttemptAt: "",
          },
        },
      );

      await this.recordDispatchAction({
        projectId: input.projectId,
        actorId,
        action: input.action,
        reason: input.reason,
        affectedWorkItemCount: result.modifiedCount,
        createdAt: now,
      });

      return {
        action: input.action,
        dispatch: await this.getDispatchControl(input.projectId),
        affectedWorkItemCount: result.modifiedCount,
        message: `Queued ${result.modifiedCount} eligible work items`,
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
              updatedAt: now,
            },
            $setOnInsert: {
              projectId: input.projectId,
              createdAt: now,
            },
          }
        : {
            $set: {
              paused,
              updatedAt: now,
            },
            $setOnInsert: {
              projectId: input.projectId,
              createdAt: now,
            },
            $unset: {
              pausedBy: "" as const,
              pausedReason: "" as const,
              pausedAt: "" as const,
            },
          };

    await this.collections.dispatchControls.updateOne(
      { projectId: input.projectId },
      update,
      { upsert: true },
    );

    await this.recordDispatchAction({
      projectId: input.projectId,
      actorId,
      action: input.action,
      reason: input.reason,
      affectedWorkItemCount: 0,
      createdAt: now,
    });

    return {
      action: input.action,
      dispatch: await this.getDispatchControl(input.projectId),
      affectedWorkItemCount: 0,
      message: paused ? "Dispatch paused" : "Dispatch resumed",
    };
  }

  async appendEvent(
    event: Omit<RunEvent, "id" | "createdAt"> & {
      id?: string;
      createdAt?: Date;
    },
  ): Promise<RunEvent> {
    const stored: RunEvent = {
      ...event,
      id: event.id ?? createId("evt"),
      createdAt: event.createdAt ?? new Date(),
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

  async getArtifact(artifactId: string): Promise<Artifact | null> {
    return this.collections.artifacts.findOne({ id: artifactId });
  }

  async linkPullRequestArtifact(input: {
    actorId?: string;
    artifactId: string;
    remoteBaseBranch?: string;
    remoteBranchName?: string;
    remoteDraft?: boolean;
    remoteName?: string;
    remotePrUrl: string;
    remoteState?: string;
  }): Promise<Artifact | null> {
    const artifact = await this.getArtifact(input.artifactId);
    if (!artifact) {
      return null;
    }

    const now = new Date();
    const metadata: Record<string, unknown> = {
      "metadata.linkedManually": true,
      "metadata.remotePrUrl": input.remotePrUrl,
      "metadata.remoteStatus": "linked",
    };
    const eventPayload: Record<string, unknown> = {
      artifactId: artifact.id,
      linkedManually: true,
      remotePrUrl: input.remotePrUrl,
    };

    if (input.remoteName) {
      metadata["metadata.remoteName"] = input.remoteName;
      eventPayload.remoteName = input.remoteName;
    }

    if (input.remoteBranchName) {
      metadata["metadata.remoteBranchName"] = input.remoteBranchName;
      eventPayload.remoteBranchName = input.remoteBranchName;
    }

    if (input.remoteBaseBranch) {
      metadata["metadata.remoteBaseBranch"] = input.remoteBaseBranch;
      eventPayload.remoteBaseBranch = input.remoteBaseBranch;
    }

    if (input.remoteState) {
      metadata["metadata.remoteState"] = input.remoteState;
      eventPayload.remoteState = input.remoteState;
    }

    if (typeof input.remoteDraft === "boolean") {
      metadata["metadata.remoteDraft"] = input.remoteDraft;
      eventPayload.remoteDraft = input.remoteDraft;
    }

    await this.collections.artifacts.updateOne(
      { id: input.artifactId },
      { $set: metadata },
    );

    const run = artifact.runId
      ? await this.collections.runs.findOne({ id: artifact.runId })
      : null;
    const workItem = run
      ? await this.collections.workItems.findOne({ id: run.workItemId })
      : null;

    await this.appendEvent({
      projectId: workItem?.projectId,
      workItemId: workItem?.id,
      runId: artifact.runId,
      type: "github.pr.linked",
      level: "info",
      message: `${input.actorId ?? "operator"} linked a GitHub PR`,
      payload: eventPayload,
      createdAt: now,
    });

    return this.getArtifact(input.artifactId);
  }

  async listArtifacts(runId: string): Promise<Artifact[]> {
    return this.collections.artifacts
      .find({ runId })
      .sort({ createdAt: 1 })
      .toArray();
  }

  async listWebhookDeliveries(
    limit = 50,
    projectId?: string,
  ): Promise<WebhookDelivery[]> {
    return this.collections.webhookDeliveries
      .find(projectId ? { projectId } : {}, { projection: { _id: 0 } })
      .sort({ lastReceivedAt: -1 })
      .limit(limit)
      .toArray();
  }

  private async listObservedProjectIds(
    defaultProjectId: string,
  ): Promise<string[]> {
    const sources = await Promise.all([
      this.collections.workItems.distinct("projectId"),
      this.collections.runEvents.distinct("projectId"),
      this.collections.operatorActions.distinct("projectId"),
      this.collections.dispatchControls.distinct("projectId"),
      this.collections.webhookDeliveries.distinct("projectId"),
    ]);

    return [
      ...new Set([
        defaultProjectId,
        ...sources.flat().filter(isNonEmptyString),
      ]),
    ].sort((left, right) => left.localeCompare(right));
  }

  private async nextLocalIssueIdentifier(projectId: string): Promise<string> {
    const count = await this.collections.workItems.countDocuments({
      projectId,
    });
    return `LOCAL-${count + 1}`;
  }

  async claimWebhookDelivery(input: {
    projectId: string;
    provider: string;
    deliveryId: string;
    event?: string;
    action?: string;
    type?: string;
  }): Promise<WebhookDeliveryClaimResult> {
    const now = new Date();
    const result = await this.collections.webhookDeliveries.updateOne(
      {
        provider: input.provider,
        deliveryId: input.deliveryId,
      },
      {
        $set: {
          lastReceivedAt: now,
          updatedAt: now,
        },
        $setOnInsert: {
          id: createId("whd"),
          projectId: input.projectId,
          provider: input.provider,
          deliveryId: input.deliveryId,
          event: input.event,
          action: input.action,
          type: input.type,
          status: "processing",
          firstReceivedAt: now,
          createdAt: now,
        },
        $inc: {
          attemptCount: 1,
        },
      },
      { upsert: true },
    );

    const delivery = await this.collections.webhookDeliveries.findOne({
      provider: input.provider,
      deliveryId: input.deliveryId,
    });

    if (!delivery) {
      throw new Error(
        `Webhook delivery ${input.provider}:${input.deliveryId} was not found after claim`,
      );
    }

    return {
      claimed: result.upsertedCount === 1,
      delivery,
    };
  }

  async completeWebhookDelivery(input: {
    provider: string;
    deliveryId: string;
    status: WebhookDeliveryStatus;
    result?: Record<string, unknown>;
  }): Promise<void> {
    const now = new Date();
    await this.collections.webhookDeliveries.updateOne(
      {
        provider: input.provider,
        deliveryId: input.deliveryId,
      },
      {
        $set: {
          status: input.status,
          result: input.result,
          processedAt: now,
          updatedAt: now,
        },
      },
    );
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
        affectedWorkItemCount: input.affectedWorkItemCount,
      },
      createdAt: input.createdAt,
    });

    await this.appendEvent({
      projectId: input.projectId,
      type: `dispatch.${input.action}`,
      level: "info",
      message: `${input.actorId} requested ${input.action.replace("_", " ")}`,
      payload: {
        actorId: input.actorId,
        reason: input.reason,
        affectedWorkItemCount: input.affectedWorkItemCount,
      },
      createdAt: input.createdAt,
    });
  }

  private toDispatchControl(
    dispatch: DispatchControl | WithId<DispatchControl>,
  ): DispatchControl {
    const { _id: _ignored, ...control } = dispatch as WithId<DispatchControl>;
    return control;
  }

  private resolveActionTransition(
    workItem: WorkItem,
    action: OperatorActionName,
  ): { toStatus: WorkItemStatus; message: string } {
    const status = workItem.status;

    if (status === "completed") {
      throw new InvalidWorkItemActionError(
        "Completed work items cannot be changed by operator actions",
      );
    }

    switch (action) {
      case "start":
        if (status === "running") {
          throw new InvalidWorkItemActionError(
            "Cannot start a running work item",
          );
        }
        if (status === "queued") {
          return { toStatus: "queued", message: "Work item is already queued" };
        }
        return { toStatus: "queued", message: "Work item queued for dispatch" };

      case "retry":
        if (status === "running") {
          throw new InvalidWorkItemActionError(
            "Cannot retry a running work item",
          );
        }
        if (status === "queued") {
          return { toStatus: "queued", message: "Work item is already queued" };
        }
        return { toStatus: "queued", message: "Work item queued for retry" };

      case "request_changes":
        if (status !== "waiting_for_review") {
          throw new InvalidWorkItemActionError(
            `Cannot request changes for a ${status} work item`,
          );
        }
        return {
          toStatus: "queued",
          message: "Work item queued for PR changes",
        };

      case "pause":
        if (status === "cancelled") {
          throw new InvalidWorkItemActionError(
            "Cannot pause a cancelled work item",
          );
        }
        if (status === "paused") {
          return { toStatus: "paused", message: "Work item is already paused" };
        }
        return { toStatus: "paused", message: "Work item paused" };

      case "resume":
        if (
          status !== "paused" &&
          status !== "blocked" &&
          status !== "queued"
        ) {
          throw new InvalidWorkItemActionError(
            `Cannot resume a ${status} work item`,
          );
        }
        if (status === "queued") {
          return { toStatus: "queued", message: "Work item is already queued" };
        }
        return { toStatus: "queued", message: "Work item resumed" };

      case "cancel":
        if (status === "cancelled") {
          return {
            toStatus: "cancelled",
            message: "Work item is already cancelled",
          };
        }
        return { toStatus: "cancelled", message: "Work item cancelled" };

      case "complete":
        if (status !== "waiting_for_review") {
          throw new InvalidWorkItemActionError(
            `Cannot complete a ${status} work item`,
          );
        }
        return {
          toStatus: "completed",
          message: "Work item marked complete after manual review",
        };
    }
  }

  private buildActionUpdate(input: {
    workItem: WorkItem;
    action: OperatorActionName;
    toStatus: WorkItemStatus;
    now: Date;
  }) {
    const retryIncrement =
      input.action === "retry" && input.workItem.status !== "queued" ? 1 : 0;
    const shouldClearReviewRequest =
      input.action === "retry" ||
      input.action === "cancel" ||
      input.action === "complete";

    return {
      $set: {
        status: input.toStatus,
        retryCount: input.workItem.retryCount + retryIncrement,
        updatedAt: input.now,
      },
      $unset: {
        claimedBy: "" as const,
        nextAttemptAt: "" as const,
        ...(shouldClearReviewRequest ? { reviewRequest: "" as const } : {}),
      },
    };
  }

  private async toWorkItemSummary(
    workItem: WorkItem,
  ): Promise<WorkItemSummary> {
    const issue = await this.collections.issues.findOne({
      id: workItem.issueId,
    });
    const repositoryId = workItem.repositoryId ?? issue?.repoRefs[0];
    const repositoryRef = repositoryId
      ? await this.collections.repositories.findOne({
          id: repositoryId,
          projectId: workItem.projectId,
        })
      : undefined;
    const latestRun = workItem.lastRunId
      ? await this.collections.runs.findOne({ id: workItem.lastRunId })
      : await this.collections.runs.findOne(
          { workItemId: workItem.id },
          { sort: { startedAt: -1 } },
        );

    const [eventCount, lastEvent] = latestRun
      ? await Promise.all([
          this.collections.runEvents.countDocuments({ runId: latestRun.id }),
          this.collections.runEvents.findOne(
            { runId: latestRun.id },
            { sort: { createdAt: -1 } },
          ),
        ])
      : ([0, null] as const);

    return {
      id: workItem.id,
      status: workItem.status,
      desiredRuntime: workItem.desiredRuntime,
      repository: repositoryRef
        ? toRepositorySummary(repositoryRef)
        : undefined,
      issue: {
        id: issue?.id ?? workItem.issueId,
        identifier: issue?.identifier ?? "Unknown",
        title: issue?.title ?? "Issue unavailable",
        state: issue?.state ?? "Unknown",
        url: issue?.url,
      },
      latestRun: latestRun
        ? {
            id: latestRun.id,
            status: latestRun.status,
            agentRuntime: latestRun.agentRuntime,
            workspacePath: latestRun.workspacePath,
            startedAt: latestRun.startedAt,
            endedAt: latestRun.endedAt,
          }
        : undefined,
      eventCount,
      lastEvent: lastEvent
        ? {
            type: lastEvent.type,
            level: lastEvent.level,
            message: lastEvent.message,
            createdAt: lastEvent.createdAt,
          }
        : undefined,
      claimedBy: workItem.claimedBy,
      retryCount: workItem.retryCount,
      updatedAt: workItem.updatedAt,
    };
  }
}

function formatProjectName(projectId: string): string {
  if (projectId === "project_local") {
    return "Local project";
  }

  return projectId
    .replace(/^project_/, "")
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function toRepositorySummary(
  repository: RepositoryRef | WithId<RepositoryRef>,
): RepositorySummary {
  const { _id: _ignored, ...repositoryRef } =
    repository as WithId<RepositoryRef>;
  return {
    id: repositoryRef.id,
    projectId: repositoryRef.projectId,
    name: repositoryRef.name,
    url: repositoryRef.url,
    defaultBranch: repositoryRef.defaultBranch,
    localPath: repositoryRef.localPath,
    pullRequest: repositoryRef.pullRequest,
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function readMetadataString(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = metadata?.[key];
  return isNonEmptyString(value) ? value.trim() : undefined;
}

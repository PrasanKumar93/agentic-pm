import type { Collection, Db } from "mongodb";
import type {
  Artifact,
  DispatchControl,
  Issue,
  Project,
  RepositoryRef,
  Run,
  RunEvent,
  WorkItem,
} from "@agentic-pm/core";

export interface TrackerConnection {
  id: string;
  projectId: string;
  kind: string;
  externalTeamKey?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowSnapshot {
  id: string;
  projectId: string;
  path?: string;
  checksum: string;
  config: unknown;
  promptTemplate: string;
  createdAt: Date;
}

export interface SecretReference {
  id: string;
  projectId: string;
  name: string;
  envVar: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OperatorAction {
  id: string;
  projectId?: string;
  workItemId?: string;
  runId?: string;
  actorId?: string;
  action: string;
  payload?: Record<string, unknown>;
  createdAt: Date;
}

export type WebhookDeliveryStatus =
  | "processing"
  | "processed"
  | "ignored"
  | "failed";

export interface WebhookDelivery {
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
  firstReceivedAt: Date;
  lastReceivedAt: Date;
  processedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgenticCollections {
  projects: Collection<Project>;
  repositories: Collection<RepositoryRef>;
  trackerConnections: Collection<TrackerConnection>;
  issues: Collection<Issue>;
  workItems: Collection<WorkItem>;
  runs: Collection<Run>;
  runEvents: Collection<RunEvent>;
  artifacts: Collection<Artifact>;
  operatorActions: Collection<OperatorAction>;
  dispatchControls: Collection<DispatchControl>;
  webhookDeliveries: Collection<WebhookDelivery>;
  workflowSnapshots: Collection<WorkflowSnapshot>;
  secretReferences: Collection<SecretReference>;
}

export function getCollections(db: Db): AgenticCollections {
  return {
    projects: db.collection<Project>("projects"),
    repositories: db.collection<RepositoryRef>("repositories"),
    trackerConnections: db.collection<TrackerConnection>("tracker_connections"),
    issues: db.collection<Issue>("issues"),
    workItems: db.collection<WorkItem>("work_items"),
    runs: db.collection<Run>("runs"),
    runEvents: db.collection<RunEvent>("run_events"),
    artifacts: db.collection<Artifact>("artifacts"),
    operatorActions: db.collection<OperatorAction>("operator_actions"),
    dispatchControls: db.collection<DispatchControl>("dispatch_controls"),
    webhookDeliveries: db.collection<WebhookDelivery>("webhook_deliveries"),
    workflowSnapshots: db.collection<WorkflowSnapshot>("workflow_snapshots"),
    secretReferences: db.collection<SecretReference>("secrets_references"),
  };
}

export async function ensureIndexes(
  collections: AgenticCollections,
): Promise<void> {
  await dropLegacyIssueOnlyWorkItemIndex(collections);

  await Promise.all([
    collections.projects.createIndex({ slug: 1 }, { unique: true }),
    collections.repositories.createIndex({ id: 1 }, { unique: true }),
    collections.repositories.createIndex({ projectId: 1, name: 1 }),
    collections.issues.createIndex(
      { tracker: 1, externalId: 1 },
      { unique: true },
    ),
    collections.issues.createIndex({ identifier: 1 }),
    collections.workItems.createIndex({
      projectId: 1,
      status: 1,
      nextAttemptAt: 1,
    }),
    collections.workItems.createIndex({ projectId: 1, repositoryId: 1 }),
    collections.workItems.createIndex(
      { projectId: 1, issueId: 1 },
      { unique: true },
    ),
    collections.runs.createIndex({ workItemId: 1, attempt: -1 }),
    collections.runs.createIndex({ status: 1, lastHeartbeatAt: 1 }),
    collections.runEvents.createIndex({ runId: 1, createdAt: 1 }),
    collections.artifacts.createIndex({ runId: 1, createdAt: 1 }),
    collections.operatorActions.createIndex({ workItemId: 1, createdAt: -1 }),
    collections.dispatchControls.createIndex({ projectId: 1 }, { unique: true }),
    collections.webhookDeliveries.createIndex(
      { provider: 1, deliveryId: 1 },
      { unique: true },
    ),
    collections.webhookDeliveries.createIndex({
      projectId: 1,
      lastReceivedAt: -1,
    }),
    collections.workflowSnapshots.createIndex({ projectId: 1, createdAt: -1 }),
  ]);
}

async function dropLegacyIssueOnlyWorkItemIndex(
  collections: AgenticCollections,
): Promise<void> {
  const indexes = await collections.workItems.listIndexes().toArray();
  const legacyIndex = indexes.find((index) => {
    const key = index.key as Record<string, unknown> | undefined;
    return (
      index.unique === true &&
      key?.issueId === 1 &&
      Object.keys(key).length === 1
    );
  });

  if (legacyIndex?.name) {
    await collections.workItems.dropIndex(legacyIndex.name);
  }
}

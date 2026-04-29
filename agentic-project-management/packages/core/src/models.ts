export type TrackerKind = "linear" | "github" | "jira" | "fake";

export type WorkItemStatus =
  | "queued"
  | "running"
  | "waiting_for_review"
  | "blocked"
  | "paused"
  | "failed"
  | "completed"
  | "cancelled";

export type RunStatus =
  | "queued"
  | "preparing"
  | "running"
  | "stalled"
  | "retrying"
  | "waiting_for_review"
  | "failed"
  | "cancelled"
  | "completed";

export type ArtifactType =
  | "log"
  | "patch"
  | "pr"
  | "screenshot"
  | "video"
  | "test_report"
  | "review_packet"
  | "plan";

export type EventLevel = "debug" | "info" | "warn" | "error";

export type OperatorActionName = "start" | "retry" | "pause" | "resume" | "cancel" | "complete";
export type DispatchActionName = "pause" | "resume" | "start_eligible";

export interface Project {
  id: string;
  name: string;
  slug: string;
  trackerKind: TrackerKind;
  repositoryIds: string[];
  workflowPath?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RepositoryRef {
  id: string;
  projectId: string;
  name: string;
  url: string;
  defaultBranch: string;
  localPath?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Issue {
  id: string;
  tracker: TrackerKind;
  externalId: string;
  identifier: string;
  title: string;
  description?: string;
  state: string;
  priority?: number;
  labels: string[];
  assignee?: string;
  blockedBy: string[];
  url?: string;
  repoRefs: string[];
  raw?: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkItem {
  id: string;
  issueId: string;
  projectId: string;
  status: WorkItemStatus;
  desiredState?: string;
  claimedBy?: string;
  lastRunId?: string;
  retryCount: number;
  nextAttemptAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface DispatchControl {
  projectId: string;
  paused: boolean;
  pausedBy?: string;
  pausedReason?: string;
  pausedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IssueSummary {
  id: string;
  identifier: string;
  title: string;
  state: string;
  url?: string;
}

export interface RunSummary {
  id: string;
  status: RunStatus;
  agentRuntime: string;
  workspacePath: string;
  startedAt: Date;
  endedAt?: Date;
}

export interface RunEventSummary {
  type: string;
  level: EventLevel;
  message: string;
  createdAt: Date;
}

export interface WorkItemSummary {
  id: string;
  status: WorkItemStatus;
  issue: IssueSummary;
  latestRun?: RunSummary;
  eventCount: number;
  lastEvent?: RunEventSummary;
  claimedBy?: string;
  retryCount: number;
  updatedAt: Date;
}

export interface Run {
  id: string;
  workItemId: string;
  attempt: number;
  workspacePath: string;
  agentRuntime: string;
  status: RunStatus;
  exitReason?: string;
  lastHeartbeatAt?: Date;
  tokenUsage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  costEstimate?: {
    currency: "USD";
    amount: number;
  };
  startedAt: Date;
  endedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Artifact {
  id: string;
  runId: string;
  type: ArtifactType;
  uri: string;
  summary?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface RunEvent {
  id: string;
  projectId?: string;
  workItemId?: string;
  runId?: string;
  type: string;
  level: EventLevel;
  message: string;
  payload?: Record<string, unknown>;
  createdAt: Date;
}

export interface ReviewPacket {
  summary: string;
  tests: string[];
  risks: string[];
  followUps: string[];
  artifacts: Artifact[];
}

export interface OperatorActionResult {
  action: OperatorActionName;
  workItem: WorkItem;
  fromStatus: WorkItemStatus;
  toStatus: WorkItemStatus;
  message: string;
}

export interface DispatchActionResult {
  action: DispatchActionName;
  dispatch: DispatchControl;
  affectedWorkItemCount: number;
  message: string;
}

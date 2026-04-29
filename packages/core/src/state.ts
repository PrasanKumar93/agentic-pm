import type { Issue, RunStatus, WorkItem, WorkItemStatus } from "./models.js";

export const terminalWorkItemStatuses: WorkItemStatus[] = [
  "failed",
  "completed",
  "cancelled"
];

export const terminalRunStatuses: RunStatus[] = [
  "failed",
  "cancelled",
  "completed",
  "waiting_for_review"
];

export function isTerminalWorkItemStatus(status: WorkItemStatus): boolean {
  return terminalWorkItemStatuses.includes(status);
}

export function isTerminalRunStatus(status: RunStatus): boolean {
  return terminalRunStatuses.includes(status);
}

export function isWorkItemRunnable(workItem: WorkItem, now = new Date()): boolean {
  if (workItem.status !== "queued") {
    return false;
  }

  if (!workItem.nextAttemptAt) {
    return true;
  }

  return workItem.nextAttemptAt.getTime() <= now.getTime();
}

export function issueIsEligible(issue: Issue, activeStates: string[]): boolean {
  return activeStates.includes(issue.state);
}

export function issueIsTerminal(issue: Issue, terminalStates: string[]): boolean {
  return terminalStates.includes(issue.state);
}

export function nextRetryAt(retryCount: number, maxBackoffMs: number, now = new Date()): Date {
  const baseMs = 10_000;
  const backoffMs = Math.min(baseMs * 2 ** retryCount, maxBackoffMs);
  return new Date(now.getTime() + backoffMs);
}

export function deriveWorkItemStatusFromRun(runStatus: RunStatus): WorkItemStatus {
  switch (runStatus) {
    case "waiting_for_review":
      return "waiting_for_review";
    case "completed":
      return "completed";
    case "cancelled":
      return "cancelled";
    case "failed":
      return "failed";
    case "retrying":
      return "queued";
    case "stalled":
      return "running";
    default:
      return "running";
  }
}

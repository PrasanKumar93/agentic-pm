import type { Issue, TrackerKind } from "@agentic-pm/core";

export interface TrackerListInput {
  activeStates: string[];
  teamKey?: string;
  projectSlug?: string;
}

export interface TrackerCommentInput {
  issueExternalId: string;
  body: string;
}

export interface TrackerStateInput {
  issueExternalId: string;
  stateName: string;
}

export interface TrackerAdapter {
  readonly kind: TrackerKind;
  listActiveIssues(input: TrackerListInput): Promise<Issue[]>;
  commentOnIssue(input: TrackerCommentInput): Promise<void>;
  moveIssue(input: TrackerStateInput): Promise<void>;
}

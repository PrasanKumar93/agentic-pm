import type { Issue } from "@agentic-pm/core";
import type { TrackerAdapter, TrackerCommentInput, TrackerListInput, TrackerStateInput } from "./types.js";

export class FakeTrackerAdapter implements TrackerAdapter {
  readonly kind = "fake" as const;

  private issues = new Map<string, Issue>();
  private comments: TrackerCommentInput[] = [];

  constructor(initialIssues: Issue[] = []) {
    for (const issue of initialIssues) {
      this.issues.set(issue.externalId, issue);
    }
  }

  async listActiveIssues(input: TrackerListInput): Promise<Issue[]> {
    return [...this.issues.values()].filter((issue) => input.activeStates.includes(issue.state));
  }

  async commentOnIssue(input: TrackerCommentInput): Promise<void> {
    this.comments.push(input);
  }

  async moveIssue(input: TrackerStateInput): Promise<void> {
    const issue = this.issues.get(input.issueExternalId);
    if (!issue) {
      throw new Error(`Fake issue ${input.issueExternalId} not found`);
    }

    this.issues.set(input.issueExternalId, {
      ...issue,
      state: input.stateName,
      updatedAt: new Date()
    });
  }

  getComments(): TrackerCommentInput[] {
    return [...this.comments];
  }
}

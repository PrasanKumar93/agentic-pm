import { createId, type Issue } from "@agentic-pm/core";
import type { TrackerAdapter, TrackerCommentInput, TrackerListInput, TrackerStateInput } from "./types.js";

interface LinearClientConfig {
  apiKey: string;
  endpoint?: string;
}

interface LinearIssueNode {
  id: string;
  identifier: string;
  title: string;
  description?: string | null;
  url?: string | null;
  priority?: number | null;
  state?: {
    id: string;
    name: string;
  } | null;
  labels?: {
    nodes: Array<{ name: string }>;
  };
  assignee?: {
    name?: string | null;
    email?: string | null;
  } | null;
  relations?: {
    nodes: Array<{
      relatedIssue?: {
        id: string;
      } | null;
    }>;
  };
  createdAt: string;
  updatedAt: string;
}

export class LinearTrackerAdapter implements TrackerAdapter {
  readonly kind = "linear" as const;

  private readonly endpoint: string;
  private readonly apiKey: string;

  constructor(config: LinearClientConfig) {
    this.endpoint = config.endpoint ?? "https://api.linear.app/graphql";
    this.apiKey = config.apiKey;
  }

  async listActiveIssues(input: TrackerListInput): Promise<Issue[]> {
    if (!input.teamKey) {
      throw new Error("Linear team key is required to list active issues");
    }

    const query = `
      query AgenticActiveIssues($teamKey: String!, $states: [String!]) {
        issues(
          first: 50,
          filter: {
            team: { key: { eq: $teamKey } },
            state: { name: { in: $states } }
          }
        ) {
          nodes {
            id
            identifier
            title
            description
            url
            priority
            createdAt
            updatedAt
            state { id name }
            labels { nodes { name } }
            assignee { name email }
            relations { nodes { relatedIssue { id } } }
          }
        }
      }
    `;

    const data = await this.request<{ issues: { nodes: LinearIssueNode[] } }>(query, {
      teamKey: input.teamKey,
      states: input.activeStates
    });

    return data.issues.nodes.map((issue) => this.normalizeIssue(issue));
  }

  async commentOnIssue(input: TrackerCommentInput): Promise<void> {
    const mutation = `
      mutation AgenticComment($issueId: String!, $body: String!) {
        commentCreate(input: { issueId: $issueId, body: $body }) {
          success
        }
      }
    `;

    await this.request(mutation, {
      issueId: input.issueExternalId,
      body: input.body
    });
  }

  async moveIssue(input: TrackerStateInput): Promise<void> {
    const stateId = await this.findStateId(input.stateName);
    const mutation = `
      mutation AgenticMoveIssue($issueId: String!, $stateId: String!) {
        issueUpdate(id: $issueId, input: { stateId: $stateId }) {
          success
        }
      }
    `;

    await this.request(mutation, {
      issueId: input.issueExternalId,
      stateId
    });
  }

  private normalizeIssue(issue: LinearIssueNode): Issue {
    return {
      id: createId("issue"),
      tracker: "linear",
      externalId: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description ?? undefined,
      state: issue.state?.name ?? "Unknown",
      priority: issue.priority ?? undefined,
      labels: issue.labels?.nodes.map((label) => label.name) ?? [],
      assignee: issue.assignee?.email ?? issue.assignee?.name ?? undefined,
      blockedBy: issue.relations?.nodes.flatMap((relation) => relation.relatedIssue?.id ?? []) ?? [],
      url: issue.url ?? undefined,
      repoRefs: [],
      raw: issue,
      createdAt: new Date(issue.createdAt),
      updatedAt: new Date(issue.updatedAt)
    };
  }

  private async findStateId(name: string): Promise<string> {
    const query = `
      query AgenticWorkflowStates($name: String!) {
        workflowStates(filter: { name: { eq: $name } }, first: 1) {
          nodes { id }
        }
      }
    `;

    const data = await this.request<{ workflowStates: { nodes: Array<{ id: string }> } }>(query, {
      name
    });

    const stateId = data.workflowStates.nodes[0]?.id;
    if (!stateId) {
      throw new Error(`Linear workflow state not found: ${name}`);
    }

    return stateId;
  }

  private async request<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: this.apiKey
      },
      body: JSON.stringify({ query, variables })
    });

    if (!response.ok) {
      throw new Error(`Linear request failed: ${response.status} ${response.statusText}`);
    }

    const payload = (await response.json()) as {
      data?: T;
      errors?: Array<{ message: string }>;
    };

    if (payload.errors?.length) {
      throw new Error(`Linear GraphQL error: ${payload.errors.map((error) => error.message).join("; ")}`);
    }

    if (!payload.data) {
      throw new Error("Linear GraphQL response did not include data");
    }

    return payload.data;
  }
}

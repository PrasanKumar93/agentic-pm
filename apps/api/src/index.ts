import { createHmac, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import cors from "@fastify/cors";
import { config as loadDotenv } from "dotenv";
import Fastify, { type FastifyRequest } from "fastify";
import {
  loadWorkflowDocument,
  readResolvedTrackerConfig,
  type WorkflowDocument,
} from "@agentic-pm/config";
import type {
  Artifact,
  ArtifactType,
  DesiredAgentRuntime,
  DispatchActionName,
  Issue,
  OperatorActionName,
  OperatorActionResult,
  PullRequestMode,
  RepositoryRef,
  RunEvent,
  TrackerKind,
} from "@agentic-pm/core";
import { slugify } from "@agentic-pm/core";
import {
  AgenticRepository,
  connectMongo,
  ensureIndexes,
  getCollections,
  InvalidWorkItemActionError,
  readMongoConfig,
  RepositoryNotFoundError,
  type WebhookDeliveryStatus,
  WorkItemNotFoundError,
} from "@agentic-pm/db";
import { checkRepositoryConnectivity } from "@agentic-pm/git";
import {
  LinearTrackerAdapter,
  normalizeLinearIssue,
  type LinearIssueNode,
} from "@agentic-pm/trackers";
import {
  fetchGithubPullRequestStatus,
  parseGithubPullRequestUrl,
} from "./github-pr.js";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
loadDotenv({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });

const host = process.env.API_HOST ?? "0.0.0.0";
const port = Number(process.env.API_PORT ?? 4000);
const projectId = process.env.AGENTIC_PM_PROJECT_ID ?? "project_local";
const projectSlug = process.env.AGENTIC_PM_PROJECT_SLUG ?? "local";
const workflowRoot = resolve(
  process.env.AGENTIC_PM_WORKFLOW_ROOT ?? `${repoRoot}/examples/workflow`,
);
const trackerConfig = readResolvedTrackerConfig();
const linearConfig = trackerConfig.linear;
const linearWebhookSecret = process.env.LINEAR_WEBHOOK_SECRET;
const linearWebhookToleranceMs = readPositiveNumber(
  process.env.LINEAR_WEBHOOK_TOLERANCE_MS,
  60_000,
);

type RepositoryConfigurationBody = {
  actorId?: string;
  defaultBranch?: string;
  id?: string;
  localPath?: string;
  name?: string;
  projectId?: string;
  pullRequest?: {
    baseBranch?: string;
    branch?: {
      includeTimestamp?: boolean;
      maxLength?: number;
      prefix?: string;
    };
    draft?: boolean;
    ghCommand?: string;
    mode?: string;
    remoteName?: string;
  };
  url?: string;
};

type RepositoryArchiveBody = {
  actorId?: string;
  confirmationName?: string;
  projectId?: string;
  reason?: string;
};

type RepositoryConnectivityBody = RepositoryConfigurationBody & {
  repositoryId?: string;
  timeoutMs?: number;
};

type RepositoryConnectivityStatus = "ok" | "warn" | "error";

type RepositoryConnectivityCheckSummary = {
  name: string;
  status: RepositoryConnectivityStatus;
  message: string;
};

const mongo = await connectMongo(readMongoConfig());
const collections = getCollections(mongo.db);
await ensureIndexes(collections);

const repository = new AgenticRepository(mongo.db);
const defaultRepository = readDefaultRepositoryRef(
  projectId,
  projectSlug,
  repoRoot,
);
await ensureDefaultRepositoryForProject(projectId);
const app = Fastify({
  logger: true,
});
const allowedOperatorActions = new Set<OperatorActionName>([
  "start",
  "retry",
  "request_changes",
  "pause",
  "resume",
  "cancel",
  "complete",
]);
const allowedDispatchActions = new Set<DispatchActionName>([
  "pause",
  "resume",
  "start_eligible",
]);
const allowedDesiredRuntimes = new Set<DesiredAgentRuntime>([
  "fake",
  "codex",
  "cursor",
  "generic",
]);
const allowedPullRequestModes = new Set<PullRequestMode>([
  "disabled",
  "local_draft",
  "github_draft",
]);
const readableTextArtifactTypes = new Set<ArtifactType>([
  "log",
  "patch",
  "pr",
  "test_report",
  "review_packet",
  "plan",
]);
type IntegrationHealthStatus = "ok" | "warn" | "error";
type LinearVerificationStatus =
  | "disabled"
  | "missing_config"
  | "verified"
  | "missing_states"
  | "failed";
type OperatorTrackerSyncReason =
  | "operator_cancel"
  | "operator_complete"
  | "operator_request_changes";

type LinearVerificationHealth = {
  status: LinearVerificationStatus;
  checkedAt?: string;
  message: string;
  team?: {
    id: string;
    key: string;
    name: string;
  };
  matchedStateNames: string[];
  missingStateNames: string[];
  availableStateNames: string[];
  error?: string;
};

type LinearWebhookSetupStatus =
  | "disabled"
  | "missing_secret"
  | "local_only"
  | "ready";

type LinearWebhookSetupHealth = {
  status: LinearWebhookSetupStatus;
  message: string;
  endpointPath: string;
  localCallbackUrl: string;
  publicCallbackUrl?: string;
  publicCallbackConfigured: boolean;
  secretConfigured: boolean;
  toleranceMs: number;
  signatureHeader: string;
  deliveryHeader: string;
  timestampField: string;
};

type RuntimeHealth = {
  kind: DesiredAgentRuntime;
  status: IntegrationHealthStatus;
  message: string;
  configError?: string;
  workflow: {
    root: string;
    loaded: boolean;
    path?: string;
    error?: string;
  };
  codex: {
    enabled: boolean;
    command: string;
    args: string[];
    approvalPolicy?: string;
    sandbox?: string;
    skipGitRepoCheck: boolean;
    model?: string;
    reasoningEffort?: string;
    apiKeyConfigured: boolean;
    apiKeySource?: "CODEX_API_KEY" | "OPENAI_API_KEY";
    turnTimeoutMs: number;
    stallTimeoutMs: number;
  };
  cursor: {
    enabled: boolean;
    command: string;
    args?: string[];
    outputFormat: "text" | "json" | "stream-json";
    sandbox?: "enabled" | "disabled";
    trustWorkspace: boolean;
    force: boolean;
    model?: string;
    apiKeyConfigured: boolean;
  };
};

type OperatorTrackerSyncResult =
  | {
      attempted: false;
      status:
        | "not_applicable"
        | "disabled"
        | "missing_issue"
        | "missing_api_key";
    }
  | {
      attempted: true;
      status: "synced" | "failed";
      stateName: string;
      tracker: "linear";
    };

type RawBodyRequest = FastifyRequest & {
  rawBody?: Buffer;
};

type LinearWebhookPayload = {
  action?: string;
  actor?: unknown;
  createdAt?: string;
  data?: unknown;
  organizationId?: string;
  type?: string;
  updatedFrom?: unknown;
  url?: string;
  webhookId?: string;
  webhookTimestamp?: number;
};

type LinearWebhookContext = {
  deliveryId?: string;
  event?: string;
};

type LinearWebhookNormalizationResult =
  | {
      status: "ignored";
      reason: "not_issue_event" | "unsupported_action";
    }
  | {
      status: "failed";
      reason: "invalid_issue_payload";
    }
  | {
      status: "reconciled";
      active: boolean;
      issueId: string;
      issueIdentifier: string;
      issueExternalId: string;
      state: string;
      workItemId?: string;
    };

type LinearWebhookResponseResult =
  | LinearWebhookNormalizationResult
  | {
      status: "duplicate";
      deliveryId: string;
      originalStatus: WebhookDeliveryStatus;
      result?: Record<string, unknown>;
    };

type VerificationResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      error: string;
      statusCode: number;
    };

app.removeContentTypeParser("application/json");
app.addContentTypeParser(
  "application/json",
  { parseAs: "buffer" },
  (request, body, done) => {
    const rawBody = body as Buffer;
    (request as RawBodyRequest).rawBody = rawBody;

    if (rawBody.length === 0) {
      done(null, {});
      return;
    }

    try {
      done(null, JSON.parse(rawBody.toString("utf8")));
    } catch (error) {
      done(error as Error, undefined);
    }
  },
);

await app.register(cors, {
  origin: true,
});

app.get("/health", async () => {
  await mongo.db.command({ ping: 1 });
  return {
    ok: true,
    service: "agentic-pm-api",
    time: new Date().toISOString(),
  };
});

app.get("/integrations/health", async () => {
  return {
    data: await buildIntegrationHealth(),
    meta: {
      generatedAt: new Date().toISOString(),
    },
  };
});

app.get("/projects", async () => {
  return {
    data: await repository.listProjectOptions(projectId),
    meta: {
      defaultProjectId: projectId,
      generatedAt: new Date().toISOString(),
    },
  };
});

app.get("/repositories", async (request) => {
  const requestedProjectId =
    readProjectId((request.query as { projectId?: string }).projectId) ??
    projectId;
  await ensureDefaultRepositoryForProject(requestedProjectId);
  const data = await repository.listRepositoryOptions(requestedProjectId);

  return {
    data,
    meta: {
      projectId: requestedProjectId,
      defaultRepositoryId: data.find((option) => option.isDefault)?.id,
      generatedAt: new Date().toISOString(),
    },
  };
});

app.post("/repositories", async (request, reply) => {
  const body = (request.body ?? {}) as RepositoryConfigurationBody;
  const requestedProjectId = readProjectId(body.projectId) ?? projectId;
  await ensureDefaultRepositoryForProject(requestedProjectId);

  const name = readRequiredText(body.name, 120);
  const url = readRequiredText(body.url, 2_000);
  if (!name || !url) {
    return reply.code(400).send({
      error: "Repository name and URL are required.",
    });
  }

  const now = new Date();
  const repositoryRef = await repository.ensureRepository({
    id:
      readRepositoryId(body.id) ?? createRepositoryId(requestedProjectId, name),
    projectId: requestedProjectId,
    name,
    url,
    defaultBranch: readRequiredText(body.defaultBranch, 120) ?? "main",
    localPath: readOptionalText(body.localPath, 2_000),
    pullRequest: readPullRequestSettings(body.pullRequest),
    createdAt: now,
    updatedAt: now,
  });

  await repository.appendEvent({
    projectId: requestedProjectId,
    type: "repository.configured",
    level: "info",
    message: `${body.actorId || "local-operator"} configured ${repositoryRef.name}`,
    payload: {
      actorId: body.actorId,
      repositoryId: repositoryRef.id,
      repositoryName: repositoryRef.name,
      url: repositoryRef.url,
      defaultBranch: repositoryRef.defaultBranch,
      hasLocalPath: Boolean(repositoryRef.localPath),
      pullRequestMode: repositoryRef.pullRequest?.mode,
    },
  });

  const options = await repository.listRepositoryOptions(requestedProjectId);
  const data = options.find((option) => option.id === repositoryRef.id);

  return reply.code(201).send({
    data: data ?? repositoryRef,
    meta: {
      action: "repository.configure",
      projectId: requestedProjectId,
      generatedAt: new Date().toISOString(),
    },
  });
});

app.patch("/repositories/:repositoryId", async (request, reply) => {
  const { repositoryId } = request.params as { repositoryId: string };
  const body = (request.body ?? {}) as RepositoryConfigurationBody;
  const requestedProjectId = readProjectId(body.projectId) ?? projectId;
  const safeRepositoryId = readRepositoryId(repositoryId);
  await ensureDefaultRepositoryForProject(requestedProjectId);

  if (!safeRepositoryId) {
    return reply.code(400).send({
      error: "A valid repository id is required.",
    });
  }

  const existing = await repository.getRepository(
    safeRepositoryId,
    requestedProjectId,
  );
  if (!existing) {
    return reply.code(404).send({
      error: `Repository not found: ${safeRepositoryId}`,
    });
  }

  const name = readRequiredText(body.name, 120);
  const url = readRequiredText(body.url, 2_000);
  if (!name || !url) {
    return reply.code(400).send({
      error: "Repository name and URL are required.",
    });
  }

  const repositoryRef = await repository.ensureRepository({
    id: existing.id,
    projectId: requestedProjectId,
    name,
    url,
    defaultBranch: readRequiredText(body.defaultBranch, 120) ?? "main",
    localPath: readOptionalText(body.localPath, 2_000),
    pullRequest: readPullRequestSettings(body.pullRequest),
    createdAt: existing.createdAt,
    updatedAt: new Date(),
  });

  await repository.appendEvent({
    projectId: requestedProjectId,
    type: "repository.configured",
    level: "info",
    message: `${body.actorId || "local-operator"} updated ${repositoryRef.name}`,
    payload: {
      actorId: body.actorId,
      repositoryId: repositoryRef.id,
      repositoryName: repositoryRef.name,
      url: repositoryRef.url,
      defaultBranch: repositoryRef.defaultBranch,
      hasLocalPath: Boolean(repositoryRef.localPath),
      pullRequestMode: repositoryRef.pullRequest?.mode,
    },
  });

  const options = await repository.listRepositoryOptions(requestedProjectId);
  const data = options.find((option) => option.id === repositoryRef.id);

  return {
    data: data ?? repositoryRef,
    meta: {
      action: "repository.update",
      projectId: requestedProjectId,
      generatedAt: new Date().toISOString(),
    },
  };
});

app.post("/repositories/connectivity-check", async (request, reply) => {
  const body = (request.body ?? {}) as RepositoryConnectivityBody;
  const name = readRequiredText(body.name, 120);
  const url = readRequiredText(body.url, 2_000);
  const safeRepositoryId = readRepositoryId(body.repositoryId ?? body.id);
  if (!name || !url) {
    return reply.code(400).send({
      error: "Repository name and URL are required.",
    });
  }

  const result = await checkRepositoryConnectivity({
    url,
    defaultBranch: readRequiredText(body.defaultBranch, 120) ?? "main",
    localPath: readOptionalText(body.localPath, 2_000),
    pullRequest: readPullRequestSettings(body.pullRequest),
    timeoutMs: readPositiveNumber(body.timeoutMs, 5_000),
  });

  await repository.appendEvent({
    projectId: readProjectId(body.projectId) ?? projectId,
    type: "repository.connectivity_checked",
    level: result.status === "error" ? "warn" : "info",
    message: `${body.actorId || "local-operator"} checked ${name} repository connectivity`,
    payload: {
      actorId: body.actorId,
      repositoryId: safeRepositoryId,
      repositoryName: name,
      status: result.status,
      checks: result.checks.map((check) => ({
        name: check.name,
        status: check.status,
        message: check.message,
      })),
      hasLocalPath: Boolean(body.localPath),
      pullRequestMode: body.pullRequest?.mode,
    },
  });

  return {
    data: {
      name,
      status: result.status,
      checks: result.checks,
    },
    meta: {
      action: "repository.connectivity_check",
      generatedAt: new Date().toISOString(),
    },
  };
});

app.get("/repositories/connectivity-checks", async (request) => {
  const query = request.query as {
    limit?: string;
    projectId?: string;
    repositoryId?: string;
  };
  const requestedProjectId = readProjectId(query.projectId) ?? projectId;
  const requestedRepositoryId = readRepositoryId(query.repositoryId);
  const limit = Math.min(readPositiveNumber(query.limit, 5), 25);
  const events = await repository.listProjectEvents({
    projectId: requestedProjectId,
    repositoryId: requestedRepositoryId,
    type: "repository.connectivity_checked",
    limit,
  });

  return {
    data: events.map(toRepositoryConnectivityCheckSummary),
    meta: {
      limit,
      projectId: requestedProjectId,
      repositoryId: requestedRepositoryId,
      generatedAt: new Date().toISOString(),
    },
  };
});

app.post("/repositories/:repositoryId/archive", async (request, reply) => {
  const { repositoryId } = request.params as { repositoryId: string };
  const body = (request.body ?? {}) as RepositoryArchiveBody;
  const requestedProjectId = readProjectId(body.projectId) ?? projectId;
  const safeRepositoryId = readRepositoryId(repositoryId);

  if (!safeRepositoryId) {
    return reply.code(400).send({
      error: "A valid repository id is required.",
    });
  }

  const existing = await repository.getRepository(
    safeRepositoryId,
    requestedProjectId,
  );
  if (!existing) {
    return reply.code(404).send({
      error: `Repository not found: ${safeRepositoryId}`,
    });
  }

  const confirmationName = readRequiredText(body.confirmationName, 120);
  if (confirmationName !== existing.name) {
    return reply.code(400).send({
      error: `Type ${existing.name} to archive this repository.`,
    });
  }

  const repositoryRef = await repository.archiveRepository({
    projectId: requestedProjectId,
    repositoryId: existing.id,
    actorId: body.actorId,
    reason: readOptionalText(body.reason, 500),
  });

  return {
    data: repositoryRef,
    meta: {
      action: "repository.archive",
      projectId: requestedProjectId,
      generatedAt: new Date().toISOString(),
    },
  };
});

app.get("/work-items", async (request) => {
  const query = request.query as { limit?: string; projectId?: string };
  const requestedLimit = Number(query.limit ?? 50);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), 100)
    : 50;
  const requestedProjectId = readProjectId(query.projectId);
  const data = await repository.listWorkItemSummaries(
    limit,
    requestedProjectId,
  );

  return {
    data,
    meta: {
      limit,
      count: data.length,
      projectId: requestedProjectId ?? "all",
      defaultProjectId: projectId,
      generatedAt: new Date().toISOString(),
    },
  };
});

app.post("/work-items", async (request, reply) => {
  const body = (request.body ?? {}) as {
    actorId?: string;
    description?: string;
    desiredRuntime?: string | null;
    projectId?: string;
    repositoryId?: string;
    title?: string;
  };
  const title = readRequiredText(body.title, 180);
  if (!title) {
    return reply.code(400).send({
      error: "Work item title is required.",
    });
  }

  const requestedProjectId = readProjectId(body.projectId) ?? projectId;
  await ensureDefaultRepositoryForProject(requestedProjectId);
  const repositoryId = readRepositoryId(body.repositoryId);
  if (!repositoryId) {
    return reply.code(400).send({
      error: "Choose a valid repository.",
    });
  }

  if (!isRuntimePreferenceInput(body.desiredRuntime)) {
    return reply.code(400).send({
      error: `Unknown runtime preference: ${String(body.desiredRuntime)}`,
    });
  }

  try {
    const workItem = await repository.createLocalWorkItem({
      projectId: requestedProjectId,
      repositoryId,
      title,
      description: readOptionalText(body.description, 8_000),
      desiredRuntime: readDesiredRuntime(body.desiredRuntime),
      actorId: body.actorId,
    });
    const data = await repository.getWorkItemSummary(workItem.id);
    if (!data) {
      return reply.code(404).send({
        error: `Work item not found: ${workItem.id}`,
      });
    }

    return reply.code(201).send({
      data,
      meta: {
        action: "work_item.create",
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof RepositoryNotFoundError) {
      return reply.code(404).send({
        error: error.message,
      });
    }

    throw error;
  }
});

app.get("/dispatch-control", async (request) => {
  const requestedProjectId =
    readProjectId((request.query as { projectId?: string }).projectId) ??
    projectId;

  return {
    data: await repository.getDispatchControl(requestedProjectId),
    meta: {
      projectId: requestedProjectId,
      generatedAt: new Date().toISOString(),
    },
  };
});

app.post("/dispatch-control/actions/:action", async (request, reply) => {
  const { action } = request.params as {
    action: string;
  };

  if (!allowedDispatchActions.has(action as DispatchActionName)) {
    return reply.code(400).send({
      error: `Unknown dispatch action: ${action}`,
    });
  }

  const body = (request.body ?? {}) as {
    actorId?: string;
    projectId?: string;
    reason?: string;
  };
  const actionProjectId = readProjectId(body.projectId) ?? projectId;

  const result = await repository.performDispatchAction({
    projectId: actionProjectId,
    action: action as DispatchActionName,
    actorId: body.actorId,
    reason: body.reason,
  });

  return {
    data: result,
    meta: {
      action,
      projectId: actionProjectId,
      generatedAt: new Date().toISOString(),
    },
  };
});

app.post("/work-items/:workItemId/actions/:action", async (request, reply) => {
  const { workItemId, action } = request.params as {
    workItemId: string;
    action: string;
  };

  if (!allowedOperatorActions.has(action as OperatorActionName)) {
    return reply.code(400).send({
      error: `Unknown work item action: ${action}`,
    });
  }

  const body = (request.body ?? {}) as {
    actorId?: string;
    desiredRuntime?: string | null;
    feedback?: string;
    reason?: string;
  };

  try {
    if (
      action === "request_changes" &&
      !isRuntimePreferenceInput(body.desiredRuntime)
    ) {
      return reply.code(400).send({
        error: `Unknown runtime preference: ${String(body.desiredRuntime)}`,
      });
    }

    const result =
      action === "request_changes"
        ? await repository.requestWorkItemChanges({
            workItemId,
            actorId: body.actorId,
            desiredRuntime: readDesiredRuntime(body.desiredRuntime),
            feedback: readRequiredText(body.feedback, 4_000) ?? "",
          })
        : await repository.performWorkItemAction({
            workItemId,
            action: action as OperatorActionName,
            actorId: body.actorId,
            reason: body.reason,
          });
    const trackerSync = await syncOperatorActionTrackerState({
      action: action as OperatorActionName,
      actorId: body.actorId,
      reason: body.reason,
      result,
    });

    const data = await repository.getWorkItemSummary(workItemId);
    if (!data) {
      return reply.code(404).send({
        error: `Work item not found: ${workItemId}`,
      });
    }

    return {
      data,
      meta: {
        action,
        trackerSync,
        generatedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    if (error instanceof WorkItemNotFoundError) {
      return reply.code(404).send({
        error: error.message,
      });
    }

    if (error instanceof InvalidWorkItemActionError) {
      return reply.code(409).send({
        error: error.message,
      });
    }

    throw error;
  }
});

app.post("/work-items/:workItemId/runtime", async (request, reply) => {
  const { workItemId } = request.params as {
    workItemId: string;
  };
  const body = (request.body ?? {}) as {
    actorId?: string;
    desiredRuntime?: string | null;
    reason?: string;
  };

  if (!isRuntimePreferenceInput(body.desiredRuntime)) {
    return reply.code(400).send({
      error: `Unknown runtime preference: ${String(body.desiredRuntime)}`,
    });
  }

  try {
    await repository.setWorkItemRuntimePreference({
      workItemId,
      desiredRuntime: readDesiredRuntime(body.desiredRuntime),
      actorId: body.actorId,
      reason: body.reason,
    });

    const data = await repository.getWorkItemSummary(workItemId);
    if (!data) {
      return reply.code(404).send({
        error: `Work item not found: ${workItemId}`,
      });
    }

    return {
      data,
      meta: {
        action: "runtime.select",
        generatedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    if (error instanceof WorkItemNotFoundError) {
      return reply.code(404).send({
        error: error.message,
      });
    }

    if (error instanceof InvalidWorkItemActionError) {
      return reply.code(409).send({
        error: error.message,
      });
    }

    throw error;
  }
});

app.get("/runs/:runId/events", async (request) => {
  const { runId } = request.params as { runId: string };
  return {
    data: await repository.listRunEvents(runId),
  };
});

app.get("/runs/:runId/artifacts", async (request) => {
  const { runId } = request.params as { runId: string };
  return {
    data: await repository.listArtifacts(runId),
  };
});

app.get("/work-items/:workItemId/review-feedback", async (request) => {
  const { workItemId } = request.params as { workItemId: string };
  const query = request.query as { limit?: string };
  const requestedLimit = Number(query.limit ?? 20);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), 100)
    : 20;

  return {
    data: await repository.listReviewFeedback(workItemId, limit),
    meta: {
      limit,
      generatedAt: new Date().toISOString(),
    },
  };
});

app.get("/webhook-deliveries", async (request) => {
  const query = request.query as { limit?: string; projectId?: string };
  const requestedLimit = Number(query.limit ?? 50);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), 100)
    : 50;
  const requestedProjectId = query.projectId?.trim() || undefined;

  return {
    data: await repository.listWebhookDeliveries(limit, requestedProjectId),
    meta: {
      limit,
      projectId: requestedProjectId ?? "all",
      generatedAt: new Date().toISOString(),
    },
  };
});

app.get("/artifacts/:artifactId/content", async (request, reply) => {
  const { artifactId } = request.params as { artifactId: string };
  const artifact = await repository.getArtifact(artifactId);

  if (!artifact) {
    return reply.code(404).send({
      error: `Artifact not found: ${artifactId}`,
    });
  }

  if (!isReadableLocalTextArtifact(artifact)) {
    return reply.code(415).send({
      error: `Artifact content is not readable through this endpoint: ${artifactId}`,
    });
  }

  try {
    const content = await readFile(artifact.uri, "utf8");
    return reply
      .type(contentTypeForArtifact(artifact.type))
      .header(
        "content-disposition",
        `inline; filename="${artifactFileName(artifact)}"`,
      )
      .send(content);
  } catch (error) {
    app.log.warn({ artifactId, error }, "Could not read artifact content");
    return reply.code(404).send({
      error: `Artifact content not found: ${artifactId}`,
    });
  }
});

app.get("/artifacts/:artifactId/pr-status", async (request, reply) => {
  const { artifactId } = request.params as { artifactId: string };
  const artifact = await repository.getArtifact(artifactId);

  if (!artifact) {
    return reply.code(404).send({
      error: `Artifact not found: ${artifactId}`,
    });
  }

  if (artifact.type !== "pr") {
    return reply.code(409).send({
      error: "Only pull request artifacts expose PR status.",
    });
  }

  const remotePrUrl = readMetadataString(artifact.metadata, "remotePrUrl");
  if (!remotePrUrl) {
    return reply.code(409).send({
      error: "Pull request artifact is not linked to a remote PR.",
    });
  }

  const coordinates = parseGithubPullRequestUrl(remotePrUrl);
  if (!coordinates) {
    return reply.code(422).send({
      error: "Only github.com pull request URLs can be checked.",
    });
  }

  return {
    data: await fetchGithubPullRequestStatus(coordinates, {
      token: readGithubApiToken(),
    }),
    meta: {
      artifactId,
      generatedAt: new Date().toISOString(),
    },
  };
});

app.post("/artifacts/:artifactId/link-pr", async (request, reply) => {
  const { artifactId } = request.params as { artifactId: string };
  const body = (request.body ?? {}) as {
    actorId?: string;
    remoteBaseBranch?: string;
    remoteBranchName?: string;
    remoteDraft?: boolean;
    remoteName?: string;
    remotePrUrl?: string;
    remoteState?: string;
  };
  const remotePrUrl = readRemotePrUrl(body.remotePrUrl);

  if (!remotePrUrl) {
    return reply.code(400).send({
      error: "A valid http(s) pull request URL is required.",
    });
  }

  const artifact = await repository.getArtifact(artifactId);
  if (!artifact) {
    return reply.code(404).send({
      error: `Artifact not found: ${artifactId}`,
    });
  }

  if (artifact.type !== "pr") {
    return reply.code(409).send({
      error: "Only pull request artifacts can be linked to a remote PR.",
    });
  }

  const updated = await repository.linkPullRequestArtifact({
    actorId: readOptionalText(body.actorId, 120),
    artifactId,
    remoteBaseBranch: readOptionalText(body.remoteBaseBranch, 120),
    remoteBranchName: readOptionalText(body.remoteBranchName, 240),
    remoteDraft:
      typeof body.remoteDraft === "boolean" ? body.remoteDraft : undefined,
    remoteName: readOptionalText(body.remoteName, 120) ?? "origin",
    remotePrUrl,
    remoteState: readOptionalText(body.remoteState, 80),
  });

  return {
    data: updated,
    meta: {
      action: "artifact.pr.link",
      artifactId,
      generatedAt: new Date().toISOString(),
    },
  };
});

app.post("/webhooks/linear", async (request, reply) => {
  const body = (request.body ?? {}) as LinearWebhookPayload;
  const verification = verifyLinearWebhook(request as RawBodyRequest, body);
  if (!verification.ok) {
    return reply.code(verification.statusCode).send({
      error: verification.error,
    });
  }

  const context: LinearWebhookContext = {
    deliveryId: firstHeader(request.headers["linear-delivery"]),
    event: firstHeader(request.headers["linear-event"]),
  };
  const deliveryId = context.deliveryId;

  const deliveryClaim = deliveryId
    ? await repository.claimWebhookDelivery({
        projectId,
        provider: "linear",
        deliveryId,
        event: context.event,
        action: body.action,
        type: body.type,
      })
    : undefined;

  if (deliveryClaim && !deliveryClaim.claimed) {
    const duplicateResult: LinearWebhookResponseResult = {
      status: "duplicate",
      deliveryId: deliveryClaim.delivery.deliveryId,
      originalStatus: deliveryClaim.delivery.status,
      result: deliveryClaim.delivery.result,
    };

    await repository.appendEvent({
      projectId,
      type: "tracker.linear.webhook.duplicate",
      level: "info",
      message: "Ignored duplicate Linear webhook delivery",
      payload: {
        action: body.action,
        deliveryId: deliveryClaim.delivery.deliveryId,
        event: context.event,
        originalStatus: deliveryClaim.delivery.status,
        type: body.type,
      },
    });

    return {
      ok: true,
      data: duplicateResult,
    };
  }

  await repository.appendEvent({
    projectId,
    type: "tracker.linear.webhook.received",
    level: "info",
    message: "Received Linear webhook",
    payload: {
      action: body.action,
      body: request.body,
      deliveryId: context.deliveryId,
      deliveryStatus: context.deliveryId ? "claimed" : "missing_delivery_id",
      event: context.event,
      type: body.type,
      url: body.url,
    },
  });

  const normalization = await normalizeLinearWebhookPayload(body, context);
  if (deliveryId) {
    await repository.completeWebhookDelivery({
      provider: "linear",
      deliveryId,
      status: webhookDeliveryStatusForNormalization(normalization),
      result: webhookDeliveryResult(normalization),
    });
  }

  return {
    ok: true,
    data: normalization,
  };
});

const shutdown = async () => {
  app.log.info("Shutting down API");
  await app.close();
  await mongo.client.close();
};

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

await app.listen({ host, port });

function verifyLinearWebhook(
  request: RawBodyRequest,
  payload: LinearWebhookPayload,
): VerificationResult {
  if (!linearWebhookSecret) {
    return {
      ok: false,
      error: "Linear webhook secret is not configured",
      statusCode: 503,
    };
  }

  const rawBody = request.rawBody;
  if (!rawBody) {
    return {
      ok: false,
      error: "Raw request body is unavailable",
      statusCode: 400,
    };
  }

  const signature = firstHeader(request.headers["linear-signature"]);
  if (
    !signature ||
    !verifyHmacSignature(rawBody, signature, linearWebhookSecret)
  ) {
    return {
      ok: false,
      error: "Invalid Linear webhook signature",
      statusCode: 401,
    };
  }

  if (!Number.isFinite(payload.webhookTimestamp)) {
    return {
      ok: false,
      error: "Linear webhook timestamp is missing",
      statusCode: 401,
    };
  }

  const skewMs = Math.abs(Date.now() - Number(payload.webhookTimestamp));
  if (skewMs > linearWebhookToleranceMs) {
    return {
      ok: false,
      error: "Linear webhook timestamp is outside the allowed tolerance",
      statusCode: 401,
    };
  }

  return { ok: true };
}

function verifyHmacSignature(
  rawBody: Buffer,
  signature: string,
  secret: string,
): boolean {
  if (!/^[0-9a-f]+$/i.test(signature) || signature.length !== 64) {
    return false;
  }

  const headerSignature = Buffer.from(signature, "hex");
  const computedSignature = createHmac("sha256", secret)
    .update(rawBody)
    .digest();

  if (headerSignature.length !== computedSignature.length) {
    return false;
  }

  return timingSafeEqual(computedSignature, headerSignature);
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function readPositiveNumber(
  value: number | string | undefined,
  fallback: number,
): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function readRuntimeKind(): DesiredAgentRuntime {
  const requestedRuntime = process.env.AGENT_RUNTIME;
  return requestedRuntime === "codex" ||
    requestedRuntime === "cursor" ||
    requestedRuntime === "generic"
    ? requestedRuntime
    : "fake";
}

function readProjectId(value: string | undefined): string | undefined {
  const projectId = value?.trim();
  return projectId && /^[A-Za-z0-9_.:-]{1,128}$/.test(projectId)
    ? projectId
    : undefined;
}

function readRepositoryId(value: unknown): string | undefined {
  const repositoryId = typeof value === "string" ? value.trim() : undefined;
  return repositoryId && /^[A-Za-z0-9_.:-]{1,128}$/.test(repositoryId)
    ? repositoryId
    : undefined;
}

function readRequiredText(
  value: unknown,
  maxLength: number,
): string | undefined {
  const trimmed = typeof value === "string" ? value.trim() : undefined;
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

function readOptionalText(
  value: unknown,
  maxLength: number,
): string | undefined {
  const trimmed = typeof value === "string" ? value.trim() : undefined;
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

function readOptionalEnvText(
  value: string | undefined,
  fallback?: string,
): string | undefined {
  const trimmed = value?.trim();
  return trimmed || fallback;
}

function readCodexApiKeySource(): {
  source?: "CODEX_API_KEY" | "OPENAI_API_KEY";
} {
  if (process.env.CODEX_API_KEY?.trim()) {
    return { source: "CODEX_API_KEY" };
  }

  if (process.env.OPENAI_API_KEY?.trim()) {
    return { source: "OPENAI_API_KEY" };
  }

  return {};
}

function parseCommandArgs(
  value: string | undefined,
  fallback: string[],
): string[] {
  return parseOptionalCommandArgs(value) ?? fallback;
}

function parseOptionalCommandArgs(
  value: string | undefined,
): string[] | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed);
    if (
      !Array.isArray(parsed) ||
      !parsed.every((item) => typeof item === "string")
    ) {
      throw new Error("Command args JSON must be an array of strings.");
    }
    return parsed;
  }

  return trimmed.split(/\s+/);
}

function parseCursorOutputFormat(
  value: string | undefined,
): "text" | "json" | "stream-json" {
  return value === "text" || value === "json" || value === "stream-json"
    ? value
    : "stream-json";
}

function parseCursorSandbox(
  value: string | undefined,
): "enabled" | "disabled" | undefined {
  return value === "enabled" || value === "disabled" ? value : undefined;
}

function readPullRequestSettings(
  value:
    | {
        baseBranch?: string;
        branch?: {
          includeTimestamp?: boolean;
          maxLength?: number;
          prefix?: string;
        };
        draft?: boolean;
        ghCommand?: string;
        mode?: string;
        remoteName?: string;
      }
    | undefined,
): RepositoryRef["pullRequest"] | undefined {
  const mode = readPullRequestMode(value?.mode);
  if (!mode) {
    return undefined;
  }

  return {
    mode,
    branch: readPullRequestBranchSettings(value?.branch),
    remoteName: readOptionalText(value?.remoteName, 120),
    baseBranch: readOptionalText(value?.baseBranch, 120),
    draft: typeof value?.draft === "boolean" ? value.draft : undefined,
    ghCommand: readOptionalText(value?.ghCommand, 200),
  };
}

function readPullRequestBranchSettings(
  value:
    | {
        includeTimestamp?: boolean;
        maxLength?: number;
        prefix?: string;
      }
    | undefined,
): NonNullable<RepositoryRef["pullRequest"]>["branch"] | undefined {
  const prefix = readOptionalText(value?.prefix, 80);
  const maxLength = readOptionalRangeNumber(value?.maxLength, 32, 240);
  const includeTimestamp =
    typeof value?.includeTimestamp === "boolean"
      ? value.includeTimestamp
      : undefined;

  if (!prefix && !maxLength && includeTimestamp === undefined) {
    return undefined;
  }

  return {
    prefix,
    maxLength,
    includeTimestamp,
  };
}

function readOptionalRangeNumber(
  value: number | undefined,
  min: number,
  max: number,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return Math.min(Math.max(Math.floor(parsed), min), max);
}

function readPullRequestMode(value: unknown): PullRequestMode | undefined {
  const mode = typeof value === "string" ? value.trim() : undefined;
  return allowedPullRequestModes.has(mode as PullRequestMode)
    ? (mode as PullRequestMode)
    : undefined;
}

function toRepositoryConnectivityCheckSummary(event: RunEvent): {
  id: string;
  projectId?: string;
  repositoryId?: string;
  repositoryName: string;
  status: RepositoryConnectivityStatus;
  checks: RepositoryConnectivityCheckSummary[];
  actorId?: string;
  hasLocalPath?: boolean;
  pullRequestMode?: string;
  message: string;
  createdAt: Date;
} {
  const payload = event.payload ?? {};

  return {
    id: event.id,
    projectId: event.projectId,
    repositoryId: readPayloadText(payload.repositoryId),
    repositoryName:
      readPayloadText(payload.repositoryName) ?? "Unknown repository",
    status:
      readConnectivityStatus(payload.status) ??
      (event.level === "error"
        ? "error"
        : event.level === "warn"
          ? "warn"
          : "ok"),
    checks: Array.isArray(payload.checks)
      ? payload.checks.flatMap((check) => {
          const parsed = readConnectivityCheckSummary(check);
          return parsed ? [parsed] : [];
        })
      : [],
    actorId: readPayloadText(payload.actorId),
    hasLocalPath:
      typeof payload.hasLocalPath === "boolean"
        ? payload.hasLocalPath
        : undefined,
    pullRequestMode: readPayloadText(payload.pullRequestMode),
    message: event.message,
    createdAt: event.createdAt,
  };
}

function readConnectivityCheckSummary(
  value: unknown,
): RepositoryConnectivityCheckSummary | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const name = readPayloadText(record.name);
  const status = readConnectivityStatus(record.status);
  const message = readPayloadText(record.message);

  return name && status && message
    ? {
        name,
        status,
        message,
      }
    : undefined;
}

function readConnectivityStatus(
  value: unknown,
): RepositoryConnectivityStatus | undefined {
  return value === "ok" || value === "warn" || value === "error"
    ? value
    : undefined;
}

function readPayloadText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function readRemotePrUrl(value: unknown): string | undefined {
  const text = readRequiredText(value, 2_000);
  if (!text) {
    return undefined;
  }

  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function readMetadataString(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function readGithubApiToken(): string | undefined {
  return (
    readOptionalText(process.env.AGENTIC_PM_GITHUB_TOKEN, 4_000) ??
    readOptionalText(process.env.AGENTIC_PM_GITHUB_API_TOKEN, 4_000) ??
    readOptionalText(process.env.GITHUB_TOKEN, 4_000) ??
    readOptionalText(process.env.GH_TOKEN, 4_000)
  );
}

function isRuntimePreferenceInput(value: string | null | undefined): boolean {
  return (
    value === undefined ||
    value === null ||
    value === "" ||
    value === "default" ||
    allowedDesiredRuntimes.has(value as DesiredAgentRuntime)
  );
}

function readDesiredRuntime(
  value: string | null | undefined,
): DesiredAgentRuntime | undefined {
  return allowedDesiredRuntimes.has(value as DesiredAgentRuntime)
    ? (value as DesiredAgentRuntime)
    : undefined;
}

function createRepositoryId(selectedProjectId: string, name: string): string {
  const projectPart = slugify(selectedProjectId).slice(0, 48) || "project";
  const namePart = slugify(name).slice(0, 64) || "repository";
  return `repo_${projectPart}_${namePart}`.slice(0, 128);
}

function readDefaultRepositoryRef(
  selectedProjectId: string,
  selectedProjectSlug: string,
  root: string,
): RepositoryRef {
  const now = new Date();
  const repositoryName =
    process.env.AGENTIC_PM_REPOSITORY_NAME?.trim() ||
    basename(root) ||
    selectedProjectSlug;
  const fallbackId = `repo_${slugify(selectedProjectSlug || selectedProjectId) || "local"}`;
  return {
    id: readRepositoryId(process.env.AGENTIC_PM_REPOSITORY_ID) ?? fallbackId,
    projectId: selectedProjectId,
    name: repositoryName.slice(0, 120),
    url: process.env.AGENTIC_PM_REPOSITORY_URL?.trim() || `file://${root}`,
    defaultBranch:
      process.env.AGENTIC_PM_REPOSITORY_DEFAULT_BRANCH?.trim() || "main",
    localPath: process.env.AGENTIC_PM_REPOSITORY_LOCAL_PATH?.trim() || root,
    createdAt: now,
    updatedAt: now,
  };
}

async function ensureDefaultRepositoryForProject(
  selectedProjectId: string,
): Promise<RepositoryRef> {
  const selectedProjectSlug =
    selectedProjectId === projectId ? projectSlug : slugify(selectedProjectId);
  const selectedDefaultRepository =
    selectedProjectId === projectId
      ? defaultRepository
      : readDefaultRepositoryRef(
          selectedProjectId,
          selectedProjectSlug,
          repoRoot,
        );

  await repository.ensureProject({
    id: selectedProjectId,
    name:
      selectedProjectId === projectId
        ? (process.env.AGENTIC_PM_PROJECT_NAME ?? formatProjectName(projectId))
        : formatProjectName(selectedProjectId),
    slug: selectedProjectSlug,
    trackerKind: readTrackerKind(),
    workflowPath: process.env.AGENTIC_PM_WORKFLOW_ROOT,
  });

  if (await repository.hasRepository(selectedProjectId)) {
    return (
      (await repository.getDefaultRepository(selectedProjectId)) ??
      selectedDefaultRepository
    );
  }

  return repository.ensureRepository(selectedDefaultRepository);
}

function readTrackerKind(): TrackerKind {
  return trackerConfig.kind;
}

function formatProjectName(value: string): string {
  if (value === "project_local") {
    return "Local project";
  }

  return value
    .replace(/^project_/, "")
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function syncOperatorActionTrackerState(input: {
  action: OperatorActionName;
  actorId?: string;
  reason?: string;
  result: OperatorActionResult;
}): Promise<OperatorTrackerSyncResult> {
  const stateName = readOperatorActionTrackerState(input.action);
  if (!stateName) {
    return {
      attempted: false,
      status: "not_applicable",
    };
  }

  if (readTrackerKind() !== "linear") {
    return {
      attempted: false,
      status: "disabled",
    };
  }

  const apiKey = process.env.LINEAR_API_KEY?.trim();
  if (!apiKey) {
    await appendTrackerSyncEvent({
      issue: undefined,
      result: input.result,
      type: "tracker.issue.state_sync_failed",
      level: "warn",
      message: "Could not sync operator action to Linear",
      payload: {
        action: input.action,
        detail: "LINEAR_API_KEY is not configured",
        stateName,
        tracker: "linear",
      },
    });
    return {
      attempted: false,
      status: "missing_api_key",
    };
  }

  const issue = await repository.getIssue(input.result.workItem.issueId);
  if (!issue) {
    await appendTrackerSyncEvent({
      issue: undefined,
      result: input.result,
      type: "tracker.issue.state_sync_failed",
      level: "warn",
      message: "Could not sync operator action to Linear",
      payload: {
        action: input.action,
        detail: `Issue ${input.result.workItem.issueId} was not found`,
        stateName,
        tracker: "linear",
      },
    });
    return {
      attempted: false,
      status: "missing_issue",
    };
  }

  const tracker = new LinearTrackerAdapter({ apiKey });
  const reason = readOperatorActionTrackerReason(input.action);

  try {
    await tracker.moveIssue({
      issueExternalId: issue.externalId,
      stateName,
    });

    await repository.upsertIssue({
      ...issue,
      state: stateName,
      updatedAt: new Date(),
    });

    await appendTrackerSyncEvent({
      issue,
      result: input.result,
      type: "tracker.issue.state_synced",
      level: "info",
      message: `Synced ${issue.identifier} to ${stateName}`,
      payload: {
        action: input.action,
        actorId: input.actorId,
        issueExternalId: issue.externalId,
        issueIdentifier: issue.identifier,
        operatorReason: input.reason,
        reason,
        stateName,
        tracker: "linear",
      },
    });

    return {
      attempted: true,
      status: "synced",
      stateName,
      tracker: "linear",
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    await appendTrackerSyncEvent({
      issue,
      result: input.result,
      type: "tracker.issue.state_sync_failed",
      level: "warn",
      message: `Could not sync ${issue.identifier} to ${stateName}`,
      payload: {
        action: input.action,
        actorId: input.actorId,
        detail,
        issueExternalId: issue.externalId,
        issueIdentifier: issue.identifier,
        operatorReason: input.reason,
        reason,
        stateName,
        tracker: "linear",
      },
    });

    return {
      attempted: true,
      status: "failed",
      stateName,
      tracker: "linear",
    };
  }
}

function readOperatorActionTrackerState(
  action: OperatorActionName,
): string | undefined {
  if (action === "cancel") {
    return linearConfig.states.cancelled;
  }

  if (action === "complete") {
    return linearConfig.states.done;
  }

  if (action === "request_changes") {
    return linearConfig.activeStates[0];
  }

  return undefined;
}

function readOperatorActionTrackerReason(
  action: OperatorActionName,
): OperatorTrackerSyncReason {
  if (action === "cancel") {
    return "operator_cancel";
  }

  if (action === "request_changes") {
    return "operator_request_changes";
  }

  return "operator_complete";
}

async function appendTrackerSyncEvent(input: {
  issue: Issue | undefined;
  result: OperatorActionResult;
  type: "tracker.issue.state_synced" | "tracker.issue.state_sync_failed";
  level: RunEvent["level"];
  message: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  await repository.appendEvent({
    projectId: input.result.workItem.projectId,
    workItemId: input.result.workItem.id,
    runId: input.result.workItem.lastRunId,
    type: input.type,
    level: input.level,
    message: input.message,
    payload: {
      issueId: input.issue?.id ?? input.result.workItem.issueId,
      ...input.payload,
    },
  });
}

async function buildIntegrationHealth() {
  const trackerKind = readTrackerKind();
  const runtime = await buildRuntimeHealth();
  const linearApiKey = process.env.LINEAR_API_KEY?.trim();
  const linearTeamKey = linearConfig.teamKey;
  const linearApiKeyConfigured = Boolean(linearApiKey);
  const linearTeamKeyConfigured = Boolean(linearTeamKey);
  const linearWebhookSecretConfigured = Boolean(linearWebhookSecret?.trim());
  const linearActiveStates = linearConfig.activeStates;
  const linearRunningState = linearConfig.states.running;
  const linearReviewState = linearConfig.states.review;
  const linearFailureState = linearConfig.states.failure;
  const linearDoneState = linearConfig.states.done;
  const linearCancelledState = linearConfig.states.cancelled;
  const linearEnabled = trackerKind === "linear";
  const expectedStateNames = uniqueTextValues([
    ...linearActiveStates,
    linearRunningState,
    linearReviewState,
    linearFailureState,
    linearDoneState,
    linearCancelledState,
  ]);
  const missingRequired =
    linearEnabled && (!linearApiKeyConfigured || !linearTeamKeyConfigured);
  let status: IntegrationHealthStatus = "ok";
  let message = `Using ${trackerKind} tracker`;
  let verification: LinearVerificationHealth = {
    status: "disabled",
    message: "Linear tracker disabled",
    matchedStateNames: [],
    missingStateNames: [],
    availableStateNames: [],
  };

  if (linearEnabled && missingRequired) {
    status = "error";
    message = "Linear is missing required polling config";
    verification = {
      status: "missing_config",
      message,
      matchedStateNames: [],
      missingStateNames: expectedStateNames,
      availableStateNames: [],
    };
  } else if (linearEnabled && linearApiKey && linearTeamKey) {
    const checkedAt = new Date().toISOString();
    try {
      const tracker = new LinearTrackerAdapter({ apiKey: linearApiKey });
      const result = await tracker.verifyConnection({
        teamKey: linearTeamKey,
        stateNames: expectedStateNames,
      });
      const availableStateNames = uniqueTextValues(
        result.states.map((state) => state.name),
      );

      if (!result.team) {
        status = "error";
        message = "Linear team key was not found";
        verification = {
          status: "failed",
          checkedAt,
          message,
          matchedStateNames: [],
          missingStateNames: expectedStateNames,
          availableStateNames,
          error: `Team ${linearTeamKey} was not returned by Linear`,
        };
      } else if (result.missingStateNames.length > 0) {
        status = "error";
        message = "Linear workflow states are missing";
        verification = {
          status: "missing_states",
          checkedAt,
          message,
          team: result.team,
          matchedStateNames: result.matchedStateNames,
          missingStateNames: result.missingStateNames,
          availableStateNames,
        };
      } else {
        status = linearWebhookSecretConfigured ? "ok" : "warn";
        message = linearWebhookSecretConfigured
          ? "Linear team and workflow states verified"
          : "Linear verified; webhook secret missing";
        verification = {
          status: "verified",
          checkedAt,
          message,
          team: result.team,
          matchedStateNames: result.matchedStateNames,
          missingStateNames: [],
          availableStateNames,
        };
      }
    } catch (error) {
      status = "error";
      message = "Linear verification failed";
      verification = {
        status: "failed",
        checkedAt,
        message,
        matchedStateNames: [],
        missingStateNames: expectedStateNames,
        availableStateNames: [],
        error: sanitizeIntegrationError(error),
      };
    }
  }

  return {
    tracker: {
      kind: trackerKind,
      status,
      message,
    },
    linear: {
      enabled: linearEnabled,
      status,
      apiKeyConfigured: linearApiKeyConfigured,
      teamKeyConfigured: linearTeamKeyConfigured,
      webhookSecretConfigured: linearWebhookSecretConfigured,
      webhookSetup: buildLinearWebhookSetupHealth({
        enabled: linearEnabled,
        secretConfigured: linearWebhookSecretConfigured,
      }),
      webhookToleranceMs: linearWebhookToleranceMs,
      activeStates: linearActiveStates,
      runningState: linearRunningState,
      reviewState: linearReviewState,
      failureState: linearFailureState,
      doneState: linearDoneState,
      cancelledState: linearCancelledState,
      verification,
    },
    runtime,
  };
}

function buildLinearWebhookSetupHealth(input: {
  enabled: boolean;
  secretConfigured: boolean;
}): LinearWebhookSetupHealth {
  const endpointPath = "/webhooks/linear";
  const publicCallbackUrl = readLinearPublicWebhookUrl(endpointPath);
  const publicCallbackConfigured = Boolean(publicCallbackUrl);
  const status: LinearWebhookSetupStatus = !input.enabled
    ? "disabled"
    : !input.secretConfigured
      ? "missing_secret"
      : publicCallbackConfigured
        ? "ready"
        : "local_only";

  return {
    status,
    message: linearWebhookSetupMessage(status),
    endpointPath,
    localCallbackUrl:
      readOptionalText(process.env.AGENTIC_PM_LOCAL_WEBHOOK_URL, 2_000) ??
      `http://127.0.0.1:${port}${endpointPath}`,
    publicCallbackUrl,
    publicCallbackConfigured,
    secretConfigured: input.secretConfigured,
    toleranceMs: linearWebhookToleranceMs,
    signatureHeader: "Linear-Signature",
    deliveryHeader: "Linear-Delivery",
    timestampField: "webhookTimestamp",
  };
}

function readLinearPublicWebhookUrl(endpointPath: string): string | undefined {
  const exactUrl =
    readOptionalText(process.env.LINEAR_WEBHOOK_PUBLIC_URL, 2_000) ??
    readOptionalText(process.env.AGENTIC_PM_PUBLIC_WEBHOOK_URL, 2_000);
  if (exactUrl) {
    return normalizeHttpUrl(exactUrl);
  }

  const baseUrl =
    readOptionalText(process.env.AGENTIC_PM_PUBLIC_BASE_URL, 2_000) ??
    readOptionalText(process.env.PUBLIC_WEBHOOK_BASE_URL, 2_000);
  const normalizedBaseUrl = baseUrl ? normalizeHttpUrl(baseUrl) : undefined;
  return normalizedBaseUrl
    ? `${normalizedBaseUrl.replace(/\/+$/, "")}${endpointPath}`
    : undefined;
}

function normalizeHttpUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function linearWebhookSetupMessage(status: LinearWebhookSetupStatus): string {
  switch (status) {
    case "ready":
      return "Webhook callback URL and signing secret configured";
    case "local_only":
      return "Webhook secret configured; public callback URL missing";
    case "missing_secret":
      return "Webhook signing secret missing";
    case "disabled":
      return "Linear tracker disabled";
  }
}

async function buildRuntimeHealth(): Promise<RuntimeHealth> {
  const runtimeKind = readRuntimeKind();
  const workflowResult = await loadWorkflowForHealth();
  const codexConfig = workflowResult.workflow?.config.codex ?? {
    command: "codex",
    args: ["exec", "--json", "-"],
    approval_policy: "never",
    sandbox: "workspace-write",
    skip_git_repo_check: false,
    turn_timeout_ms: 3_600_000,
    stall_timeout_ms: 300_000,
  };
  const codexApiKey = readCodexApiKeySource();
  let codexArgs = codexConfig.args;
  let cursorArgs: string[] | undefined;
  let configError: string | undefined;
  try {
    codexArgs = parseCommandArgs(process.env.CODEX_ARGS, codexConfig.args);
    cursorArgs = parseOptionalCommandArgs(process.env.CURSOR_ARGS);
  } catch (error) {
    configError = sanitizeIntegrationError(error);
  }
  const cursorApiKeyConfigured = Boolean(process.env.CURSOR_API_KEY?.trim());
  const turnTimeoutMs = readPositiveNumber(
    process.env.AGENT_RUNTIME_TURN_TIMEOUT_MS ??
      process.env.CODEX_TURN_TIMEOUT_MS,
    codexConfig.turn_timeout_ms,
  );
  const stallTimeoutMs = readPositiveNumber(
    process.env.AGENT_RUNTIME_STALL_TIMEOUT_MS ??
      process.env.CODEX_STALL_TIMEOUT_MS,
    codexConfig.stall_timeout_ms,
  );

  let status: IntegrationHealthStatus = workflowResult.error ? "error" : "ok";
  let message = `Using ${runtimeKind} runtime`;

  if (workflowResult.error) {
    message = "Runtime workflow could not be loaded";
  } else if (configError) {
    status = "error";
    message = "Runtime args config is invalid";
  } else if (runtimeKind === "codex" && !codexApiKey.source) {
    status = "warn";
    message = "Codex selected; relying on CLI login";
  } else if (runtimeKind === "cursor" && !cursorApiKeyConfigured) {
    status = "warn";
    message = "Cursor selected; relying on CLI login";
  }

  return {
    kind: runtimeKind,
    status,
    message,
    configError,
    workflow: {
      root: workflowRoot,
      loaded: Boolean(workflowResult.workflow),
      path: workflowResult.workflow?.path,
      error: workflowResult.error,
    },
    codex: {
      enabled: runtimeKind === "codex",
      command: process.env.CODEX_COMMAND ?? codexConfig.command,
      args: codexArgs,
      approvalPolicy: readOptionalEnvText(
        process.env.CODEX_APPROVAL_POLICY ?? process.env.CODEX_ASK_FOR_APPROVAL,
        codexConfig.approval_policy,
      ),
      sandbox: readOptionalEnvText(
        process.env.CODEX_SANDBOX ?? process.env.CODEX_SANDBOX_MODE,
        codexConfig.sandbox,
      ),
      skipGitRepoCheck: readBoolean(
        process.env.CODEX_SKIP_GIT_REPO_CHECK,
        codexConfig.skip_git_repo_check,
      ),
      model: readOptionalEnvText(process.env.CODEX_MODEL),
      reasoningEffort: readOptionalEnvText(process.env.CODEX_REASONING_EFFORT),
      apiKeyConfigured: Boolean(codexApiKey.source),
      apiKeySource: codexApiKey.source,
      turnTimeoutMs,
      stallTimeoutMs,
    },
    cursor: {
      enabled: runtimeKind === "cursor",
      command:
        readOptionalEnvText(process.env.CURSOR_COMMAND, "cursor-agent") ??
        "cursor-agent",
      args: cursorArgs,
      outputFormat: parseCursorOutputFormat(process.env.CURSOR_OUTPUT_FORMAT),
      sandbox: parseCursorSandbox(process.env.CURSOR_SANDBOX),
      trustWorkspace: readBoolean(process.env.CURSOR_TRUST_WORKSPACE, false),
      force: readBoolean(process.env.CURSOR_FORCE, false),
      model: readOptionalEnvText(process.env.CURSOR_MODEL),
      apiKeyConfigured: cursorApiKeyConfigured,
    },
  };
}

async function loadWorkflowForHealth(): Promise<{
  workflow?: WorkflowDocument;
  error?: string;
}> {
  try {
    return {
      workflow: await loadWorkflowDocument(workflowRoot),
    };
  } catch (error) {
    return {
      error: sanitizeIntegrationError(error),
    };
  }
}

function uniqueTextValues(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function sanitizeIntegrationError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 280 ? `${message.slice(0, 277)}...` : message;
}

async function normalizeLinearWebhookPayload(
  payload: LinearWebhookPayload,
  context: LinearWebhookContext,
): Promise<LinearWebhookNormalizationResult> {
  if (payload.type !== "Issue" && context.event !== "Issue") {
    return {
      status: "ignored",
      reason: "not_issue_event",
    };
  }

  if (payload.action !== "create" && payload.action !== "update") {
    await repository.appendEvent({
      projectId,
      type: "tracker.linear.webhook.ignored",
      level: "info",
      message: "Ignored Linear issue webhook",
      payload: {
        action: payload.action,
        deliveryId: context.deliveryId,
        event: context.event,
        reason: "unsupported_action",
        type: payload.type,
      },
    });
    return {
      status: "ignored",
      reason: "unsupported_action",
    };
  }

  if (!isLinearIssueWebhookData(payload.data)) {
    await repository.appendEvent({
      projectId,
      type: "tracker.linear.webhook.normalization_failed",
      level: "warn",
      message: "Could not normalize Linear issue webhook",
      payload: {
        action: payload.action,
        deliveryId: context.deliveryId,
        event: context.event,
        reason: "invalid_issue_payload",
        type: payload.type,
      },
    });
    return {
      status: "failed",
      reason: "invalid_issue_payload",
    };
  }

  const issue = normalizeLinearIssue(payload.data, {
    fallbackUrl: payload.url,
  });
  const storedIssue = await repository.upsertIssue(issue);
  const activeStates = linearConfig.activeStates;
  const active = activeStates.includes(storedIssue.state);
  const workItem = active
    ? await repository.ensureWorkItemForIssue(projectId, storedIssue)
    : undefined;

  await repository.appendEvent({
    projectId,
    workItemId: workItem?.id,
    type: "tracker.issue.webhook_reconciled",
    level: "info",
    message: `Reconciled ${storedIssue.identifier} from Linear webhook`,
    payload: {
      action: payload.action,
      active,
      activeStates,
      deliveryId: context.deliveryId,
      event: context.event,
      issueExternalId: storedIssue.externalId,
      issueId: storedIssue.id,
      issueIdentifier: storedIssue.identifier,
      state: storedIssue.state,
      type: payload.type,
      updatedFrom: payload.updatedFrom,
      webhookId: payload.webhookId,
      workItemId: workItem?.id,
    },
  });

  return {
    status: "reconciled",
    active,
    issueId: storedIssue.id,
    issueIdentifier: storedIssue.identifier,
    issueExternalId: storedIssue.externalId,
    state: storedIssue.state,
    workItemId: workItem?.id,
  };
}

function isLinearIssueWebhookData(value: unknown): value is LinearIssueNode {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    value.id.trim().length > 0 &&
    typeof value.identifier === "string" &&
    value.identifier.trim().length > 0 &&
    typeof value.title === "string" &&
    value.title.trim().length > 0
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function webhookDeliveryStatusForNormalization(
  result: LinearWebhookNormalizationResult,
): WebhookDeliveryStatus {
  switch (result.status) {
    case "reconciled":
      return "processed";
    case "ignored":
      return "ignored";
    case "failed":
      return "failed";
  }
}

function webhookDeliveryResult(
  result: LinearWebhookNormalizationResult,
): Record<string, unknown> {
  switch (result.status) {
    case "reconciled":
      return {
        status: result.status,
        active: result.active,
        issueExternalId: result.issueExternalId,
        issueId: result.issueId,
        issueIdentifier: result.issueIdentifier,
        state: result.state,
        ...(result.workItemId ? { workItemId: result.workItemId } : {}),
      };
    case "ignored":
      return {
        status: result.status,
        reason: result.reason,
      };
    case "failed":
      return {
        status: result.status,
        reason: result.reason,
      };
  }
}

function isReadableLocalTextArtifact(artifact: Artifact): boolean {
  return (
    artifact.metadata?.local === true &&
    readableTextArtifactTypes.has(artifact.type)
  );
}

function contentTypeForArtifact(type: ArtifactType): string {
  switch (type) {
    case "patch":
      return "text/x-patch; charset=utf-8";
    case "pr":
    case "plan":
    case "review_packet":
      return "text/markdown; charset=utf-8";
    case "log":
    case "test_report":
      return "text/plain; charset=utf-8";
    case "screenshot":
    case "video":
      return "application/octet-stream";
  }
}

function artifactFileName(artifact: Artifact): string {
  const fileNameByType: Record<ArtifactType, string> = {
    log: "agent-events.log",
    patch: "workspace.patch",
    pr: "pull-request.md",
    screenshot: "screenshot",
    video: "video",
    test_report: "test-report.txt",
    review_packet: "review-packet.md",
    plan: "plan.md",
  };

  return `${artifact.id}-${fileNameByType[artifact.type]}`.replace(
    /[^a-zA-Z0-9._-]/g,
    "_",
  );
}

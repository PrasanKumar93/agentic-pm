import "dotenv/config";
import { createHmac, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import cors from "@fastify/cors";
import Fastify, { type FastifyRequest } from "fastify";
import type {
  Artifact,
  ArtifactType,
  DispatchActionName,
  Issue,
  OperatorActionName,
  OperatorActionResult,
  RunEvent
} from "@agentic-pm/core";
import {
  AgenticRepository,
  connectMongo,
  ensureIndexes,
  getCollections,
  InvalidWorkItemActionError,
  readMongoConfig,
  type WebhookDeliveryStatus,
  WorkItemNotFoundError
} from "@agentic-pm/db";
import { LinearTrackerAdapter, normalizeLinearIssue, type LinearIssueNode } from "@agentic-pm/trackers";

const host = process.env.API_HOST ?? "0.0.0.0";
const port = Number(process.env.API_PORT ?? 4000);
const projectId = process.env.AGENTIC_PM_PROJECT_ID ?? "project_local";
const linearWebhookSecret = process.env.LINEAR_WEBHOOK_SECRET;
const linearWebhookToleranceMs = readPositiveNumber(process.env.LINEAR_WEBHOOK_TOLERANCE_MS, 60_000);

const mongo = await connectMongo(readMongoConfig());
const collections = getCollections(mongo.db);
await ensureIndexes(collections);

const repository = new AgenticRepository(mongo.db);
const app = Fastify({
  logger: true
});
const allowedOperatorActions = new Set<OperatorActionName>(["start", "retry", "pause", "resume", "cancel", "complete"]);
const allowedDispatchActions = new Set<DispatchActionName>(["pause", "resume", "start_eligible"]);
const readableTextArtifactTypes = new Set<ArtifactType>(["log", "patch", "pr", "test_report", "review_packet", "plan"]);
type IntegrationHealthStatus = "ok" | "warn" | "error";
type OperatorTrackerSyncReason = "operator_cancel" | "operator_complete";

type OperatorTrackerSyncResult =
  | {
      attempted: false;
      status: "not_applicable" | "disabled" | "missing_issue" | "missing_api_key";
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
app.addContentTypeParser("application/json", { parseAs: "buffer" }, (request, body, done) => {
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
});

await app.register(cors, {
  origin: true
});

app.get("/health", async () => {
  await mongo.db.command({ ping: 1 });
  return {
    ok: true,
    service: "agentic-pm-api",
    time: new Date().toISOString()
  };
});

app.get("/integrations/health", async () => {
  return {
    data: buildIntegrationHealth(),
    meta: {
      generatedAt: new Date().toISOString()
    }
  };
});

app.get("/work-items", async (request) => {
  const requestedLimit = Number((request.query as { limit?: string }).limit ?? 50);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 50;
  const data = await repository.listWorkItemSummaries(limit);

  return {
    data,
    meta: {
      limit,
      count: data.length,
      generatedAt: new Date().toISOString()
    }
  };
});

app.get("/dispatch-control", async () => {
  return {
    data: await repository.getDispatchControl(projectId),
    meta: {
      projectId,
      generatedAt: new Date().toISOString()
    }
  };
});

app.post("/dispatch-control/actions/:action", async (request, reply) => {
  const { action } = request.params as {
    action: string;
  };

  if (!allowedDispatchActions.has(action as DispatchActionName)) {
    return reply.code(400).send({
      error: `Unknown dispatch action: ${action}`
    });
  }

  const body = (request.body ?? {}) as {
    actorId?: string;
    reason?: string;
  };

  const result = await repository.performDispatchAction({
    projectId,
    action: action as DispatchActionName,
    actorId: body.actorId,
    reason: body.reason
  });

  return {
    data: result,
    meta: {
      action,
      generatedAt: new Date().toISOString()
    }
  };
});

app.post("/work-items/:workItemId/actions/:action", async (request, reply) => {
  const { workItemId, action } = request.params as {
    workItemId: string;
    action: string;
  };

  if (!allowedOperatorActions.has(action as OperatorActionName)) {
    return reply.code(400).send({
      error: `Unknown work item action: ${action}`
    });
  }

  const body = (request.body ?? {}) as {
    actorId?: string;
    reason?: string;
  };

  try {
    const result = await repository.performWorkItemAction({
      workItemId,
      action: action as OperatorActionName,
      actorId: body.actorId,
      reason: body.reason
    });
    const trackerSync = await syncOperatorActionTrackerState({
      action: action as OperatorActionName,
      actorId: body.actorId,
      reason: body.reason,
      result
    });

    const data = await repository.getWorkItemSummary(workItemId);
    if (!data) {
      return reply.code(404).send({
        error: `Work item not found: ${workItemId}`
      });
    }

    return {
      data,
      meta: {
        action,
        trackerSync,
        generatedAt: new Date().toISOString()
      }
    };
  } catch (error) {
    if (error instanceof WorkItemNotFoundError) {
      return reply.code(404).send({
        error: error.message
      });
    }

    if (error instanceof InvalidWorkItemActionError) {
      return reply.code(409).send({
        error: error.message
      });
    }

    throw error;
  }
});

app.get("/runs/:runId/events", async (request) => {
  const { runId } = request.params as { runId: string };
  return {
    data: await repository.listRunEvents(runId)
  };
});

app.get("/runs/:runId/artifacts", async (request) => {
  const { runId } = request.params as { runId: string };
  return {
    data: await repository.listArtifacts(runId)
  };
});

app.get("/artifacts/:artifactId/content", async (request, reply) => {
  const { artifactId } = request.params as { artifactId: string };
  const artifact = await repository.getArtifact(artifactId);

  if (!artifact) {
    return reply.code(404).send({
      error: `Artifact not found: ${artifactId}`
    });
  }

  if (!isReadableLocalTextArtifact(artifact)) {
    return reply.code(415).send({
      error: `Artifact content is not readable through this endpoint: ${artifactId}`
    });
  }

  try {
    const content = await readFile(artifact.uri, "utf8");
    return reply
      .type(contentTypeForArtifact(artifact.type))
      .header("content-disposition", `inline; filename="${artifactFileName(artifact)}"`)
      .send(content);
  } catch (error) {
    app.log.warn({ artifactId, error }, "Could not read artifact content");
    return reply.code(404).send({
      error: `Artifact content not found: ${artifactId}`
    });
  }
});

app.post("/webhooks/linear", async (request, reply) => {
  const body = (request.body ?? {}) as LinearWebhookPayload;
  const verification = verifyLinearWebhook(request as RawBodyRequest, body);
  if (!verification.ok) {
    return reply.code(verification.statusCode).send({
      error: verification.error
    });
  }

  const context: LinearWebhookContext = {
    deliveryId: firstHeader(request.headers["linear-delivery"]),
    event: firstHeader(request.headers["linear-event"])
  };
  const deliveryId = context.deliveryId;

  const deliveryClaim = deliveryId
    ? await repository.claimWebhookDelivery({
        projectId,
        provider: "linear",
        deliveryId,
        event: context.event,
        action: body.action,
        type: body.type
      })
    : undefined;

  if (deliveryClaim && !deliveryClaim.claimed) {
    const duplicateResult: LinearWebhookResponseResult = {
      status: "duplicate",
      deliveryId: deliveryClaim.delivery.deliveryId,
      originalStatus: deliveryClaim.delivery.status,
      result: deliveryClaim.delivery.result
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
        type: body.type
      }
    });

    return {
      ok: true,
      data: duplicateResult
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
      url: body.url
    }
  });

  const normalization = await normalizeLinearWebhookPayload(body, context);
  if (deliveryId) {
    await repository.completeWebhookDelivery({
      provider: "linear",
      deliveryId,
      status: webhookDeliveryStatusForNormalization(normalization),
      result: webhookDeliveryResult(normalization)
    });
  }

  return {
    ok: true,
    data: normalization
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

function verifyLinearWebhook(request: RawBodyRequest, payload: LinearWebhookPayload): VerificationResult {
  if (!linearWebhookSecret) {
    return {
      ok: false,
      error: "Linear webhook secret is not configured",
      statusCode: 503
    };
  }

  const rawBody = request.rawBody;
  if (!rawBody) {
    return {
      ok: false,
      error: "Raw request body is unavailable",
      statusCode: 400
    };
  }

  const signature = firstHeader(request.headers["linear-signature"]);
  if (!signature || !verifyHmacSignature(rawBody, signature, linearWebhookSecret)) {
    return {
      ok: false,
      error: "Invalid Linear webhook signature",
      statusCode: 401
    };
  }

  if (!Number.isFinite(payload.webhookTimestamp)) {
    return {
      ok: false,
      error: "Linear webhook timestamp is missing",
      statusCode: 401
    };
  }

  const skewMs = Math.abs(Date.now() - Number(payload.webhookTimestamp));
  if (skewMs > linearWebhookToleranceMs) {
    return {
      ok: false,
      error: "Linear webhook timestamp is outside the allowed tolerance",
      statusCode: 401
    };
  }

  return { ok: true };
}

function verifyHmacSignature(rawBody: Buffer, signature: string, secret: string): boolean {
  if (!/^[0-9a-f]+$/i.test(signature) || signature.length !== 64) {
    return false;
  }

  const headerSignature = Buffer.from(signature, "hex");
  const computedSignature = createHmac("sha256", secret).update(rawBody).digest();

  if (headerSignature.length !== computedSignature.length) {
    return false;
  }

  return timingSafeEqual(computedSignature, headerSignature);
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function readPositiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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
      status: "not_applicable"
    };
  }

  if ((process.env.AGENTIC_PM_TRACKER ?? "fake") !== "linear") {
    return {
      attempted: false,
      status: "disabled"
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
        tracker: "linear"
      }
    });
    return {
      attempted: false,
      status: "missing_api_key"
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
        tracker: "linear"
      }
    });
    return {
      attempted: false,
      status: "missing_issue"
    };
  }

  const tracker = new LinearTrackerAdapter({ apiKey });
  const reason = readOperatorActionTrackerReason(input.action);

  try {
    await tracker.moveIssue({
      issueExternalId: issue.externalId,
      stateName
    });

    await repository.upsertIssue({
      ...issue,
      state: stateName,
      updatedAt: new Date()
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
        tracker: "linear"
      }
    });

    return {
      attempted: true,
      status: "synced",
      stateName,
      tracker: "linear"
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
        tracker: "linear"
      }
    });

    return {
      attempted: true,
      status: "failed",
      stateName,
      tracker: "linear"
    };
  }
}

function readOperatorActionTrackerState(action: OperatorActionName): string | undefined {
  if (action === "cancel") {
    return process.env.LINEAR_CANCELLED_STATE?.trim() || "Cancelled";
  }

  if (action === "complete") {
    return process.env.LINEAR_DONE_STATE?.trim() || "Done";
  }

  return undefined;
}

function readOperatorActionTrackerReason(action: OperatorActionName): OperatorTrackerSyncReason {
  return action === "cancel" ? "operator_cancel" : "operator_complete";
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
      ...input.payload
    }
  });
}

function buildIntegrationHealth() {
  const trackerKind = process.env.AGENTIC_PM_TRACKER ?? "fake";
  const linearApiKeyConfigured = Boolean(process.env.LINEAR_API_KEY?.trim());
  const linearTeamKeyConfigured = Boolean(process.env.LINEAR_TEAM_KEY?.trim());
  const linearWebhookSecretConfigured = Boolean(linearWebhookSecret?.trim());
  const linearActiveStates = readCommaSeparated(process.env.LINEAR_ACTIVE_STATES, ["Ready for Agent", "Changes Requested"]);
  const linearRunningState = process.env.LINEAR_RUNNING_STATE?.trim() || "Agent Running";
  const linearReviewState = process.env.LINEAR_REVIEW_STATE?.trim() || "Human Review";
  const linearFailureState = process.env.LINEAR_FAILURE_STATE?.trim() || "Changes Requested";
  const linearDoneState = process.env.LINEAR_DONE_STATE?.trim() || "Done";
  const linearCancelledState = process.env.LINEAR_CANCELLED_STATE?.trim() || "Cancelled";
  const linearEnabled = trackerKind === "linear";
  const missingRequired = linearEnabled && (!linearApiKeyConfigured || !linearTeamKeyConfigured);
  const status: IntegrationHealthStatus = !linearEnabled
    ? "ok"
    : missingRequired
      ? "error"
      : linearWebhookSecretConfigured
        ? "ok"
        : "warn";
  const message = !linearEnabled
    ? `Using ${trackerKind} tracker`
    : missingRequired
      ? "Linear is missing required polling config"
      : linearWebhookSecretConfigured
        ? "Linear polling and webhooks configured"
        : "Linear polling configured; webhook secret missing";

  return {
    tracker: {
      kind: trackerKind,
      status,
      message
    },
    linear: {
      enabled: linearEnabled,
      status,
      apiKeyConfigured: linearApiKeyConfigured,
      teamKeyConfigured: linearTeamKeyConfigured,
      webhookSecretConfigured: linearWebhookSecretConfigured,
      webhookToleranceMs: linearWebhookToleranceMs,
      activeStates: linearActiveStates,
      runningState: linearRunningState,
      reviewState: linearReviewState,
      failureState: linearFailureState,
      doneState: linearDoneState,
      cancelledState: linearCancelledState
    }
  };
}

function readCommaSeparated(value: string | undefined, fallback: string[]): string[] {
  const parsed = value
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return parsed?.length ? parsed : fallback;
}

async function normalizeLinearWebhookPayload(
  payload: LinearWebhookPayload,
  context: LinearWebhookContext
): Promise<LinearWebhookNormalizationResult> {
  if (payload.type !== "Issue" && context.event !== "Issue") {
    return {
      status: "ignored",
      reason: "not_issue_event"
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
        type: payload.type
      }
    });
    return {
      status: "ignored",
      reason: "unsupported_action"
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
        type: payload.type
      }
    });
    return {
      status: "failed",
      reason: "invalid_issue_payload"
    };
  }

  const issue = normalizeLinearIssue(payload.data, {
    fallbackUrl: payload.url
  });
  const storedIssue = await repository.upsertIssue(issue);
  const activeStates = readCommaSeparated(process.env.LINEAR_ACTIVE_STATES, ["Ready for Agent", "Changes Requested"]);
  const active = activeStates.includes(storedIssue.state);
  const workItem = active ? await repository.ensureWorkItemForIssue(projectId, storedIssue) : undefined;

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
      workItemId: workItem?.id
    }
  });

  return {
    status: "reconciled",
    active,
    issueId: storedIssue.id,
    issueIdentifier: storedIssue.identifier,
    issueExternalId: storedIssue.externalId,
    state: storedIssue.state,
    workItemId: workItem?.id
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

function webhookDeliveryStatusForNormalization(result: LinearWebhookNormalizationResult): WebhookDeliveryStatus {
  switch (result.status) {
    case "reconciled":
      return "processed";
    case "ignored":
      return "ignored";
    case "failed":
      return "failed";
  }
}

function webhookDeliveryResult(result: LinearWebhookNormalizationResult): Record<string, unknown> {
  switch (result.status) {
    case "reconciled":
      return {
        status: result.status,
        active: result.active,
        issueExternalId: result.issueExternalId,
        issueId: result.issueId,
        issueIdentifier: result.issueIdentifier,
        state: result.state,
        ...(result.workItemId ? { workItemId: result.workItemId } : {})
      };
    case "ignored":
      return {
        status: result.status,
        reason: result.reason
      };
    case "failed":
      return {
        status: result.status,
        reason: result.reason
      };
  }
}

function isReadableLocalTextArtifact(artifact: Artifact): boolean {
  return artifact.metadata?.local === true && readableTextArtifactTypes.has(artifact.type);
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
    plan: "plan.md"
  };

  return `${artifact.id}-${fileNameByType[artifact.type]}`.replace(/[^a-zA-Z0-9._-]/g, "_");
}

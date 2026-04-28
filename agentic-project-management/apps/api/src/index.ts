import "dotenv/config";
import { createHmac, timingSafeEqual } from "node:crypto";
import cors from "@fastify/cors";
import Fastify, { type FastifyRequest } from "fastify";
import type { DispatchActionName, OperatorActionName } from "@agentic-pm/core";
import {
  AgenticRepository,
  connectMongo,
  ensureIndexes,
  getCollections,
  InvalidWorkItemActionError,
  readMongoConfig,
  WorkItemNotFoundError
} from "@agentic-pm/db";

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
const allowedOperatorActions = new Set<OperatorActionName>(["start", "retry", "pause", "resume", "cancel"]);
const allowedDispatchActions = new Set<DispatchActionName>(["pause", "resume", "start_eligible"]);

type RawBodyRequest = FastifyRequest & {
  rawBody?: Buffer;
};

type LinearWebhookPayload = {
  action?: string;
  createdAt?: string;
  data?: unknown;
  type?: string;
  url?: string;
  webhookTimestamp?: number;
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
    await repository.performWorkItemAction({
      workItemId,
      action: action as OperatorActionName,
      actorId: body.actorId,
      reason: body.reason
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

app.post("/webhooks/linear", async (request, reply) => {
  const body = (request.body ?? {}) as LinearWebhookPayload;
  const verification = verifyLinearWebhook(request as RawBodyRequest, body);
  if (!verification.ok) {
    return reply.code(verification.statusCode).send({
      error: verification.error
    });
  }

  await repository.appendEvent({
    type: "tracker.linear.webhook.received",
    level: "info",
    message: "Received Linear webhook",
    payload: {
      action: body.action,
      body: request.body,
      deliveryId: firstHeader(request.headers["linear-delivery"]),
      event: firstHeader(request.headers["linear-event"]),
      type: body.type,
      url: body.url
    }
  });

  return { ok: true };
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

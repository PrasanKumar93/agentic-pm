import "dotenv/config";
import cors from "@fastify/cors";
import Fastify from "fastify";
import type { OperatorActionName } from "@agentic-pm/core";
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

const mongo = await connectMongo(readMongoConfig());
const collections = getCollections(mongo.db);
await ensureIndexes(collections);

const repository = new AgenticRepository(mongo.db);
const app = Fastify({
  logger: true
});
const allowedOperatorActions = new Set<OperatorActionName>(["start", "retry", "pause", "resume", "cancel"]);

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
  await repository.appendEvent({
    type: "tracker.linear.webhook.received",
    level: "info",
    message: "Received Linear webhook",
    payload: {
      body: request.body
    }
  });

  return reply.code(202).send({ ok: true });
});

const shutdown = async () => {
  app.log.info("Shutting down API");
  await app.close();
  await mongo.client.close();
};

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

await app.listen({ host, port });

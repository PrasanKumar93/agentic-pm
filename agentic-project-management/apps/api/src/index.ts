import "dotenv/config";
import cors from "@fastify/cors";
import Fastify from "fastify";
import { AgenticRepository, connectMongo, ensureIndexes, getCollections, readMongoConfig } from "@agentic-pm/db";

const host = process.env.API_HOST ?? "0.0.0.0";
const port = Number(process.env.API_PORT ?? 4000);

const mongo = await connectMongo(readMongoConfig());
const collections = getCollections(mongo.db);
await ensureIndexes(collections);

const repository = new AgenticRepository(mongo.db);
const app = Fastify({
  logger: true
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
  const limit = Number((request.query as { limit?: string }).limit ?? 50);
  return {
    data: await repository.listWorkItems(limit)
  };
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

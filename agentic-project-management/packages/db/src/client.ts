import { Db, MongoClient } from "mongodb";

export interface MongoConfig {
  uri: string;
  databaseName: string;
}

export interface MongoContext {
  client: MongoClient;
  db: Db;
}

export async function connectMongo(config: MongoConfig): Promise<MongoContext> {
  const client = new MongoClient(config.uri);
  await client.connect();
  return {
    client,
    db: client.db(config.databaseName)
  };
}

export function readMongoConfig(env: NodeJS.ProcessEnv = process.env): MongoConfig {
  return {
    uri: env.MONGODB_URI ?? "mongodb://localhost:27018",
    databaseName: env.MONGODB_DB ?? "agentic_pm"
  };
}

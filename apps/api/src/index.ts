import "express-async-errors";
import { MongoClient } from "mongodb";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { createApp } from "./app.js";
import { ensureIndexes } from "./db/ensureIndexes.js";

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "unhandledRejection");
  process.exit(1);
});
process.on("uncaughtException", (err) => {
  logger.error({ err }, "uncaughtException");
  process.exit(1);
});

async function main(): Promise<void> {
  const client = new MongoClient(config.mongoUri);
  await client.connect();
  const db = client.db(config.mongoDb);
  await ensureIndexes(db);
  logger.info("MongoDB connected and indexes ensured");

  const app = createApp(db);
  const server = app.listen(config.port, () => {
    logger.info({ port: config.port }, "lookup API listening");
  });

  const shutdown = async () => {
    server.close();
    await client.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  logger.error({ err }, "fatal startup error");
  process.exit(1);
});

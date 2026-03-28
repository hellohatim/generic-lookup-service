import "dotenv/config";

function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === "") throw new Error(`Missing env ${name}`);
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? "3000"),
  mongoUri: req("MONGODB_URI", "mongodb://127.0.0.1:27017"),
  mongoDb: req("MONGODB_DB", "lookup_service"),
  logLevel: process.env.LOG_LEVEL ?? "info",
  nodeEnv: process.env.NODE_ENV ?? "development",
};

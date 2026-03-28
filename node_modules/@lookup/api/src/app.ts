import path from "path";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import express from "express";
import swaggerUi from "swagger-ui-express";
import yaml from "js-yaml";
import { requestLogMiddleware } from "./middleware/requestLog.js";
import * as OpenApiValidator from "express-openapi-validator";
import type { Db } from "mongodb";
import { correlationMiddleware } from "./middleware/correlation.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { createApiRouter } from "./routes/lookup.routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const openApiYaml = path.resolve(__dirname, "../openapi.yaml");

export function createApp(db: Db): express.Application {
  const app = express();

  app.disable("x-powered-by");
  app.use(correlationMiddleware);
  app.use(requestLogMiddleware);

  const openApiDoc = yaml.load(readFileSync(openApiYaml, "utf8")) as Record<string, unknown>;
  app.use(
    "/lookup/v1/docs",
    swaggerUi.serve,
    swaggerUi.setup(openApiDoc, { customSiteTitle: "Lookup API — Swagger UI" })
  );

  const v1 = express.Router();
  v1.use(express.json({ limit: "2mb" }));

  v1.use(
    OpenApiValidator.middleware({
      apiSpec: openApiYaml,
      validateRequests: true,
      validateResponses: false,
      validateSecurity: false,
    })
  );

  v1.use(createApiRouter(db));

  app.use("/lookup/v1", v1);
  app.use(errorHandler);

  return app;
}

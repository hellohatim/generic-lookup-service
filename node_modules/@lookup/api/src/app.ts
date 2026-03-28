import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import { requestLogMiddleware } from "./middleware/requestLog.js";
import * as OpenApiValidator from "express-openapi-validator";
import type { Db } from "mongodb";
import { correlationMiddleware } from "./middleware/correlation.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { createApiRouter } from "./createApiRouter.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const openApiYaml = path.resolve(__dirname, "../../../docs/lookup-service/openapi.yaml");

export function createApp(db: Db): express.Application {
  const app = express();

  app.disable("x-powered-by");
  app.use(correlationMiddleware);
  app.use(requestLogMiddleware);

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

import type { RequestHandler } from "express";
import { logger } from "../logger.js";

export const requestLogMiddleware: RequestHandler = (req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    logger.info(
      {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: Date.now() - start,
        requestId: req.requestId,
        correlationId: req.correlationId,
      },
      "request completed"
    );
  });
  next();
};

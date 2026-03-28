import { randomUUID } from "crypto";
import type { RequestHandler } from "express";

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      correlationId?: string;
    }
  }
}

export const correlationMiddleware: RequestHandler = (req, res, next) => {
  const requestId = (req.headers["x-request-id"] as string) || randomUUID();
  const correlationId =
    (req.headers["x-correlation-id"] as string) || requestId;
  req.requestId = requestId;
  req.correlationId = correlationId;
  res.setHeader("X-Request-Id", requestId);
  if (correlationId !== requestId) {
    res.setHeader("X-Correlation-Id", correlationId);
  }
  next();
};

import type { ErrorRequestHandler } from "express";
import type { HttpError } from "http-errors";
import { logger } from "../logger.js";
import { AppError } from "../lib/errors.js";

function isOpenApiValidationError(err: unknown): err is { status?: number; errors?: unknown[] } {
  return (
    typeof err === "object" &&
    err !== null &&
    "errors" in err &&
    Array.isArray((err as { errors: unknown }).errors)
  );
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const requestId = req.requestId;
  const correlationId = req.correlationId;

  if (isOpenApiValidationError(err)) {
    const status = typeof err.status === "number" ? err.status : 400;
    logger.warn(
      { err, requestId, correlationId, path: req.path, method: req.method },
      "OpenAPI validation failed"
    );
    res.status(status).json({
      code: "BAD_REQUEST",
      message: "Request validation failed",
      details: { errors: err.errors },
    });
    return;
  }

  if (err instanceof AppError) {
    if (err.status >= 500) {
      logger.error(
        { err, requestId, correlationId, path: req.path },
        err.message
      );
    } else {
      logger.warn(
        { err: { code: err.code, message: err.message }, requestId, correlationId },
        "Handled error"
      );
    }
    res.status(err.status).json({
      code: err.code,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
    return;
  }

  const httpErr = err as Partial<HttpError> & Error;
  if (typeof httpErr.status === "number" && httpErr.status < 500) {
    logger.warn({ err: httpErr.message, requestId }, "HTTP error");
    res.status(httpErr.status).json({
      code: "BAD_REQUEST",
      message: httpErr.message || "Bad request",
    });
    return;
  }

  logger.error(
    { err, requestId, correlationId, path: req.path },
    "Unhandled error"
  );
  res.status(500).json({
    code: "INTERNAL_ERROR",
    message: "An unexpected error occurred",
  });
};

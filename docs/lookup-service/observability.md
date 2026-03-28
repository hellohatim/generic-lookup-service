# Observability — Generic multi-tenant lookup service

Conventions for **request correlation**, **structured logging**, and **metrics** in API implementations. Pair with [openapi.yaml](./openapi.yaml) (`X-Request-Id`, `X-Correlation-Id` parameters).

---

## Request correlation

- Clients **may** send:
  - **`X-Request-Id`**: unique id per HTTP request from the caller.
  - **`X-Correlation-Id`**: id spanning multiple services or hops (e.g. trace root).
- Servers **should**:
  - Echo the same values on **response headers** when provided.
  - Include the chosen id in **`ApiError.details.requestId`** or **`details.correlationId`** when returning errors.

---

## Structured logging (recommended fields)

Use a single JSON object (or equivalent) per log line where feasible:

| Field | Description |
|-------|-------------|
| `timestamp` | ISO-8601 UTC |
| `level` | e.g. info, warn, error |
| `message` | Human-readable summary |
| `requestId` | From `X-Request-Id` or generated |
| `correlationId` | From `X-Correlation-Id` if present |
| `tenantId` | Resolved tenant |
| `namespaceId` | When in scope |
| `tableId` | When in scope |
| `versionId` | When in scope |
| `operation` | e.g. `listEntries`, `bulkImportTable`, `bulkUpsertEntries` |
| `actorSub` | JWT `sub` when authenticated |
| `durationMs` | Handler time |
| `statusCode` | HTTP status |
| `importAuditId` / `auditId` | After import or JSON bulk |

Avoid logging full entry **values** or file contents by default (PII / size); log counts and ids.

---

## Metrics (examples)

Names are suggestions; use your organization’s prefix and cardinality rules.

| Metric | Type | Labels (optional) | Purpose |
|--------|------|-------------------|---------|
| `lookup_http_requests_total` | counter | `method`, `route`, `status` | Traffic |
| `lookup_http_request_duration_seconds` | histogram | `route` | Latency |
| `lookup_entries_list_duration_seconds` | histogram | | Entry list cost |
| `lookup_import_duration_seconds` | histogram | `format` (wide/kv/json) | Import / bulk duration |
| `lookup_import_failures_total` | counter | `reason` | Failed imports |
| `lookup_bulk_json_entries_written_total` | counter | | Bulk JSON throughput |

**Cardinality:** labeling every `tenantId` on all metrics can explode series; prefer aggregating or sampling for high-cardinality labels.

---

## Error responses

Ensure **`ApiError.code`** is stable for dashboards (e.g. `TABLE_EXPIRED`, `VALIDATION_ERROR`).

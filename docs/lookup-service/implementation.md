# Runtime implementation (API)

The reference REST API lives in the monorepo package **`@lookup/api`** ([`apps/api`](../../apps/api)).

## Security warning

The current milestone runs **without JWT validation** and without **helmet / rate limiting / restrictive CORS**. **`cors` is not mounted** on the Express app ([`app.ts`](../../apps/api/src/app.ts)). The **Angular** dev app ([`apps/web`](../../apps/web)) should call the API via a **dev-server proxy** (same-origin `/lookup/v1` → API) to avoid browser CORS during local development; for other clients you may add `cors` or a gateway. Use only on trusted networks. The OpenAPI document still describes `bearerAuth` for the eventual production shape.

## Stack

- **Node.js** + **TypeScript** + **Express**
- **MongoDB** (native driver) — **`sys_*`** metadata collections plus **one physical collection per table version** for entries (`<tenantSlug>_<namespaceSlug>_<tableSlug>_<versionNumber>` with `-`→`_` in slugs), stored on `sys_lookup_table_versions.entriesCollection`; see [mongodb-data-model.md](./mongodb-data-model.md)
- **express-openapi-validator** — request validation against [`apps/api/openapi.yaml`](../../apps/api/openapi.yaml); multipart uploads for Excel import are parsed by the validator (do not add a second multer layer in front of it)
- **Pino** — structured logging; request completion logs include `requestId`, `correlationId`, `method`, `path`, `statusCode`, `durationMs` (see [observability.md](./observability.md))
- **Ajv** (via `createRequire`) — validates entry `value` against optional table `valueSchema` (JSON Schema), not for HTTP request bodies

## Source layout (`apps/api/src`)

The package follows a **MEAN-style** Express layout (Mongo + Express + Node; **Angular** UI lives under [`apps/web`](../../apps/web)).

| Folder / file | Role |
|----------------|------|
| `config/env.ts` | Environment variables and typed `config` object |
| `config/logger.ts` | Pino logger (reads `config`) |
| `database/collections.ts` | `sys_*` MongoDB collection name constants |
| `database/ensureIndexes.ts` | Metadata index bootstrap on startup |
| `middleware/` | Correlation IDs, request logging, centralized error handler |
| `routes/lookup.routes.ts` | Lookup API Express router (`createApiRouter`) |
| `services/` | Data-access helpers (tenant/namespace/table guards, per-version entry collection naming) |
| `utils/` | Shared helpers, OpenAPI/DTO mappers, cursors, validation utilities |
| `app.ts` | Express app factory (OpenAPI validator mount, `/lookup/v1` prefix) |
| `index.ts` | Process entry: connect Mongo, ensure indexes, listen, graceful shutdown |
| `openapi.yaml` (package root) | OpenAPI 3 spec consumed by `express-openapi-validator` and contract tests |

## Base URL

Local default: `http://localhost:3000/lookup/v1` (matches `servers` in OpenAPI).

## Environment

Copy [`apps/api/.env.example`](../../apps/api/.env.example) to `apps/api/.env` and adjust:

- `MONGODB_URI`, `MONGODB_DB`, `PORT`, `LOG_LEVEL`, `NODE_ENV`

## Tests

| Command | Purpose |
|---------|---------|
| `npm run test` (from repo root) | Vitest: library unit tests + Supertest integration tests with **mongodb-memory-server** |
| `npm run test:contract` | Node `node:test` checks: OpenAPI validates, Postman JSON assets parse, seed script invariants |
| `npm run test:functional` | Newman runs [`apps/api/postman/functional.postman_collection.json`](../../apps/api/postman/functional.postman_collection.json) against an in-memory server (generates a temp `.xlsx` for import) |
| `npm run seed:company` (from `apps/api`) | Inserts **10k** demo company entries (`CN########` keys); see [`scripts/seed-company-lookup.ts`](../../apps/api/scripts/seed-company-lookup.ts) |

## Postman collections

- **Functional:** [`apps/api/postman/functional.postman_collection.json`](../../apps/api/postman/functional.postman_collection.json) — Newman / CI (no auth).
- **Design sample:** [`apps/api/postman/design-sample.postman_collection.json`](../../apps/api/postman/design-sample.postman_collection.json) + matching environment — Bearer template and seeded ObjectIds for manual runs.

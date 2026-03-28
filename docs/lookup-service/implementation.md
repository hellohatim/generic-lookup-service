# Runtime implementation (API)

The reference REST API lives in the monorepo package **`@lookup/api`** ([`apps/api`](../../apps/api)).

## Security warning

The current milestone runs **without JWT validation** and without **helmet / rate limiting / restrictive CORS**. Use only on trusted networks. The OpenAPI document still describes `bearerAuth` for the eventual production shape.

## Stack

- **Node.js** + **TypeScript** + **Express**
- **MongoDB** (native driver) — collections and indexes align with [mongodb-data-model.md](./mongodb-data-model.md)
- **express-openapi-validator** — request validation against [openapi.yaml](./openapi.yaml); multipart uploads for Excel import are parsed by the validator (do not add a second multer layer in front of it)
- **Pino** — structured logging; request completion logs include `requestId`, `correlationId`, `method`, `path`, `statusCode`, `durationMs` (see [observability.md](./observability.md))
- **Ajv** (via `createRequire`) — validates entry `value` against optional table `valueSchema` (JSON Schema), not for HTTP request bodies

## Base URL

Local default: `http://localhost:3000/lookup/v1` (matches `servers` in OpenAPI).

## Environment

Copy [`apps/api/.env.example`](../../apps/api/.env.example) to `apps/api/.env` and adjust:

- `MONGODB_URI`, `MONGODB_DB`, `PORT`, `LOG_LEVEL`, `NODE_ENV`

## Tests

| Command | Purpose |
|---------|---------|
| `npm run test` (from repo root) | Vitest: library unit tests + Supertest integration tests with **mongodb-memory-server** |
| `npm run test:functional` | Newman runs [`apps/api/postman/functional.postman_collection.json`](../../apps/api/postman/functional.postman_collection.json) against an in-memory server (generates a temp `.xlsx` for import) |

## Design sample Postman

The design-only collection under [postman/](./postman/) may still reference Bearer auth. For automated runs against the current API, use the **functional** collection in `apps/api/postman/` or clear collection auth in Postman.

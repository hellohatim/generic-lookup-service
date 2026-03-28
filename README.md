# Generic lookup service

Monorepo for the **multi-tenant lookup** product documented under [`docs/lookup-service/`](docs/lookup-service/README.md).

## Prerequisites

| Tool | Notes |
|------|--------|
| **Node.js** | v20+ (repo tested with v24) |
| **npm** | v10+ |
| **MongoDB** | v7 recommended; optional for **unit/integration tests** (they use [mongodb-memory-server](https://github.com/nodkz/mongodb-memory-server)) |

Start Mongo locally:

```bash
docker compose up -d
```

Default connection: `mongodb://127.0.0.1:27017` (see [`apps/api/.env.example`](apps/api/.env.example)).

## Apps

| Package | Description |
|---------|-------------|
| [`apps/api`](apps/api) | REST API — Express + TypeScript + MongoDB, contract validated with `express-openapi-validator` against [`docs/lookup-service/openapi.yaml`](docs/lookup-service/openapi.yaml) |
| [`apps/web`](apps/web) | UI placeholder (Angular to be added later) |

## Commands (from repo root)

```bash
npm install
npm run dev          # API dev server (tsx watch)
npm run build        # compile API
npm run test         # Vitest: unit + integration (downloads Mongo binary on first run)
npm run test:functional   # Newman Postman collection against ephemeral in-memory API
```

## Security note

JWT and perimeter hardening are **not enabled** in the current API build (local/dev trust model). Do not expose this stack to the public internet until auth and security middleware are restored. See [`docs/lookup-service/implementation.md`](docs/lookup-service/implementation.md).

## Dependency audit

Run `npm audit` regularly. Some transitive warnings come from Newman/Postman runtime; review before applying `--force` upgrades.

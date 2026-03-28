# Generic multi-tenant lookup service — design package

This folder holds the **product specification** for a multi-tenant key-value lookup product: REST API (OpenAPI 3), MongoDB model, auth rules, and UI UX. A **reference Node/TypeScript API** is implemented in the monorepo at [`apps/api`](../../apps/api); see [implementation.md](./implementation.md) for how it maps to this spec.

Clients may send **`X-Request-Id`** / **`X-Correlation-Id`**; see [observability.md](./observability.md).

## Contents

| Document | Description |
|----------|-------------|
| [openapi.yaml](./openapi.yaml) | OpenAPI 3.0.3: tenants, namespaces, tables (deprecation / expiry / **`valueSchema`** / soft-delete), versions, **Excel** + **JSON** bulk, **export** `.xlsx`, import audit, entries (offset + **cursor** pagination), correlation headers |
| [mongodb-data-model.md](./mongodb-data-model.md) | Collections, indexes, table lifecycle, **`lookup_table_versions`**, **`lookup_import_audit`** (incl. **`format: json`**), entries, `valueString` / `valueType`, cursor sort notes |
| [auth-tenant.md](./auth-tenant.md) | JWT claims, path-scoped tenant resolution, `platform_admin` vs `tenant_user` |
| [ui-design.md](./ui-design.md) | Sitemap, table-detail search UX, export, bulk JSON, lifecycle, schema, empty and error states |
| [observability.md](./observability.md) | Correlation headers, structured logging fields, metrics |
| [ai/README.md](./ai/README.md) | **Knowledge map** for maintainers and AI agents (spec index, domain diagram, change checklist) |

## Tooling and samples

| Artifact | Purpose |
|----------|---------|
| [postman/lookup-service.postman_collection.json](./postman/lookup-service.postman_collection.json) | Example HTTP calls (import into Postman) |
| [postman/lookup-service.postman_environment.json](./postman/lookup-service.postman_environment.json) | Environment template (`baseUrl`, JWT, seeded ObjectIds) |
| [scripts/seed/](./scripts/seed/) | `mongosh` script + README for **local Mongo demo data** (IDs match Postman defaults) |
| [.github/copilot-instructions.md](../../.github/copilot-instructions.md) | **GitHub Copilot** repository hints (paths, spec order, product rules) |
| [tools/](./tools/) | **Node 18+** unit tests: OpenAPI validation, Postman assets, seed script checks (`npm install` then `npm test`) |
| [implementation.md](./implementation.md) | Runtime API: env vars, tests, security notes |
| Repo root [README.md](../../README.md) | Monorepo commands (`npm run dev`, `npm run test`, Docker Mongo) |

## Domain glossary

| Term | Definition |
|------|------------|
| **Tenant** | Isolation boundary (account). Owns namespaces and all descendant data. |
| **Namespace** | Grouping inside a tenant; has a **slug** unique per tenant. |
| **Lookup table** | Named logical container; **slug** unique per namespace. Points to a **current version**. |
| **Table version** | Immutable snapshot (**versionNumber** per table). Entries belong to one version. |
| **Current version** | The `lookup_tables.currentVersionId`; target for CRUD and default `GET .../entries`. |
| **Entry** | One **key**–**value** row in a **table version**; **key** unique per `(table, version)`. |
| **Import audit** | One record per bulk upload attempt (`lookup_import_audit`): actor, file, mode, result, details. |
| **Deprecated table** | `isDeprecated` with optional schedule; **`deprecatedAt`** when marked; **`expiresAt`** optional sunset (UTC). |
| **Expired table** | **`expiresAt`** set and **now (UTC) >= `expiresAt`**; **`isExpired`** is **false** if **`expiresAt`** is null. Mutating APIs return **403** (`TABLE_EXPIRED`) or **410** (one choice per deployment); **`isDeprecated` alone does not block writes** by default. Reads and **export** typically remain. |
| **valueSchema** | Optional JSON Schema (draft 2020-12) on a table; invalid **`value`** → **422** `VALIDATION_ERROR`. |
| **Slug** | URL-safe identifier; pattern `^[a-z0-9][a-z0-9-]{1,62}$` in API requests. |

## Search semantics (summary)

- **`versionId`:** optional on `GET .../entries` and **read** by-key; omit to use **current** version. Mutating entry APIs always use the current version (see OpenAPI).
- **Key:** `key` query parameter = **exact** match on entry key; optional `keyPrefix` for prefix search.
- **Value:** `value` + `valueMatch`:
  - **`exact`** — equality on the normalized **`valueString`** field (see data model).
  - **`partial`** — substring match for **string** values only; other BSON types return **422** or empty results per implementation (document in release notes).
- **`caseSensitive`:** default **false** for string comparisons when applicable.

## Bulk import (summary)

- **`POST .../imports`:** multipart `.xlsx`; **`mode`:** `new_version` \| `overwrite_current`; **`format`:** `wide` \| `kv`.
- **`wide`:** row 1 = keys (headers), row 2 = values (strings in v1).
- Every attempt creates an **import audit** row; **`async=true`** may return **202** with poll URL.

## Deprecation and sunset (summary)

- **List tables:** query `includeDeprecated` (default true), `hideExpired` (default false), `includeDeleted` (default false). **`hideExpired`:** omit rows where **`expiresAt`** is set and **now (UTC) >= `expiresAt`** — same as **`isExpired`**.
- **Mutations** (entries, new versions, imports) blocked after expiry unless **`PATCH .../tables/{tableId}`** lifts deprecation or extends **`expiresAt`** (see OpenAPI and `ui-design.md`).
- Responses may include **`Deprecation`** / **`Sunset`** headers (RFC 8594) on **GET** table for automated clients.

## Bulk JSON and export

- **`POST .../entries/bulk`:** array of `{ key, value }` with **`new_version` / `overwrite_current`**; audit **`format: json`**. Max items per request (e.g. 10k) per OpenAPI.
- **`GET .../exports`:** download **`.xlsx`** for a version (`wide` or `kv`); allowed when table is **expired** (read-only DR) unless overridden.

## Pagination (entries)

- **`page` / `pageSize`** or **`cursor` / `limit`** with **`meta.nextCursor`** (mutually exclusive cursor vs offset—see OpenAPI).

## Soft delete

- Namespaces and tables: **`DELETE`** default = soft (`deletedAt`); **`POST .../restore`**; **`permanent=true`** hard-delete (operator).

## Viewing the OpenAPI spec

Use any OpenAPI 3 viewer (Swagger UI, Redocly, Stoplight) and point it at `docs/lookup-service/openapi.yaml`.

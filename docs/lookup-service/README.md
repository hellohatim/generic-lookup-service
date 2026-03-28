# Generic multi-tenant lookup service — design package

This folder holds the **product specification** for a multi-tenant key-value lookup product: REST API (OpenAPI 3), MongoDB model, auth rules, and UI UX. A **reference Node/TypeScript API** is implemented in the monorepo at [`apps/api`](../../apps/api); see [implementation.md](./implementation.md) for how it maps to this spec.

Clients may send **`X-Request-Id`** / **`X-Correlation-Id`**; see [observability.md](./observability.md).

## Contents

| Document | Description |
|----------|-------------|
| [`apps/api/openapi.yaml`](../../apps/api/openapi.yaml) | **Authoritative** OpenAPI 3.0.3 (loaded by the reference API): tenants, namespaces, tables (deprecation / expiry / **`valueSchema`** / soft-delete), versions, **Excel** + **JSON** bulk, **export** `.xlsx`, import audit, entries (offset + **cursor** pagination), correlation headers |
| [mongodb-data-model.md](./mongodb-data-model.md) | Collections, indexes, table lifecycle, **`sys_*`** metadata, **`sys_lookup_table_versions`**, **`sys_lookup_import_audit`** (incl. **`format: json`**), per-version entry collections, `valueString` / `valueType`, cursor sort notes |
| [auth-tenant.md](./auth-tenant.md) | JWT claims, path-scoped tenant resolution, `platform_admin` vs `tenant_user` |
| [ui-design.md](./ui-design.md) | Sitemap, table-detail search UX, export, bulk JSON, lifecycle, schema, empty and error states |
| [observability.md](./observability.md) | Correlation headers, structured logging fields, metrics |
| [ai/README.md](./ai/README.md) | **Knowledge map** for maintainers and AI agents (spec index, domain diagram, change checklist) |

## Tooling and samples (in `apps/api`)

| Artifact | Purpose |
|----------|---------|
| [`apps/api/postman/design-sample.postman_collection.json`](../../apps/api/postman/design-sample.postman_collection.json) | Manual / design HTTP calls (Bearer auth template) |
| [`apps/api/postman/design-sample.postman_environment.json`](../../apps/api/postman/design-sample.postman_environment.json) | Environment template (`baseUrl`, JWT, seeded ObjectIds) |
| [`apps/api/postman/functional.postman_collection.json`](../../apps/api/postman/functional.postman_collection.json) | Automated Newman flow (no auth) |
| [`apps/api/scripts/seed/`](../../apps/api/scripts/seed/) | `mongosh` script + README for **local Mongo demo data** (IDs match Postman defaults) |
| [`apps/api/scripts/seed-company-lookup.ts`](../../apps/api/scripts/seed-company-lookup.ts) | **`npm run seed:company`** — creates tenant `company-seed` + **10k** company rows (`CN########` keys, object `value` with `name`, `street1`, `street2`, `city`, `zipcode`) |
| [`apps/api/scripts/contract-tests/`](../../apps/api/scripts/contract-tests/) | **`npm run test:contract`** — OpenAPI parse/validate, Postman JSON sanity, seed script checks |
| [implementation.md](./implementation.md) | Runtime API: env vars, tests, security notes |
| Repo root [README.md](../../README.md) | Monorepo commands (`npm run dev`, `npm run test`, Docker Mongo) |

## Domain glossary

| Term | Definition |
|------|------------|
| **Tenant** | Isolation boundary (account). Owns namespaces and all descendant data. |
| **Namespace** | Grouping inside a tenant; has a **slug** unique per tenant. |
| **Lookup table** | Named logical container; **slug** unique per namespace. Points to a **current version**. |
| **Table version** | Immutable snapshot (**versionNumber** per table). Entries belong to one version. |
| **Current version** | The `sys_lookup_tables.currentVersionId`; target for CRUD and default `GET .../entries`. |
| **Entry** | One **key**–**value** row in a **table version**; **key** unique per `(table, version)`. |
| **Import audit** | One record per bulk upload attempt (`sys_lookup_import_audit`): actor, file, mode, result, details. |
| **Deprecated table** | `isDeprecated` with optional schedule; **`deprecatedAt`** when marked; **`expiresAt`** optional sunset (UTC). |
| **Expired table** | **`expiresAt`** set and **now (UTC) >= `expiresAt`**; **`isExpired`** is **false** if **`expiresAt`** is null. Mutating APIs return **403** (`TABLE_EXPIRED`) or **410** (one choice per deployment); **`isDeprecated` alone does not block writes** by default. Reads and **export** typically remain. |
| **valueSchema** | Optional JSON Schema (draft 2020-12) on a table; invalid **`value`** → **422** `VALIDATION_ERROR`. |
| **Slug** | URL-safe identifier; pattern `^[a-z0-9][a-z0-9-]{1,62}$` in API requests. |

## Search semantics (summary)

- **`versionId`:** optional on `GET .../entries` (and `POST .../entries/search`); omit to use **current** version. Mutating entry APIs always use the current version (see OpenAPI).
- **Key:** `key` query parameter = **exact** match on entry key; optional `keyPrefix` for prefix search.
- **Value:** `value` + `valueMatch`:
  - **`exact`** — equality on the normalized **`valueString`** field (see data model).
  - **`partial`** — substring match for **string** values only; other BSON types return **422** or empty results per implementation (document in release notes).
- **`caseSensitive`:** default **false** for string comparisons when applicable.

### `POST .../entries/search` (boolean query)

- **Legacy:** flat **`filters`** array (**AND** only), plus optional top-level **`key`** / **`valuePath`** — see OpenAPI.
- **Boolean mode:** set **`query`** to a recursive tree: **`{ "op": "and"|"or", "clauses": [...] }`** with leaf nodes **`kind`**: **`keyExact`**, **`keyPrefix`**, **`valueRoot`** (root string / `valueString`), **`valuePath`** (dot path under **`value`**). When **`query`** is present, legacy filter fields are ignored. **`match`:** `exact` \| `partial` (see OpenAPI).

## Bulk import (summary)

- **`POST .../imports`:** multipart `.xlsx`; **`mode`:** `new_version` \| `overwrite_current`; **`format`:** **`wide`** \| **`kv`** \| **`flat_object`**.
- **`wide`:** row 1 = keys (headers), row 2 = values (one row of cell values).
- **`kv`:** columns **`Key`**, **`Value`**; many rows.
- **`flat_object`:** row 1 = **`key`** + one column per top-level **`value`** field (union of keys, sorted on export) + optional **`_scalar`** for non-object values; see [mongodb-data-model.md](./mongodb-data-model.md).
- Every attempt creates an **import audit** row; **`async=true`** may return **202** with poll URL.

## Deprecation and sunset (summary)

- **List tables:** query `includeDeprecated` (default true), `hideExpired` (default false), `includeDeleted` (default false). **`hideExpired`:** omit rows where **`expiresAt`** is set and **now (UTC) >= `expiresAt`** — same as **`isExpired`**.
- **Mutations** (entries, new versions, imports) blocked after expiry unless **`PATCH .../tables/{tableId}`** lifts deprecation or extends **`expiresAt`** (see OpenAPI and `ui-design.md`).
- Responses may include **`Deprecation`** / **`Sunset`** headers (RFC 8594) on **GET** table for automated clients.

## Bulk JSON and export

- **`POST .../entries/bulk`:** array of `{ key, value }` with **`new_version` / `overwrite_current`**; audit **`format: json`**. Max items per request (e.g. 10k) per OpenAPI.
- **`GET .../exports`:** download **`.xlsx`** for a version; **`format`:** **`wide`** \| **`kv`** \| **`flat_object`** (tabular: **`key`**, sorted object field columns, **`_scalar`**). Allowed when table is **expired** (read-only DR) unless overridden.

## Pagination (entries)

- **`page` / `pageSize`** or **`cursor` / `limit`** with **`meta.nextCursor`** (mutually exclusive cursor vs offset—see OpenAPI).

## Soft delete

- Namespaces and tables: **`DELETE`** default = soft (`deletedAt`); **`POST .../restore`**; **`permanent=true`** hard-delete (operator).

## Viewing the OpenAPI spec

Use any OpenAPI 3 viewer (Swagger UI, Redocly, Stoplight) and point it at [`apps/api/openapi.yaml`](../../apps/api/openapi.yaml).

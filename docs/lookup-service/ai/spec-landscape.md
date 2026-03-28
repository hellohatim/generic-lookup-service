# Spec landscape (topic → source of truth)

| Topic | Authoritative doc | Notes |
|-------|-------------------|--------|
| REST paths, request/response shapes, status codes | [`apps/api/openapi.yaml`](../../../apps/api/openapi.yaml) | Includes cursor pagination, bulk JSON, export query params |
| JWT claims, `tenantId` in path, roles | [auth-tenant.md](../auth-tenant.md) | `platform_admin` vs `tenant_user` |
| Collection names, fields, indexes, search (`valueString` / `valueType`) | [mongodb-data-model.md](../mongodb-data-model.md) | Align seed script with this |
| Screens, banners, flows, filters | [ui-design.md](../ui-design.md) | Deprecation banners, import sheet name, export button |
| Correlation headers, logging fields, metrics | [observability.md](../observability.md) | Optional `X-Request-Id` / `X-Correlation-Id` |
| Glossary and reading order | [README.md](../README.md) | Entry point for humans |
| Sample HTTP calls | [`apps/api/postman/`](../../../apps/api/postman/) | Design sample + functional collections; stay in sync with OpenAPI |
| Local Mongo sample documents | [`apps/api/scripts/seed/`](../../../apps/api/scripts/seed/) | Dev-only; IDs documented for Postman |
| Company demo seed (10k rows) | [`apps/api/scripts/seed-company-lookup.ts`](../../../apps/api/scripts/seed-company-lookup.ts) | **`npm run seed:company`** |

## Cross-cutting behaviors (verify in OpenAPI)

| Behavior | Where to look |
|----------|----------------|
| Soft delete / restore / `permanent` | `DELETE` namespace & table, `POST .../restore`, `includeDeleted` on lists |
| `hideExpired` vs `isExpired` | `listLookupTables`, `LookupTable.isExpired` |
| Excel import `sheetName` | `POST .../imports` multipart |
| Excel import / export **`flat_object`** | `POST .../imports` `format`; `GET .../exports` `format` |
| Entry list `cursor` + `meta.nextCursor` | `GET .../entries`, `PaginationMeta` |
| `POST .../entries/search` **`query`** tree | Boolean AND/OR; leaves `keyExact`, `keyPrefix`, `valueRoot`, `valuePath` |
| `valueSchema` + **422** | Table create/patch, entry create/patch, bulk JSON |
| Bulk JSON audit `format: json` | `sys_lookup_import_audit` in Mongo doc; `BulkUpsertEntriesRequest` |

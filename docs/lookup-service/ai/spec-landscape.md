# Spec landscape (topic → source of truth)

| Topic | Authoritative doc | Notes |
|-------|-------------------|--------|
| REST paths, request/response shapes, status codes | [openapi.yaml](../openapi.yaml) | Includes cursor pagination, bulk JSON, export query params |
| JWT claims, `tenantId` in path, roles | [auth-tenant.md](../auth-tenant.md) | `platform_admin` vs `tenant_user` |
| Collection names, fields, indexes, search (`valueString` / `valueType`) | [mongodb-data-model.md](../mongodb-data-model.md) | Align seed script with this |
| Screens, banners, flows, filters | [ui-design.md](../ui-design.md) | Deprecation banners, import sheet name, export button |
| Correlation headers, logging fields, metrics | [observability.md](../observability.md) | Optional `X-Request-Id` / `X-Correlation-Id` |
| Glossary and reading order | [README.md](../README.md) | Entry point for humans |
| Sample HTTP calls | [postman/](../postman/) | Must stay in sync with `servers` and paths in OpenAPI |
| Local Mongo sample documents | [scripts/seed/](../scripts/seed/) | Dev-only; IDs documented for Postman |

## Cross-cutting behaviors (verify in OpenAPI)

| Behavior | Where to look |
|----------|----------------|
| Soft delete / restore / `permanent` | `DELETE` namespace & table, `POST .../restore`, `includeDeleted` on lists |
| `hideExpired` vs `isExpired` | `listLookupTables`, `LookupTable.isExpired` |
| Excel import `sheetName` | `POST .../imports` multipart |
| Entry list `cursor` + `meta.nextCursor` | `GET .../entries`, `PaginationMeta` |
| `valueSchema` + **422** | Table create/patch, entry create/patch, bulk JSON |
| Bulk JSON audit `format: json` | `lookup_import_audit` in Mongo doc; `BulkUpsertEntriesRequest` |

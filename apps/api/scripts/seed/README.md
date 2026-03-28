**Local development only.** Inserts a minimal, **consistent** graph of documents matching [mongodb-data-model.md](../../../../docs/lookup-service/mongodb-data-model.md). Uses **fixed ObjectIds** so you can paste the same strings into Postman environment variables.

## Prerequisites

- [MongoDB Shell (`mongosh`)](https://www.mongodb.com/docs/mongodb-shell/) installed.

## Run

From the repository root (or any directory), pointing at your database (example name `lookup_demo`):

```bash
mongosh "mongodb://localhost:27017/lookup_demo" --file apps/api/scripts/seed/seed-lookup-demo.mongo.js
```

Or with authentication:

```bash
mongosh "mongodb://user:pass@localhost:27017/lookup_demo?authSource=admin" --file apps/api/scripts/seed/seed-lookup-demo.mongo.js
```

The script **removes prior demo rows** with the same `_id` values, then inserts fresh data.

## Demo IDs (for Postman)

After running the script, set:

| Variable | Value |
|----------|--------|
| `tenantId` | `a1b2c3d4e5f60718293a4b5c` |
| `namespaceId` | `a1b2c3d4e5f60718293a4b5d` |
| `tableId` | `a1b2c3d4e5f60718293a4b5e` |
| `versionId` | `a1b2c3d4e5f60718293a4b5f` |
| `importAuditId` | `a1b2c3d4e5f60718293a4b62` |

`baseUrl` in Postman should match your API gateway (e.g. `http://localhost:3000/lookup/v1`). The seed data does **not** start a REST server.

## Collections touched

- Metadata: `sys_tenants`, `sys_namespaces`, `sys_lookup_tables`, `sys_lookup_table_versions`, `sys_lookup_import_audit`
- Per-version user data: `demo_tenant_demo_ns_demo_table_1` (see `entriesCollection` on the version document; matches [mongodb-data-model.md](../../../../docs/lookup-service/mongodb-data-model.md))

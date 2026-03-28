# Domain model (logical)

## Entity hierarchy

```mermaid
erDiagram
  Tenant ||--o{ Namespace : contains
  Namespace ||--o{ LookupTable : contains
  LookupTable ||--o{ TableVersion : has
  TableVersion ||--o{ LookupEntry : contains
  LookupTable ||--o{ ImportAudit : logs

  Tenant {
    ObjectId _id
    string slug
    string status
  }

  Namespace {
    ObjectId _id
    ObjectId tenantId
    string slug
    date deletedAt
  }

  LookupTable {
    ObjectId _id
    ObjectId currentVersionId
    bool isDeprecated
    date expiresAt
    object valueSchema
    date deletedAt
  }

  TableVersion {
    ObjectId _id
    ObjectId tableId
    int versionNumber
  }

  LookupEntry {
    ObjectId _id
    ObjectId versionId
    string key
    mixed value
  }

  ImportAudit {
    ObjectId _id
    ObjectId tableId
    string format
    string status
  }
```

## Lifecycle sidecars

- **Deprecation:** `isDeprecated`, `deprecatedAt`, `expiresAt` on `sys_lookup_tables`. **Expiry** blocks mutations (403/410); reads/export often remain.
- **Soft delete:** `deletedAt` / `deletedBy` on `sys_namespaces` and `sys_lookup_tables`; lists default to `includeDeleted=false`.
- **Versioning:** Mutable entry APIs target **current** `sys_lookup_table_versions` row; historical reads use `versionId` query parameter.

## API resource mapping (typical)

| Resource | Mongo collection(s) |
|----------|---------------------|
| Tenant | `sys_tenants` |
| Namespace | `sys_namespaces` |
| Lookup table | `sys_lookup_tables` |
| Table version | `sys_lookup_table_versions` |
| Entry | Physical collection per version: `<tenantSlug>_<namespaceSlug>_<tableSlug>_<versionNumber>` (hyphens in slugs → `_`; see `sys_lookup_table_versions.entriesCollection`) |
| Import / bulk audit | `sys_lookup_import_audit` |

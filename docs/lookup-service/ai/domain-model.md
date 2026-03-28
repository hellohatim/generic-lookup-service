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

- **Deprecation:** `isDeprecated`, `deprecatedAt`, `expiresAt` on `lookup_tables`. **Expiry** blocks mutations (403/410); reads/export often remain.
- **Soft delete:** `deletedAt` / `deletedBy` on `namespaces` and `lookup_tables`; lists default to `includeDeleted=false`.
- **Versioning:** Mutable entry APIs target **current** `lookup_table_versions` row; historical reads use `versionId` query parameter.

## API resource mapping (typical)

| Resource | Mongo collection(s) |
|----------|---------------------|
| Tenant | `tenants` |
| Namespace | `namespaces` |
| Lookup table | `lookup_tables` |
| Table version | `lookup_table_versions` |
| Entry | `lookup_entries` |
| Import / bulk audit | `lookup_import_audit` |

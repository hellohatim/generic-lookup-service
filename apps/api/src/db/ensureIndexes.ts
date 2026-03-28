import type { Db } from "mongodb";

export async function ensureIndexes(db: Db): Promise<void> {
  await db.collection("tenants").createIndex({ slug: 1 }, { unique: true });

  await db
    .collection("namespaces")
    .createIndex({ tenantId: 1, slug: 1 }, { unique: true });
  await db.collection("namespaces").createIndex({ tenantId: 1, _id: 1 });

  await db
    .collection("lookup_tables")
    .createIndex({ tenantId: 1, namespaceId: 1, slug: 1 }, { unique: true });
  await db.collection("lookup_tables").createIndex({ tenantId: 1, namespaceId: 1 });

  await db
    .collection("lookup_table_versions")
    .createIndex({ tableId: 1, versionNumber: 1 }, { unique: true });
  await db
    .collection("lookup_table_versions")
    .createIndex({ tenantId: 1, tableId: 1, _id: -1 });

  await db.collection("lookup_entries").createIndex(
    { tenantId: 1, tableId: 1, versionId: 1, key: 1 },
    { unique: true }
  );
  await db
    .collection("lookup_entries")
    .createIndex({ tenantId: 1, tableId: 1, versionId: 1, valueString: 1 });
  await db
    .collection("lookup_entries")
    .createIndex({ tenantId: 1, tableId: 1, versionId: 1, _id: 1 });

  await db
    .collection("lookup_import_audit")
    .createIndex({ tenantId: 1, tableId: 1, startedAt: -1 });
}

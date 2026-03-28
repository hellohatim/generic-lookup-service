import type { Db } from "mongodb";
import { sysColl } from "./collections.js";

export async function ensureIndexes(db: Db): Promise<void> {
  await db.collection(sysColl.tenants).createIndex({ slug: 1 }, { unique: true });

  await db
    .collection(sysColl.namespaces)
    .createIndex({ tenantId: 1, slug: 1 }, { unique: true });
  await db.collection(sysColl.namespaces).createIndex({ tenantId: 1, _id: 1 });

  await db
    .collection(sysColl.lookupTables)
    .createIndex({ tenantId: 1, namespaceId: 1, slug: 1 }, { unique: true });
  await db.collection(sysColl.lookupTables).createIndex({ tenantId: 1, namespaceId: 1 });

  await db
    .collection(sysColl.lookupTableVersions)
    .createIndex({ tableId: 1, versionNumber: 1 }, { unique: true });
  await db
    .collection(sysColl.lookupTableVersions)
    .createIndex({ tenantId: 1, tableId: 1, _id: -1 });

  /** Per-version user collections: `<tenant>_<namespace>_<table>_<version>` (hyphens→`_`) — indexes created when each version is created */

  await db
    .collection(sysColl.lookupImportAudit)
    .createIndex({ tenantId: 1, tableId: 1, startedAt: -1 });
}

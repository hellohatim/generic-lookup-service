import type { Db, ObjectId } from "mongodb";
import { sysColl } from "../database/collections.js";
import { AppError, NotFoundError } from "../utils/errors.js";
import { requireNamespace, requireTenant } from "./mongoUtil.js";

/** MongoDB limits; keep names short and safe */
const MAX_NAME_LEN = 120;

/** Slugs may use hyphens in the API; collection names use underscores. */
function slugSegment(slug: string): string {
  return slug.replace(/-/g, "_");
}

/**
 * One physical collection per table **version** (no `lookup_` prefix; distinct from `sys_*` metadata):
 * `<tenantSlug>_<namespaceSlug>_<tableSlug>_<versionNumber>` with hyphens in slugs turned into `_`.
 */
export function makeEntriesCollectionName(
  tenantSlug: string,
  namespaceSlug: string,
  tableSlug: string,
  versionNumber: number
): string {
  const name = `${slugSegment(tenantSlug)}_${slugSegment(namespaceSlug)}_${slugSegment(tableSlug)}_${versionNumber}`;
  assertValidCollectionName(name);
  return name;
}

export function assertValidCollectionName(name: string): void {
  if (!name || name.length > MAX_NAME_LEN) {
    throw new AppError(
      400,
      "BAD_REQUEST",
      "Entries collection name is empty or exceeds maximum length; shorten tenant/namespace/table slugs"
    );
  }
  if (name.includes("\0") || name.includes("$")) {
    throw new AppError(400, "BAD_REQUEST", "Invalid character in resolved collection name");
  }
  if (name.startsWith("system.")) {
    throw new AppError(400, "BAD_REQUEST", "Invalid collection name prefix");
  }
  if (name.startsWith("sys_")) {
    throw new AppError(
      400,
      "BAD_REQUEST",
      "User data collection name cannot start with sys_; adjust tenant, namespace, or table slugs"
    );
  }
}

export async function ensureEntryCollectionIndexes(
  db: Db,
  collectionName: string
): Promise<void> {
  const c = db.collection(collectionName);
  await c.createIndex({ key: 1 }, { unique: true });
  await c.createIndex({ valueString: 1 });
  await c.createIndex({ _id: 1 });
}

export async function dropEntryCollectionIfExists(
  db: Db,
  collectionName: string
): Promise<void> {
  const cols = await db
    .listCollections({ name: collectionName }, { nameOnly: true })
    .toArray();
  if (cols.length > 0) {
    await db.collection(collectionName).drop();
  }
}

export async function getEntriesCollectionForVersion(
  db: Db,
  tenantId: ObjectId,
  tableId: ObjectId,
  versionId: ObjectId
): Promise<string> {
  const v = await db.collection(sysColl.lookupTableVersions).findOne({
    _id: versionId,
    tableId,
    tenantId,
  });
  if (!v) throw new NotFoundError("NOT_FOUND", "Version not found");
  const name = v.entriesCollection;
  if (typeof name !== "string" || !name) {
    throw new AppError(
      500,
      "INTERNAL_ERROR",
      "Table version is missing entriesCollection (data created before per-version collections)"
    );
  }
  return name;
}

export async function slugsForTableCreate(
  db: Db,
  tenantId: ObjectId,
  namespaceId: ObjectId,
  tableSlug: string
): Promise<{ tenantSlug: string; namespaceSlug: string; tableSlug: string }> {
  const tenant = await requireTenant(db, tenantId);
  const ns = await requireNamespace(db, tenantId, namespaceId);
  return {
    tenantSlug: tenant.slug as string,
    namespaceSlug: ns.slug as string,
    tableSlug,
  };
}

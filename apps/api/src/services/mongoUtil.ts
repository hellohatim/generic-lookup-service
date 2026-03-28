import type { Db, ObjectId } from "mongodb";
import { NotFoundError } from "../lib/errors.js";

export async function requireTenant(
  db: Db,
  tenantId: ObjectId,
  opts?: { includeDeleted?: boolean }
) {
  const q: Record<string, unknown> = { _id: tenantId };
  if (!opts?.includeDeleted) q.deletedAt = null;
  const t = await db.collection("tenants").findOne(q);
  if (!t) throw new NotFoundError("NOT_FOUND", "Tenant not found");
  return t as Record<string, unknown> & { _id: ObjectId };
}

export async function requireNamespace(
  db: Db,
  tenantId: ObjectId,
  namespaceId: ObjectId,
  opts?: { includeDeleted?: boolean }
) {
  const q: Record<string, unknown> = {
    _id: namespaceId,
    tenantId,
  };
  if (!opts?.includeDeleted) q.deletedAt = null;
  const n = await db.collection("namespaces").findOne(q);
  if (!n) throw new NotFoundError("NOT_FOUND", "Namespace not found");
  return n as Record<string, unknown> & { _id: ObjectId };
}

export async function requireTable(
  db: Db,
  tenantId: ObjectId,
  namespaceId: ObjectId,
  tableId: ObjectId,
  opts?: { includeDeleted?: boolean }
) {
  const q: Record<string, unknown> = {
    _id: tableId,
    tenantId,
    namespaceId,
  };
  if (!opts?.includeDeleted) q.deletedAt = null;
  const t = await db.collection("lookup_tables").findOne(q);
  if (!t) throw new NotFoundError("NOT_FOUND", "Table not found");
  return t as Record<string, unknown> & { _id: ObjectId; currentVersionId: ObjectId };
}

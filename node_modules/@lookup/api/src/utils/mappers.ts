import type { ObjectId } from "mongodb";
import { isExpiredUtc } from "./tableExpiry.js";

export function iso(d: Date): string {
  return d.toISOString();
}

export function mapTenant(d: {
  _id: ObjectId;
  slug: string;
  name: string;
  status: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: d._id.toHexString(),
    slug: d.slug,
    name: d.name,
    status: d.status,
    ...(d.metadata !== undefined ? { metadata: d.metadata } : {}),
    createdAt: iso(d.createdAt),
    updatedAt: iso(d.updatedAt),
  };
}

export function mapNamespace(d: {
  _id: ObjectId;
  tenantId: ObjectId;
  slug: string;
  name: string;
  description?: string | null;
  deletedAt?: Date | null;
  deletedBy?: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: d._id.toHexString(),
    tenantId: d.tenantId.toHexString(),
    slug: d.slug,
    name: d.name,
    description: d.description ?? null,
    deletedAt: d.deletedAt ? iso(d.deletedAt) : null,
    deletedBy: d.deletedBy ?? null,
    createdAt: iso(d.createdAt),
    updatedAt: iso(d.updatedAt),
  };
}

export function mapTable(d: {
  _id: ObjectId;
  tenantId: ObjectId;
  namespaceId: ObjectId;
  slug: string;
  name: string;
  description?: string | null;
  currentVersionId: ObjectId;
  currentVersionNumber: number;
  isDeprecated: boolean;
  deprecatedAt?: Date | null;
  expiresAt?: Date | null;
  valueSchema?: Record<string, unknown> | null;
  deletedAt?: Date | null;
  deletedBy?: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  const expired = isExpiredUtc(d.expiresAt ?? null);
  return {
    id: d._id.toHexString(),
    tenantId: d.tenantId.toHexString(),
    namespaceId: d.namespaceId.toHexString(),
    slug: d.slug,
    name: d.name,
    description: d.description ?? null,
    currentVersionId: d.currentVersionId.toHexString(),
    currentVersionNumber: d.currentVersionNumber,
    isDeprecated: d.isDeprecated,
    deprecatedAt: d.deprecatedAt ? iso(d.deprecatedAt) : null,
    expiresAt: d.expiresAt ? iso(d.expiresAt) : null,
    isExpired: expired,
    valueSchema: d.valueSchema ?? null,
    deletedAt: d.deletedAt ? iso(d.deletedAt) : null,
    deletedBy: d.deletedBy ?? null,
    createdAt: iso(d.createdAt),
    updatedAt: iso(d.updatedAt),
  };
}

export function mapVersion(d: {
  _id: ObjectId;
  tenantId: ObjectId;
  tableId: ObjectId;
  versionNumber: number;
  label?: string | null;
  createdAt: Date;
  createdBy?: string | null;
  source: string;
  entryCount?: number | null;
  importAuditId?: ObjectId | null;
}) {
  return {
    id: d._id.toHexString(),
    tenantId: d.tenantId.toHexString(),
    tableId: d.tableId.toHexString(),
    versionNumber: d.versionNumber,
    label: d.label ?? null,
    createdAt: iso(d.createdAt),
    createdBy: d.createdBy ?? "anonymous",
    source: d.source,
    entryCount: d.entryCount ?? null,
    importAuditId: d.importAuditId ? d.importAuditId.toHexString() : null,
  };
}

/** Entry payloads omit tenant/namespace/table/version ids — the request path supplies them. */
export function mapEntryRow(d: {
  _id: ObjectId;
  key: string;
  value: unknown;
  valueType: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: d._id.toHexString(),
    key: d.key,
    value: d.value,
    valueType: d.valueType,
    createdAt: iso(d.createdAt),
    updatedAt: iso(d.updatedAt),
  };
}

export function mapImportAudit(d: {
  _id: ObjectId;
  tenantId: ObjectId;
  tableId: ObjectId;
  actorSub: string;
  filename?: string | null;
  fileSize?: number | null;
  sha256?: string | null;
  mode: string;
  format: string;
  status: string;
  startedAt: Date;
  completedAt?: Date | null;
  previousVersionId?: ObjectId | null;
  resultingVersionId: ObjectId;
  stats?: {
    keysParsed?: number;
    entriesWritten?: number;
    warningsCount?: number;
    errorsCount?: number;
  };
  details?: Array<{
    code?: string;
    message?: string;
    cell?: string | null;
    key?: string | null;
  }>;
}) {
  return {
    id: d._id.toHexString(),
    tenantId: d.tenantId.toHexString(),
    tableId: d.tableId.toHexString(),
    actorSub: d.actorSub,
    filename: d.filename ?? null,
    fileSize: d.fileSize ?? null,
    sha256: d.sha256 ?? null,
    mode: d.mode,
    format: d.format,
    status: d.status,
    startedAt: iso(d.startedAt),
    completedAt: d.completedAt ? iso(d.completedAt) : null,
    previousVersionId: d.previousVersionId
      ? d.previousVersionId.toHexString()
      : null,
    resultingVersionId: d.resultingVersionId.toHexString(),
    stats: d.stats ?? {
      keysParsed: 0,
      entriesWritten: 0,
      warningsCount: 0,
      errorsCount: 0,
    },
    details: d.details ?? [],
  };
}

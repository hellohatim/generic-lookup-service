export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  nextCursor?: string | null;
}

export interface Paged<T> {
  items: T[];
  meta: PaginationMeta;
}

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  status?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Namespace {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LookupTable {
  id: string;
  tenantId: string;
  namespaceId: string;
  slug: string;
  name: string;
  description?: string | null;
  currentVersionId: string;
  currentVersionNumber: number;
  isDeprecated: boolean;
  deprecatedAt?: string | null;
  expiresAt?: string | null;
  isExpired: boolean;
  valueSchema?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface TableVersion {
  id: string;
  tableId: string;
  versionNumber: number;
  label?: string | null;
  entryCount?: number | null;
  createdAt: string;
}

export interface EntryRow {
  id: string;
  key: string;
  value: unknown;
  valueType: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

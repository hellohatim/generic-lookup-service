/**
 * MongoDB collection names for service metadata.
 * Prefixed with `sys_` so they are distinct from user lookup data collections.
 */
export const sysColl = {
  tenants: "sys_tenants",
  namespaces: "sys_namespaces",
  lookupTables: "sys_lookup_tables",
  lookupTableVersions: "sys_lookup_table_versions",
  lookupImportAudit: "sys_lookup_import_audit",
} as const;

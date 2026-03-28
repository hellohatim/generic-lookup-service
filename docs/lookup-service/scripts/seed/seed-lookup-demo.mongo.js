/**
 * Demo seed for lookup-service MongoDB model.
 * Run: mongosh "mongodb://localhost:27017/<db>" --file seed-lookup-demo.mongo.js
 * See README.md in this folder for Postman ID mapping.
 */

const TENANT_ID = ObjectId('a1b2c3d4e5f60718293a4b5c');
const NAMESPACE_ID = ObjectId('a1b2c3d4e5f60718293a4b5d');
const TABLE_ID = ObjectId('a1b2c3d4e5f60718293a4b5e');
const VERSION_ID = ObjectId('a1b2c3d4e5f60718293a4b5f');
const ENTRY_A_ID = ObjectId('a1b2c3d4e5f60718293a4b60');
const ENTRY_B_ID = ObjectId('a1b2c3d4e5f60718293a4b61');
const AUDIT_ID = ObjectId('a1b2c3d4e5f60718293a4b62');

const now = new Date();
const actorSub = 'seed-script';

// Clean prior demo inserts (order: children first)
db.lookup_entries.deleteMany({ _id: { $in: [ENTRY_A_ID, ENTRY_B_ID] } });
db.lookup_import_audit.deleteMany({ _id: AUDIT_ID });
db.lookup_table_versions.deleteMany({ _id: VERSION_ID });
db.lookup_tables.deleteMany({ _id: TABLE_ID });
db.namespaces.deleteMany({ _id: NAMESPACE_ID });
db.tenants.deleteMany({ _id: TENANT_ID });

db.tenants.insertOne({
  _id: TENANT_ID,
  slug: 'demo-tenant',
  name: 'Demo tenant',
  status: 'active',
  metadata: { seededBy: 'seed-lookup-demo.mongo.js' },
  createdAt: now,
  updatedAt: now,
});

db.namespaces.insertOne({
  _id: NAMESPACE_ID,
  tenantId: TENANT_ID,
  slug: 'demo-ns',
  name: 'Demo namespace',
  description: 'Seeded for local dev',
  deletedAt: null,
  deletedBy: null,
  createdAt: now,
  updatedAt: now,
});

db.lookup_table_versions.insertOne({
  _id: VERSION_ID,
  tenantId: TENANT_ID,
  tableId: TABLE_ID,
  versionNumber: 1,
  label: 'seed-v1',
  createdAt: now,
  createdBy: actorSub,
  source: 'manual',
  importAuditId: null,
});

db.lookup_tables.insertOne({
  _id: TABLE_ID,
  tenantId: TENANT_ID,
  namespaceId: NAMESPACE_ID,
  slug: 'demo-table',
  name: 'Demo lookup table',
  description: 'Seeded key-value table',
  currentVersionId: VERSION_ID,
  currentVersionNumber: 1,
  versionCounter: 1,
  isDeprecated: false,
  deprecatedAt: null,
  expiresAt: null,
  valueSchema: null,
  deletedAt: null,
  deletedBy: null,
  createdAt: now,
  updatedAt: now,
});

db.lookup_entries.insertMany([
  {
    _id: ENTRY_A_ID,
    tenantId: TENANT_ID,
    namespaceId: NAMESPACE_ID,
    tableId: TABLE_ID,
    versionId: VERSION_ID,
    key: 'greeting',
    value: 'Hello',
    valueString: 'Hello',
    valueType: 'string',
    createdAt: now,
    updatedAt: now,
  },
  {
    _id: ENTRY_B_ID,
    tenantId: TENANT_ID,
    namespaceId: NAMESPACE_ID,
    tableId: TABLE_ID,
    versionId: VERSION_ID,
    key: 'count',
    value: 42,
    valueString: null,
    valueType: 'number',
    createdAt: now,
    updatedAt: now,
  },
]);

db.lookup_import_audit.insertOne({
  _id: AUDIT_ID,
  tenantId: TENANT_ID,
  tableId: TABLE_ID,
  actorSub,
  filename: null,
  fileSize: null,
  sha256: null,
  mode: 'overwrite_current',
  format: 'json',
  status: 'succeeded',
  startedAt: now,
  completedAt: now,
  previousVersionId: VERSION_ID,
  resultingVersionId: VERSION_ID,
  stats: { keysParsed: 2, entriesWritten: 2, warningsCount: 0, errorsCount: 0 },
  details: [],
});

print('lookup-service demo seed complete.');
printjson({
  tenantId: TENANT_ID.toHexString(),
  namespaceId: NAMESPACE_ID.toHexString(),
  tableId: TABLE_ID.toHexString(),
  versionId: VERSION_ID.toHexString(),
  importAuditId: AUDIT_ID.toHexString(),
});

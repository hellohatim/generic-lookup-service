/**
 * Seeds tenant/namespace/lookup table "companies" and inserts 10_000 random company rows.
 * Keys: CN00000001 … CN00010000. Value: { name, street1, street2, city, zipcode }.
 *
 * Run: cd apps/api && npm run seed:company
 * Env: MONGODB_URI, MONGODB_DB (same as API — see src/config/env.ts)
 *
 * Skips if a tenant with slug `company-seed` already exists.
 */
import { MongoClient, ObjectId } from "mongodb";
import { config } from "../src/config/env.js";
import { ensureIndexes } from "../src/database/ensureIndexes.js";
import { sysColl } from "../src/database/collections.js";
import {
  makeEntriesCollectionName,
  ensureEntryCollectionIndexes,
} from "../src/services/entryCollections.js";
import { computeValueMeta } from "../src/utils/valueCodec.js";

const TENANT_SLUG = "company-seed";
const NS_SLUG = "default";
const TABLE_SLUG = "companies";
const TOTAL = 10_000;
const BATCH = 500;

const valueSchema = {
  type: "object",
  required: ["name", "street1", "city", "zipcode"],
  properties: {
    name: { type: "string" },
    street1: { type: "string" },
    street2: { type: "string" },
    city: { type: "string" },
    zipcode: { type: "string" },
  },
  additionalProperties: false,
} as const;

const ADJECTIVES = [
  "Global",
  "United",
  "Pacific",
  "Northern",
  "Metro",
  "Summit",
  "Crescent",
  "Silver",
  "Blue",
  "Red",
  "Green",
  "Royal",
  "Prime",
  "Alpha",
  "Vertex",
];
const NOUNS = [
  "Industries",
  "Holdings",
  "Logistics",
  "Trading",
  "Systems",
  "Partners",
  "Group",
  "Enterprises",
  "Solutions",
  "Manufacturing",
  "Retail",
  "Services",
  "Capital",
  "Labs",
  "Works",
];
const STREETS = [
  "Oak Ave",
  "Maple Rd",
  "River Blvd",
  "Main St",
  "Cedar Ln",
  "Park Way",
  "Hill Dr",
  "Lake Ct",
  "Forest Pl",
  "Market Sq",
];
const CITIES = [
  "Springfield",
  "Franklin",
  "Georgetown",
  "Madison",
  "Clinton",
  "Salem",
  "Bristol",
  "Chester",
  "Milford",
  "Aurora",
];

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function randomCompanyName(): string {
  return `${pick(ADJECTIVES)} ${pick(NOUNS)} ${1000 + Math.floor(Math.random() * 9000)}`;
}

function randomRow(i: number): { key: string; value: Record<string, string> } {
  const n = String(i).padStart(8, "0");
  return {
    key: `CN${n}`,
    value: {
      name: randomCompanyName(),
      street1: `${100 + Math.floor(Math.random() * 8900)} ${pick(STREETS)}`,
      street2: Math.random() > 0.45 ? `Suite ${100 + Math.floor(Math.random() * 900)}` : "",
      city: pick(CITIES),
      zipcode: String(10000 + Math.floor(Math.random() * 89999)),
    },
  };
}

async function main(): Promise<void> {
  const client = new MongoClient(config.mongoUri);
  await client.connect();
  const db = client.db(config.mongoDb);
  await ensureIndexes(db);

  const existing = await db
    .collection(sysColl.tenants)
    .findOne({ slug: TENANT_SLUG, deletedAt: null });
  if (existing) {
    console.log(`Tenant "${TENANT_SLUG}" already exists — skip seed (delete tenant to re-run).`);
    await client.close();
    return;
  }

  const now = new Date();
  const tenantId = new ObjectId();
  const namespaceId = new ObjectId();
  const tableId = new ObjectId();
  const versionId = new ObjectId();

  const entriesCollection = makeEntriesCollectionName(
    TENANT_SLUG,
    NS_SLUG,
    TABLE_SLUG,
    1
  );

  await db.collection(sysColl.tenants).insertOne({
    _id: tenantId,
    slug: TENANT_SLUG,
    name: "Company seed tenant",
    status: "active",
    metadata: { purpose: "company-lookup-10k-demo" },
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });

  await db.collection(sysColl.namespaces).insertOne({
    _id: namespaceId,
    tenantId,
    slug: NS_SLUG,
    name: "Default",
    description: "Company lookup demo",
    deletedAt: null,
    deletedBy: null,
    createdAt: now,
    updatedAt: now,
  });

  await db.collection(sysColl.lookupTables).insertOne({
    _id: tableId,
    tenantId,
    namespaceId,
    slug: TABLE_SLUG,
    name: "Company directory",
    description: "10k demo companies; key = company number CN########",
    currentVersionId: versionId,
    currentVersionNumber: 1,
    versionCounter: 1,
    isDeprecated: false,
    deprecatedAt: null,
    expiresAt: null,
    valueSchema: { ...valueSchema },
    deletedAt: null,
    deletedBy: null,
    createdAt: now,
    updatedAt: now,
  });

  await db.collection(sysColl.lookupTableVersions).insertOne({
    _id: versionId,
    tenantId,
    tableId,
    versionNumber: 1,
    label: "seed-v1",
    createdAt: now,
    createdBy: "seed-company-lookup.ts",
    source: "manual",
    entryCount: 0,
    importAuditId: null,
    entriesCollection,
  });

  await ensureEntryCollectionIndexes(db, entriesCollection);

  const col = db.collection(entriesCollection);
  console.log(`Inserting ${TOTAL} entries into ${entriesCollection} …`);

  for (let start = 1; start <= TOTAL; start += BATCH) {
    const end = Math.min(start + BATCH - 1, TOTAL);
    const docs = [];
    for (let i = start; i <= end; i++) {
      const { key, value } = randomRow(i);
      const meta = computeValueMeta(value);
      docs.push({
        key,
        value,
        valueString: meta.valueString,
        valueType: meta.valueType,
        createdAt: now,
        updatedAt: now,
      });
    }
    await col.insertMany(docs);
    process.stdout.write(`\r  rows ${end}/${TOTAL}`);
  }
  console.log("");

  await db.collection(sysColl.lookupTableVersions).updateOne(
    { _id: versionId },
    { $set: { entryCount: TOTAL } }
  );

  console.log("Done.");
  console.log(`  tenantId:     ${tenantId.toHexString()}`);
  console.log(`  namespaceId:  ${namespaceId.toHexString()}`);
  console.log(`  tableId:      ${tableId.toHexString()}`);
  console.log(`  versionId:    ${versionId.toHexString()}`);
  console.log(`  collection:   ${entriesCollection}`);
  console.log(`  sample key:   CN00000001 (CN########)`);

  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const postmanDir = join(__dirname, "..", "..", "postman");
const collectionPath = join(postmanDir, "design-sample.postman_collection.json");
const environmentPath = join(postmanDir, "design-sample.postman_environment.json");

test("design Postman collection parses and has auth + folders", () => {
  const col = JSON.parse(readFileSync(collectionPath, "utf8"));
  assert.equal(col.info?.schema?.includes("collection"), true);
  assert.ok(col.info?.name);
  assert.equal(col.auth?.type, "bearer");
  assert.ok(Array.isArray(col.item));
  const names = col.item.map((f) => f.name).sort();
  assert.ok(names.includes("Entries"));
  assert.ok(names.includes("Exports"));
  assert.ok(names.includes("Imports"));
});

test("design Postman environment includes baseUrl and seeded demo IDs", () => {
  const env = JSON.parse(readFileSync(environmentPath, "utf8"));
  assert.ok(Array.isArray(env.values));
  const keys = new Set(env.values.map((v) => v.key));
  for (const k of ["baseUrl", "tenantId", "namespaceId", "tableId", "accessToken"]) {
    assert.ok(keys.has(k), `missing env key ${k}`);
  }
});

test("functional Postman collection parses", () => {
  const p = join(postmanDir, "functional.postman_collection.json");
  const col = JSON.parse(readFileSync(p, "utf8"));
  assert.ok(col.info?.name);
  assert.ok(Array.isArray(col.item));
});

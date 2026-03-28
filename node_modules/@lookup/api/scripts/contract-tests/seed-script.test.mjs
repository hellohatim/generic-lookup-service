import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const seedPath = join(__dirname, "..", "seed", "seed-lookup-demo.mongo.js");

test("seed script contains deterministic demo ObjectIds used by Postman README", () => {
  const src = readFileSync(seedPath, "utf8");
  assert.ok(src.includes("ObjectId('a1b2c3d4e5f60718293a4b5c')"));
  assert.ok(src.includes("format: 'json'"));
  assert.ok(src.includes("sys_lookup_import_audit.insertOne"));
  assert.doesNotMatch(src, /\}\s*\}\s*\}\);/m, "stray extra braces in deleteMany");
});

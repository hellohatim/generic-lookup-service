import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import yaml from "js-yaml";
import SwaggerParser from "@apidevtools/swagger-parser";

const __dirname = dirname(fileURLToPath(import.meta.url));
const openApiPath = join(__dirname, "..", "..", "openapi.yaml");

test("openapi.yaml parses as YAML and declares OpenAPI 3.x", () => {
  const raw = readFileSync(openApiPath, "utf8");
  const doc = yaml.load(raw);
  assert.ok(doc.openapi, "missing openapi field");
  assert.match(doc.openapi, /^3\./, "expected OpenAPI 3.x");
  assert.ok(doc.info?.title, "missing info.title");
  assert.ok(doc.paths && Object.keys(doc.paths).length > 0, "missing paths");
});

test("openapi.yaml validates as OpenAPI 3 (including schemas)", async () => {
  await SwaggerParser.validate(openApiPath);
});

test("spec includes bulk entries, export, imports, entries search, and lifecycle operations", async () => {
  const api = await SwaggerParser.parse(openApiPath);
  const p = api.paths;
  assert.ok(p["/tenants/{tenantId}/namespaces/{namespaceId}/tables/{tableId}/entries/bulk"]?.post);
  assert.ok(p["/tenants/{tenantId}/namespaces/{namespaceId}/tables/{tableId}/entries/search"]?.post);
  assert.ok(p["/tenants/{tenantId}/namespaces/{namespaceId}/tables/{tableId}/exports"]?.get);
  assert.ok(p["/tenants/{tenantId}/namespaces/{namespaceId}/tables/{tableId}/imports"]?.post);
  assert.ok(p["/tenants/{tenantId}/namespaces/{namespaceId}/tables/{tableId}/restore"]?.post);
  assert.ok(p["/tenants/{tenantId}/namespaces/{namespaceId}/restore"]?.post);
});

test("PaginationMeta defines nextCursor when present in components", async () => {
  const api = await SwaggerParser.parse(openApiPath);
  const meta = api.components?.schemas?.PaginationMeta;
  assert.ok(meta, "PaginationMeta schema missing");
  assert.ok(meta.properties?.nextCursor !== undefined, "PaginationMeta.nextCursor expected");
});

test("SearchQuery and boolean search leaf schemas exist", async () => {
  const api = await SwaggerParser.parse(openApiPath);
  const s = api.components?.schemas;
  assert.ok(s?.SearchQuery, "SearchQuery schema missing");
  assert.ok(s?.SearchQueryBool, "SearchQueryBool schema missing");
  assert.ok(s?.SearchQueryLeafValuePath, "SearchQueryLeafValuePath schema missing");
  const req = s?.SearchEntriesRequest;
  assert.ok(req?.properties?.query, "SearchEntriesRequest.query missing");
});

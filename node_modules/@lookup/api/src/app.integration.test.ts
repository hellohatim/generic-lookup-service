import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient } from "mongodb";
import request from "supertest";
import type { Application } from "express";
import ExcelJS from "exceljs";
import { createApp } from "./app.js";
import { ensureIndexes } from "./database/ensureIndexes.js";

describe("lookup API (integration)", () => {
  let mongod: MongoMemoryServer;
  let client: MongoClient;
  let app: Application;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    client = new MongoClient(mongod.getUri());
    await client.connect();
    const db = client.db("vitest_lookup");
    await ensureIndexes(db);
    app = createApp(db);
  }, 120_000);

  afterAll(async () => {
    await client.close();
    await mongod.stop();
  });

  it("creates tenant and namespace and table and entry", async () => {
    const t = await request(app)
      .post("/lookup/v1/tenants")
      .send({ name: "T", slug: "tenant-it" })
      .expect(201);
    const tenantId = t.body.id as string;

    const n = await request(app)
      .post(`/lookup/v1/tenants/${tenantId}/namespaces`)
      .send({ name: "N", slug: "ns-it" })
      .expect(201);
    const namespaceId = n.body.id as string;

    const tb = await request(app)
      .post(
        `/lookup/v1/tenants/${tenantId}/namespaces/${namespaceId}/tables`
      )
      .send({ name: "Table", slug: "tbl-it" })
      .expect(201);
    const tableId = tb.body.id as string;

    await request(app)
      .post(
        `/lookup/v1/tenants/${tenantId}/namespaces/${namespaceId}/tables/${tableId}/entries`
      )
      .send({ key: "k1", value: "v1" })
      .expect(201);

    const list = await request(app)
      .get(
        `/lookup/v1/tenants/${tenantId}/namespaces/${namespaceId}/tables/${tableId}/entries?page=1&pageSize=10`
      )
      .expect(200);
    expect(list.body.items.length).toBe(1);
    expect(list.body.items[0].key).toBe("k1");
  });

  it("stores object value and searches by nested path (GET and POST search)", async () => {
    const t = await request(app)
      .post("/lookup/v1/tenants")
      .send({ name: "Obj", slug: "tenant-obj" })
      .expect(201);
    const tenantId = t.body.id as string;
    const n = await request(app)
      .post(`/lookup/v1/tenants/${tenantId}/namespaces`)
      .send({ name: "N", slug: "ns-obj" })
      .expect(201);
    const namespaceId = n.body.id as string;
    const tb = await request(app)
      .post(
        `/lookup/v1/tenants/${tenantId}/namespaces/${namespaceId}/tables`
      )
      .send({ name: "T", slug: "tbl-obj" })
      .expect(201);
    const tableId = tb.body.id as string;

    await request(app)
      .post(
        `/lookup/v1/tenants/${tenantId}/namespaces/${namespaceId}/tables/${tableId}/entries`
      )
      .send({
        key: "doc1",
        value: {
          text: "Hello world",
          description: "A longer description",
        },
      })
      .expect(201);

    const byPath = await request(app)
      .get(
        `/lookup/v1/tenants/${tenantId}/namespaces/${namespaceId}/tables/${tableId}/entries?valuePath=text&value=Hello&valueMatch=partial`
      )
      .expect(200);
    expect(byPath.body.items.length).toBe(1);
    expect(byPath.body.items[0].key).toBe("doc1");

    const search = await request(app)
      .post(
        `/lookup/v1/tenants/${tenantId}/namespaces/${namespaceId}/tables/${tableId}/entries/search`
      )
      .send({
        filters: [
          { path: "text", value: "world", match: "partial" },
          { path: "description", value: "longer", match: "partial" },
        ],
        page: 1,
        pageSize: 10,
      })
      .expect(200);
    expect(search.body.items.length).toBe(1);
    expect(search.body.items[0].value).toMatchObject({
      text: "Hello world",
      description: "A longer description",
    });
  });

  it("search query tree: OR matches one of two keys", async () => {
    const t = await request(app)
      .post("/lookup/v1/tenants")
      .send({ name: "Q", slug: "tenant-qtree" })
      .expect(201);
    const tenantId = t.body.id as string;
    const n = await request(app)
      .post(`/lookup/v1/tenants/${tenantId}/namespaces`)
      .send({ name: "N", slug: "ns-qtree" })
      .expect(201);
    const namespaceId = n.body.id as string;
    const tb = await request(app)
      .post(
        `/lookup/v1/tenants/${tenantId}/namespaces/${namespaceId}/tables`
      )
      .send({ name: "T", slug: "tbl-qtree" })
      .expect(201);
    const tableId = tb.body.id as string;

    await request(app)
      .post(
        `/lookup/v1/tenants/${tenantId}/namespaces/${namespaceId}/tables/${tableId}/entries`
      )
      .send({ key: "alpha-row", value: { region: "EU", code: "A1" } })
      .expect(201);
    await request(app)
      .post(
        `/lookup/v1/tenants/${tenantId}/namespaces/${namespaceId}/tables/${tableId}/entries`
      )
      .send({ key: "beta-row", value: { region: "US", code: "B2" } })
      .expect(201);

    const r = await request(app)
      .post(
        `/lookup/v1/tenants/${tenantId}/namespaces/${namespaceId}/tables/${tableId}/entries/search`
      )
      .send({
        query: {
          op: "or",
          clauses: [
            {
              kind: "valuePath",
              path: "code",
              value: "A1",
              match: "exact",
            },
            {
              kind: "valuePath",
              path: "code",
              value: "ZZ",
              match: "exact",
            },
          ],
        },
        page: 1,
        pageSize: 20,
      })
      .expect(200);

    expect(r.body.items.length).toBe(1);
    expect(r.body.items[0].key).toBe("alpha-row");
  });

  it("flat_object Excel import and export", async () => {
    const slug = `tflat-${Date.now()}`;
    const t = await request(app)
      .post("/lookup/v1/tenants")
      .send({ name: "Flat", slug })
      .expect(201);
    const tenantId = t.body.id as string;
    const n = await request(app)
      .post(`/lookup/v1/tenants/${tenantId}/namespaces`)
      .send({ name: "N", slug: `ns-${slug}` })
      .expect(201);
    const namespaceId = n.body.id as string;
    const tb = await request(app)
      .post(
        `/lookup/v1/tenants/${tenantId}/namespaces/${namespaceId}/tables`
      )
      .send({ name: "T", slug: `tbl-${slug}` })
      .expect(201);
    const tableId = tb.body.id as string;

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Sheet1");
    ws.addRow(["key", "a", "b", "_scalar"]);
    ws.addRow(["row1", "x", "y", ""]);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());

    await request(app)
      .post(
        `/lookup/v1/tenants/${tenantId}/namespaces/${namespaceId}/tables/${tableId}/imports`
      )
      .field("mode", "overwrite_current")
      .field("format", "flat_object")
      .attach("file", buf, "data.xlsx")
      .expect(200);

    const list = await request(app)
      .get(
        `/lookup/v1/tenants/${tenantId}/namespaces/${namespaceId}/tables/${tableId}/entries?pageSize=10`
      )
      .expect(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].key).toBe("row1");
    expect(list.body.items[0].value).toEqual({ a: "x", b: "y" });

    const exp = await request(app)
      .get(
        `/lookup/v1/tenants/${tenantId}/namespaces/${namespaceId}/tables/${tableId}/exports?format=flat_object`
      )
      .responseType("blob")
      .expect(200);
    const load = new ExcelJS.Workbook();
    await load.xlsx.load(exp.body as ArrayBuffer);
    const sh = load.worksheets[0];
    expect(sh.getRow(1).getCell(1).value).toBe("key");
    expect(sh.getRow(2).getCell(1).value).toBe("row1");
    expect(sh.getRow(2).getCell(2).value).toBe("x");
  });

  it("returns 400 for invalid ObjectId path", async () => {
    await request(app)
      .get("/lookup/v1/tenants/not-an-id/namespaces")
      .expect(400);
  });

  it("rejects duplicate tenant slug with 409", async () => {
    await request(app)
      .post("/lookup/v1/tenants")
      .send({ name: "A", slug: "dup-slug" })
      .expect(201);
    await request(app)
      .post("/lookup/v1/tenants")
      .send({ name: "B", slug: "dup-slug" })
      .expect(409);
  });
});

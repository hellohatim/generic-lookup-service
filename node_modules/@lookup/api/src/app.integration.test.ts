import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient } from "mongodb";
import request from "supertest";
import type { Application } from "express";
import { createApp } from "./app.js";
import { ensureIndexes } from "./db/ensureIndexes.js";

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

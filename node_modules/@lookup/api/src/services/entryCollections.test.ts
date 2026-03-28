import { describe, expect, it } from "vitest";
import { AppError } from "../utils/errors.js";
import { makeEntriesCollectionName } from "./entryCollections.js";

describe("makeEntriesCollectionName", () => {
  it("replaces hyphens in slugs with underscores and omits lookup_ prefix", () => {
    expect(makeEntriesCollectionName("demo-tenant", "demo-ns", "demo-table", 1)).toBe(
      "demo_tenant_demo_ns_demo_table_1"
    );
  });

  it("joins slug segments with single underscores", () => {
    expect(makeEntriesCollectionName("acme", "sales", "regions", 3)).toBe("acme_sales_regions_3");
  });

  it("rejects names that would start with sys_", () => {
    expect(() => makeEntriesCollectionName("sys", "foo", "bar", 1)).toThrow(AppError);
  });
});

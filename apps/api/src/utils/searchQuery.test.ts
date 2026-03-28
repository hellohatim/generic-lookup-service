import { describe, it, expect } from "vitest";
import { buildMongoFilterFromSearchQuery } from "./searchQuery.js";

describe("buildMongoFilterFromSearchQuery", () => {
  it("keyExact", () => {
    expect(
      buildMongoFilterFromSearchQuery({ kind: "keyExact", key: "k1" })
    ).toEqual({ key: "k1" });
  });

  it("keyPrefix uses anchored regex", () => {
    const f = buildMongoFilterFromSearchQuery({
      kind: "keyPrefix",
      prefix: "pre.",
    }) as { key: { $regex: string } };
    expect(f.key.$regex.startsWith("^")).toBe(true);
  });

  it("valueRoot partial constrains valueType string", () => {
    const f = buildMongoFilterFromSearchQuery({
      kind: "valueRoot",
      value: "hi",
      match: "partial",
    }) as Record<string, unknown>;
    expect(f.valueType).toBe("string");
    expect(f.valueString).toMatchObject({ $regex: "hi" });
  });

  it("valuePath maps dotted field", () => {
    const f = buildMongoFilterFromSearchQuery({
      kind: "valuePath",
      path: "meta.code",
      value: "X",
      match: "exact",
    });
    expect(f).toHaveProperty("value.meta.code");
  });

  it("AND of two leaves", () => {
    const f = buildMongoFilterFromSearchQuery({
      op: "and",
      clauses: [
        { kind: "keyPrefix", prefix: "a" },
        { kind: "valuePath", path: "b", value: "c", match: "exact" },
      ],
    }) as { $and: unknown[] };
    expect(f.$and).toHaveLength(2);
  });

  it("OR of two leaves", () => {
    const f = buildMongoFilterFromSearchQuery({
      op: "or",
      clauses: [
        { kind: "keyExact", key: "x" },
        { kind: "keyExact", key: "y" },
      ],
    }) as { $or: unknown[] };
    expect(f.$or).toHaveLength(2);
  });

  it("flattens single-clause group", () => {
    const inner = { kind: "keyExact" as const, key: "only" };
    const f = buildMongoFilterFromSearchQuery({
      op: "and",
      clauses: [inner],
    });
    expect(f).toEqual({ key: "only" });
  });

  it("nested OR inside AND", () => {
    const f = buildMongoFilterFromSearchQuery({
      op: "and",
      clauses: [
        { kind: "keyPrefix", prefix: "p" },
        {
          op: "or",
          clauses: [
            { kind: "valuePath", path: "a", value: "1", match: "exact" },
            { kind: "valuePath", path: "b", value: "2", match: "exact" },
          ],
        },
      ],
    }) as { $and: unknown[] };
    expect(f.$and).toHaveLength(2);
    expect((f.$and[1] as { $or: unknown[] }).$or).toHaveLength(2);
  });
});

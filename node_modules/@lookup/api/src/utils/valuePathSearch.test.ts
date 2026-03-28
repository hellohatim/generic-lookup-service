import { describe, expect, it } from "vitest";
import { AppError } from "./errors.js";
import {
  buildEntriesListMongoFilter,
  mongoFieldForValuePath,
  normalizeValuePath,
} from "./valuePathSearch.js";

describe("normalizeValuePath", () => {
  it("strips value. prefix and splits segments", () => {
    expect(normalizeValuePath("value.text")).toEqual(["text"]);
    expect(normalizeValuePath("meta.code")).toEqual(["meta", "code"]);
  });

  it("rejects empty and invalid segments", () => {
    expect(() => normalizeValuePath("")).toThrow(AppError);
    expect(() => normalizeValuePath("9bad")).toThrow(AppError);
    expect(() => normalizeValuePath("a.-b")).toThrow(AppError);
  });
});

describe("buildEntriesListMongoFilter", () => {
  it("uses valueString for legacy root value search", () => {
    expect(
      buildEntriesListMongoFilter({
        legacyValue: "hello",
        legacyValueMatch: "partial",
        legacyCaseSensitive: false,
      })
    ).toEqual({
      valueType: "string",
      valueString: { $regex: "hello", $options: "i" },
    });
  });

  it("uses dotted value field when valuePath set", () => {
    expect(
      buildEntriesListMongoFilter({
        legacyValue: "hi",
        legacyValueMatch: "exact",
        legacyCaseSensitive: true,
        valuePath: "description",
      })
    ).toEqual({
      "value.description": "hi",
    });
  });

  it("ANDs multiple path filters", () => {
    const f = buildEntriesListMongoFilter({
      valuePathFilters: [
        { path: "text", value: "a", match: "partial" },
        { path: "meta.code", value: "x", match: "exact", caseSensitive: true },
      ],
    });
    expect(f.$and).toHaveLength(2);
  });

  it("maps path to mongo field", () => {
    expect(mongoFieldForValuePath(["a", "b"])).toBe("value.a.b");
  });
});

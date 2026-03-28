import { describe, it, expect } from "vitest";
import { computeValueMeta } from "./valueCodec.js";

describe("computeValueMeta", () => {
  it("string sets valueString", () => {
    expect(computeValueMeta("hi")).toEqual({
      valueType: "string",
      valueString: "hi",
    });
  });

  it("number leaves valueString null", () => {
    expect(computeValueMeta(3)).toEqual({
      valueType: "number",
      valueString: null,
    });
  });
});

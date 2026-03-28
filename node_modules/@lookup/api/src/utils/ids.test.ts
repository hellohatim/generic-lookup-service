import { describe, it, expect } from "vitest";
import { ObjectId } from "mongodb";
import { parseObjectId } from "./ids.js";
import { AppError } from "./errors.js";

describe("parseObjectId", () => {
  it("accepts canonical 24-hex string", () => {
    const id = new ObjectId();
    const p = parseObjectId(id.toHexString(), "x");
    expect(p.equals(id)).toBe(true);
  });

  it("rejects invalid", () => {
    expect(() => parseObjectId("zzz", "x")).toThrow(AppError);
  });
});

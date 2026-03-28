import { describe, it, expect } from "vitest";
import { ObjectId } from "mongodb";
import { encodeEntryCursor, decodeEntryCursor } from "./cursor.js";
import { AppError } from "./errors.js";

describe("cursor", () => {
  it("round-trips ObjectId", () => {
    const id = new ObjectId();
    const c = encodeEntryCursor(id);
    expect(decodeEntryCursor(c).equals(id)).toBe(true);
  });

  it("rejects invalid cursor", () => {
    expect(() => decodeEntryCursor("not-a-cursor")).toThrow(AppError);
  });
});

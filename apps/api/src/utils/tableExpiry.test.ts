import { describe, it, expect } from "vitest";
import { isExpiredUtc, tableMutationBlocked } from "./tableExpiry.js";

describe("tableExpiry", () => {
  it("isExpiredUtc is false when null", () => {
    expect(isExpiredUtc(null)).toBe(false);
  });

  it("isExpiredUtc when past", () => {
    expect(isExpiredUtc(new Date(Date.now() - 60_000))).toBe(true);
  });

  it("allows patch clearing expiresAt when expired", () => {
    const past = new Date(Date.now() - 60_000);
    expect(tableMutationBlocked(past, { expiresAt: null })).toBe(false);
  });
});

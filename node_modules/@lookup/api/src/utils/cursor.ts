import { ObjectId } from "mongodb";
import { AppError } from "./errors.js";

/** Opaque cursor: base64url(JSON.stringify({ id: string })) */
export function encodeEntryCursor(id: ObjectId): string {
  return Buffer.from(JSON.stringify({ id: id.toHexString() }), "utf8").toString(
    "base64url"
  );
}

export function decodeEntryCursor(cursor: string): ObjectId {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const j = JSON.parse(raw) as { id?: string };
    if (!j.id || !ObjectId.isValid(j.id)) throw new Error("bad id");
    return new ObjectId(j.id);
  } catch {
    throw new AppError(400, "BAD_REQUEST", "Invalid cursor");
  }
}

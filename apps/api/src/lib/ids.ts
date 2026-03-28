import { ObjectId } from "mongodb";
import { AppError } from "./errors.js";

export function parseObjectId(param: string, label: string): ObjectId {
  if (!ObjectId.isValid(param) || String(new ObjectId(param)) !== param) {
    throw new AppError(400, "BAD_REQUEST", `Invalid ${label}`);
  }
  return new ObjectId(param);
}

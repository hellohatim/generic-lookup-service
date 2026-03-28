import { AppError } from "./errors.js";

export function mustParam(
  v: string | string[] | undefined,
  name: string
): string {
  if (typeof v !== "string" || v === "") {
    throw new AppError(400, "BAD_REQUEST", `Missing or invalid path parameter: ${name}`);
  }
  return v;
}

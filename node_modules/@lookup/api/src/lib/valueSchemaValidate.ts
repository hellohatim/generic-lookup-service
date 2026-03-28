import { createRequire } from "node:module";
import type { ErrorObject } from "ajv";
import { ValidationAppError } from "./errors.js";

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const AjvLib = require("ajv") as new (opts?: object) => {
  compile: (schema: object) => {
    (data: unknown): boolean;
    errors?: ErrorObject[] | null | undefined;
  };
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const addFormats = require("ajv-formats") as (a: unknown) => void;

const ajv = new AjvLib({ allErrors: true, strict: false, allowUnionTypes: true });
addFormats(ajv);

export function assertValueMatchesSchema(
  value: unknown,
  schema: Record<string, unknown> | null | undefined
): void {
  if (schema == null) return;
  const validate = ajv.compile(schema);
  const ok = validate(value);
  if (!ok && validate.errors) {
    throw new ValidationAppError("Value failed valueSchema validation", {
      errors: simplifyAjvErrors(validate.errors),
    });
  }
}

function simplifyAjvErrors(errors: ErrorObject[]): unknown {
  return errors.map((e) => ({
    path: e.instancePath || e.schemaPath,
    message: e.message,
    keyword: e.keyword,
  }));
}

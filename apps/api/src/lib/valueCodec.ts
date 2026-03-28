export type ValueTypeHint =
  | "string"
  | "number"
  | "bool"
  | "object"
  | "array"
  | "null"
  | "binData";

export function computeValueMeta(value: unknown): {
  valueType: ValueTypeHint;
  valueString: string | null;
} {
  if (value === null) {
    return { valueType: "null", valueString: null };
  }
  if (typeof value === "string") {
    return { valueType: "string", valueString: value };
  }
  if (typeof value === "number") {
    return { valueType: "number", valueString: null };
  }
  if (typeof value === "boolean") {
    return { valueType: "bool", valueString: null };
  }
  if (Array.isArray(value)) {
    return { valueType: "array", valueString: null };
  }
  if (typeof value === "object") {
    return { valueType: "object", valueString: null };
  }
  return { valueType: "string", valueString: String(value) };
}

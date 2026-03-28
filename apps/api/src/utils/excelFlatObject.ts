/** Tabular Excel layout: columns key, c1, c2, … plus _scalar for non-object values. */

import type { Row as ExcelRow } from "exceljs";

export const FLAT_OBJECT_SCALAR_COL = "_scalar";

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** Excel cell → string | number | boolean for sheet cells (export). */
export function scalarForFlatExportCell(value: unknown): string | number | boolean {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return value as string | number | boolean;
}

/** Build header and body rows for flat_object export. */
export function buildFlatObjectExportMatrix(
  entries: Array<{ key: string; value: unknown }>
): { header: string[]; body: (string | number | boolean)[][] } {
  const keySet = new Set<string>();
  for (const e of entries) {
    if (isPlainObject(e.value)) {
      for (const k of Object.keys(e.value)) keySet.add(k);
    }
  }
  const objectFields = [...keySet].sort((a, b) => a.localeCompare(b));
  const header = ["key", ...objectFields, FLAT_OBJECT_SCALAR_COL];

  const body: (string | number | boolean)[][] = [];
  for (const e of entries) {
    if (isPlainObject(e.value)) {
      const row: (string | number | boolean)[] = [e.key];
      for (const f of objectFields) {
        const v = e.value[f];
        row.push(scalarForFlatExportCell(v));
      }
      row.push("");
      body.push(row);
    } else {
      const row: (string | number | boolean)[] = [e.key];
      for (const _ of objectFields) row.push("");
      row.push(encodeScalarForExport(e.value));
      body.push(row);
    }
  }

  return { header, body };
}

function encodeScalarForExport(value: unknown): string {
  if (value === null || value === undefined) return "";
  return JSON.stringify(value);
}

/** Parse JSON in a string cell when clearly structured; else return raw string. */
export function parsePossiblyJsonCell(s: string): unknown {
  const t = s.trim();
  if (!t) return undefined;
  if (t.startsWith("{") || t.startsWith("[")) {
    try {
      return JSON.parse(t) as unknown;
    } catch {
      return s;
    }
  }
  return s;
}

/** Raw Excel/ExcelJS cell value → normalized value for import. */
export function excelJsCellToImportValue(cellVal: unknown): unknown {
  if (cellVal === null || cellVal === undefined) return "";
  if (typeof cellVal === "number" || typeof cellVal === "boolean") return cellVal;
  if (typeof cellVal === "object" && cellVal !== null && "text" in cellVal) {
    return (cellVal as { text: string }).text;
  }
  if (typeof cellVal === "object" && cellVal !== null && "result" in cellVal) {
    const r = (cellVal as { result?: unknown }).result;
    if (r !== undefined) return excelJsCellToImportValue(r);
  }
  const s = String(cellVal).trim();
  return parsePossiblyJsonCell(s);
}

export type FlatObjectParseResult = {
  entries: Array<{ key: string; value: unknown }>;
  warnings: Array<{ code: string; message: string; cell?: string | null; key?: string | null }>;
  errors: Array<{ code: string; message: string; cell?: string | null }>;
};

const HEADER_KEY = "key";

/**
 * Parse flat_object sheet: first row = headers (key + field columns + optional _scalar).
 */
export function parseFlatObjectImport(rows: ExcelRow[]): FlatObjectParseResult {
  const warnings: FlatObjectParseResult["warnings"] = [];
  const errors: FlatObjectParseResult["errors"] = [];
  const entries: Array<{ key: string; value: unknown }> = [];

  if (rows.length < 2) {
    errors.push({ code: "INVALID_FORMAT", message: "flat_object needs header row and at least one data row" });
    return { entries, warnings, errors };
  }

  const headerRow = rows[0];
  let keyCol = -1;
  let scalarCol = -1;
  const fieldCols: { col: number; name: string }[] = [];

  const lastCol = headerRow.cellCount;
  for (let c = 1; c <= lastCol; c++) {
    const raw = headerRow.getCell(c).value;
    const h =
      raw === null || raw === undefined
        ? ""
        : typeof raw === "object" && raw !== null && "text" in raw
          ? String((raw as { text: string }).text).trim()
          : String(raw).trim();
    const lower = h.toLowerCase();
    if (!h) continue;
    if (lower === HEADER_KEY) {
      if (keyCol !== -1) {
        errors.push({ code: "DUPLICATE_HEADER", message: "Duplicate key column" });
        return { entries, warnings, errors };
      }
      keyCol = c;
      continue;
    }
    if (lower === FLAT_OBJECT_SCALAR_COL) {
      if (scalarCol !== -1) {
        errors.push({ code: "DUPLICATE_HEADER", message: "Duplicate _scalar column" });
        return { entries, warnings, errors };
      }
      scalarCol = c;
      continue;
    }
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(h)) {
      errors.push({
        code: "INVALID_HEADER",
        message: `Invalid column name (use letters, digits, underscore): ${h}`,
      });
      return { entries, warnings, errors };
    }
    fieldCols.push({ col: c, name: h });
  }

  if (keyCol === -1) {
    errors.push({ code: "MISSING_KEY_COLUMN", message: "Header row must include a key column" });
    return { entries, warnings, errors };
  }

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const keyRaw = row.getCell(keyCol).value;
    const key =
      keyRaw === null || keyRaw === undefined ? "" : String(keyRaw).trim();
    if (!key) continue;

    const scalarVal =
      scalarCol > 0 ? excelJsCellToImportValue(row.getCell(scalarCol).value) : "";
    const scalarStr =
      scalarVal === "" || scalarVal === undefined
        ? ""
        : typeof scalarVal === "string"
          ? scalarVal
          : JSON.stringify(scalarVal);

    let objectFieldNonEmpty = false;
    const obj: Record<string, unknown> = {};
    for (const { col, name } of fieldCols) {
      const v = excelJsCellToImportValue(row.getCell(col).value);
      if (v === "" || v === undefined) continue;
      objectFieldNonEmpty = true;
      obj[name] = v;
    }

    let value: unknown;
    if (scalarStr.trim() !== "" && !objectFieldNonEmpty) {
      value = parseScalarColumn(scalarStr);
    } else if (scalarStr.trim() !== "" && objectFieldNonEmpty) {
      warnings.push({
        code: "SCALAR_IGNORED",
        message: "Both object columns and _scalar set; using object columns only",
        key,
      });
      value = coerceNestedJsonInFields(obj);
    } else if (objectFieldNonEmpty) {
      value = coerceNestedJsonInFields(obj);
    } else {
      value = "";
    }

    entries.push({ key, value });
  }

  return { entries, warnings, errors };
}

function parseScalarColumn(s: string): unknown {
  const t = s.trim();
  if (!t) return "";
  try {
    return JSON.parse(t) as unknown;
  } catch {
    return t;
  }
}

/** For string values in object fields, apply JSON parse when shaped like JSON. */
function coerceNestedJsonInFields(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string") {
      const t = v.trim();
      if ((t.startsWith("{") || t.startsWith("[")) && t.length > 1) {
        try {
          out[k] = JSON.parse(t) as unknown;
          continue;
        } catch {
          /* keep string */
        }
      }
    }
    out[k] = v;
  }
  return out;
}

import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import {
  buildFlatObjectExportMatrix,
  parseFlatObjectImport,
  isPlainObject,
  FLAT_OBJECT_SCALAR_COL,
} from "./excelFlatObject.js";

describe("buildFlatObjectExportMatrix", () => {
  it("exports key + field columns + _scalar", () => {
    const { header, body } = buildFlatObjectExportMatrix([
      { key: "abc", value: { c1: "v1", c2: "v2" } },
    ]);
    expect(header).toEqual(["key", "c1", "c2", FLAT_OBJECT_SCALAR_COL]);
    expect(body).toEqual([["abc", "v1", "v2", ""]]);
  });

  it("sorts union of keys across rows", () => {
    const { header, body } = buildFlatObjectExportMatrix([
      { key: "a", value: { z: 1, a: 2 } },
      { key: "b", value: { m: 3 } },
    ]);
    expect(header).toEqual(["key", "a", "m", "z", FLAT_OBJECT_SCALAR_COL]);
    expect(body[0]).toEqual(["a", 2, "", 1, ""]);
    expect(body[1]).toEqual(["b", "", 3, "", ""]);
  });

  it("uses _scalar for non-object value", () => {
    const { header, body } = buildFlatObjectExportMatrix([
      { key: "x", value: { c: "only" } },
      { key: "y", value: "plain" },
    ]);
    expect(header[0]).toBe("key");
    expect(header[header.length - 1]).toBe(FLAT_OBJECT_SCALAR_COL);
    expect(body[1][0]).toBe("y");
    expect(body[1][body[1].length - 1]).toBe(JSON.stringify("plain"));
  });
});

describe("parseFlatObjectImport", () => {
  async function rowsFromSheet(
    header: string[],
    dataRows: (string | number)[][]
  ): Promise<ExcelJS.Row[]> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("t");
    ws.addRow(header);
    for (const r of dataRows) ws.addRow(r);
    const out: ExcelJS.Row[] = [];
    ws.eachRow((row) => out.push(row));
    return out;
  }

  it("parses object rows", async () => {
    const rows = await rowsFromSheet(
      ["key", "c1", "c2", FLAT_OBJECT_SCALAR_COL],
      [["abc", "v1", "v2", ""]]
    );
    const { entries, errors } = parseFlatObjectImport(rows);
    expect(errors).toHaveLength(0);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({ key: "abc", value: { c1: "v1", c2: "v2" } });
  });

  it("parses _scalar row", async () => {
    const rows = await rowsFromSheet(["key", "c1", FLAT_OBJECT_SCALAR_COL], [
      ["s", "", JSON.stringify(42)],
    ]);
    const { entries, errors } = parseFlatObjectImport(rows);
    expect(errors).toHaveLength(0);
    expect(entries[0].value).toBe(42);
  });

  it("rejects missing key column", async () => {
    const rows = await rowsFromSheet(["id", "c1"], [["a", "b"]]);
    const { errors } = parseFlatObjectImport(rows);
    expect(errors.some((e) => e.code === "MISSING_KEY_COLUMN")).toBe(true);
  });
});

describe("isPlainObject", () => {
  it("excludes arrays", () => {
    expect(isPlainObject([])).toBe(false);
  });
});

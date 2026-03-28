import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import { AppError, ValidationAppError } from "../utils/errors.js";
import { computeValueMeta } from "../utils/valueCodec.js";
import { assertValueMatchesSchema } from "../utils/valueSchemaValidate.js";
import { requireTenant, requireNamespace, requireTable } from "./mongoUtil.js";
import {
  makeEntriesCollectionName,
  ensureEntryCollectionIndexes,
  getEntriesCollectionForVersion,
} from "./entryCollections.js";
import { isExpiredUtc } from "../utils/tableExpiry.js";
import { sysColl } from "../database/collections.js";

export type ExcelImportFormat = "wide" | "kv" | "flat_object";

export type ExcelImportInput = {
  tenantId: ObjectId;
  namespaceId: ObjectId;
  tableId: ObjectId;
  buffer: Buffer;
  mode: "new_version" | "overwrite_current";
  format: ExcelImportFormat;
  sheetName?: string;
  versionLabel?: string;
  filename: string;
  fileSize: number;
  /** When set, audit row already exists with status `pending` (async import). */
  preCreatedAuditId?: ObjectId;
};

export type ExcelImportResult = {
  auditId: ObjectId;
  tableId: ObjectId;
  targetVersionId: ObjectId;
  mode: "new_version" | "overwrite_current";
  keysParsed: number;
  entriesWritten: number;
  warnings: Array<{ code: string; message: string; cell?: string | null; key?: string | null }>;
  errors: Array<{ code: string; message: string; cell?: string | null }>;
};

export async function runExcelImportForTable(
  db: Db,
  input: ExcelImportInput,
  parseExcelImport: (
    buffer: Uint8Array,
    format: ExcelImportFormat,
    sheetName?: string
  ) => Promise<{
    entries: Array<{ key: string; value: unknown }>;
    warnings: ExcelImportResult["warnings"];
    errors: ExcelImportResult["errors"];
  }>
): Promise<ExcelImportResult> {
  const {
    tenantId,
    namespaceId,
    tableId,
    buffer,
    mode,
    format,
    sheetName,
    versionLabel,
    filename,
    fileSize,
    preCreatedAuditId,
  } = input;

  const table = await requireTable(db, tenantId, namespaceId, tableId);
  if (isExpiredUtc(table.expiresAt as Date | null)) {
    throw new AppError(403, "TABLE_EXPIRED", "Table has expired");
  }

  const valueSchema = table.valueSchema as Record<string, unknown> | null;
  const { entries: parsed, warnings, errors } = await parseExcelImport(buffer, format, sheetName);

  const failAudit = async (detailMsg: string) => {
    if (!preCreatedAuditId) return;
    await db.collection(sysColl.lookupImportAudit).updateOne(
      { _id: preCreatedAuditId },
      {
        $set: {
          status: "failed",
          completedAt: new Date(),
          details: [{ code: "IMPORT_FAILED", message: detailMsg }],
        },
      }
    );
  };

  if (errors.length) {
    await failAudit("Excel parse errors");
    throw new ValidationAppError("Excel parse errors", { errors });
  }

  try {
    for (const row of parsed) {
      assertValueMatchesSchema(row.value, valueSchema);
    }
  } catch (e) {
    await failAudit(e instanceof Error ? e.message : "Value validation failed");
    throw e;
  }

  const auditId = preCreatedAuditId ?? new ObjectId();
  const now = new Date();
  const currentVersionId = table.currentVersionId as ObjectId;

  if (preCreatedAuditId) {
    await db.collection(sysColl.lookupImportAudit).updateOne(
      { _id: auditId },
      {
        $set: {
          status: "running",
          filename,
          fileSize,
          mode,
          format,
          previousVersionId: mode === "overwrite_current" ? currentVersionId : null,
          resultingVersionId: currentVersionId,
        },
      }
    );
  } else {
    await db.collection(sysColl.lookupImportAudit).insertOne({
      _id: auditId,
      tenantId,
      tableId,
      actorSub: "anonymous",
      filename,
      fileSize,
      sha256: null,
      mode,
      format,
      status: "running",
      startedAt: now,
      completedAt: null,
      previousVersionId: mode === "overwrite_current" ? currentVersionId : null,
      resultingVersionId: currentVersionId,
      stats: { keysParsed: 0, entriesWritten: 0, warningsCount: 0, errorsCount: 0 },
      details: [],
    });
  }

  let targetVersionId = currentVersionId;
  let entriesWritten = 0;

  try {
    if (mode === "new_version") {
      const versionCounter =
        (table.versionCounter as number) || (table.currentVersionNumber as number);
      const nextNum = versionCounter + 1;
      const newVid = new ObjectId();
      targetVersionId = newVid;
      const tenant = await requireTenant(db, tenantId);
      const ns = await requireNamespace(db, tenantId, namespaceId);
      const entriesCollection = makeEntriesCollectionName(
        tenant.slug as string,
        ns.slug as string,
        table.slug as string,
        nextNum
      );
      await db.collection(sysColl.lookupTableVersions).insertOne({
        _id: newVid,
        tenantId,
        tableId,
        versionNumber: nextNum,
        label: versionLabel ?? null,
        createdAt: now,
        createdBy: "anonymous",
        source: "bulk_upload",
        entryCount: 0,
        importAuditId: auditId,
        entriesCollection,
      });
      await ensureEntryCollectionIndexes(db, entriesCollection);
      const docs = parsed.map((row) => {
        const meta = computeValueMeta(row.value);
        return {
          key: row.key,
          value: row.value,
          valueString: meta.valueString,
          valueType: meta.valueType,
          createdAt: now,
          updatedAt: now,
        };
      });
      if (docs.length) await db.collection(entriesCollection).insertMany(docs);
      entriesWritten = docs.length;
      await db.collection(sysColl.lookupTableVersions).updateOne(
        { _id: newVid },
        { $set: { entryCount: entriesWritten } }
      );
      await db.collection(sysColl.lookupTables).updateOne(
        { _id: tableId },
        {
          $set: {
            currentVersionId: newVid,
            currentVersionNumber: nextNum,
            versionCounter: nextNum,
            updatedAt: now,
          },
        }
      );
    } else {
      const curColl = await getEntriesCollectionForVersion(
        db,
        tenantId,
        tableId,
        currentVersionId
      );
      await db.collection(curColl).deleteMany({});
      const docs = parsed.map((row) => {
        const meta = computeValueMeta(row.value);
        return {
          key: row.key,
          value: row.value,
          valueString: meta.valueString,
          valueType: meta.valueType,
          createdAt: now,
          updatedAt: now,
        };
      });
      if (docs.length) await db.collection(curColl).insertMany(docs);
      entriesWritten = docs.length;
      await db.collection(sysColl.lookupTableVersions).updateOne(
        { _id: currentVersionId },
        { $set: { entryCount: entriesWritten } }
      );
      await db
        .collection(sysColl.lookupTables)
        .updateOne({ _id: tableId }, { $set: { updatedAt: now } });
      targetVersionId = currentVersionId;
    }

    await db.collection(sysColl.lookupImportAudit).updateOne(
      { _id: auditId },
      {
        $set: {
          status: "succeeded",
          completedAt: new Date(),
          resultingVersionId: targetVersionId,
          stats: {
            keysParsed: parsed.length,
            entriesWritten,
            warningsCount: warnings.length,
            errorsCount: 0,
          },
          details: [...warnings],
        },
      }
    );

    return {
      auditId,
      tableId,
      targetVersionId,
      mode,
      keysParsed: parsed.length,
      entriesWritten,
      warnings,
      errors: [],
    };
  } catch (e) {
    await db.collection(sysColl.lookupImportAudit).updateOne(
      { _id: auditId },
      {
        $set: {
          status: "failed",
          completedAt: new Date(),
          details: [
            {
              code: "IMPORT_FAILED",
              message: e instanceof Error ? e.message : String(e),
            },
          ],
        },
      }
    );
    throw e;
  }
}

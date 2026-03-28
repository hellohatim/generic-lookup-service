import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import {
  Router,
  type Request,
  type Response,
  type NextFunction,
  type Express,
} from "express";
import ExcelJS from "exceljs";
import {
  AppError,
  ConflictError,
  NotFoundError,
  ValidationAppError,
} from "./lib/errors.js";
import { parseObjectId } from "./lib/ids.js";
import { computeValueMeta } from "./lib/valueCodec.js";
import { assertValueMatchesSchema } from "./lib/valueSchemaValidate.js";
import { decodeEntryCursor, encodeEntryCursor } from "./lib/cursor.js";
import { isExpiredUtc, tableMutationBlocked } from "./lib/tableExpiry.js";
import {
  mapTenant,
  mapNamespace,
  mapTable,
  mapVersion,
  mapEntry,
  mapImportAudit,
} from "./mappers.js";
import { requireTenant, requireNamespace, requireTable } from "./services/mongoUtil.js";
import { mustParam } from "./lib/routeParams.js";

function asyncHandler(
  fn: (req: Request, res: Response) => Promise<void>
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    fn(req, res).catch(next);
  };
}

function pagination(req: Request) {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 20)));
  return { page, pageSize, skip: (page - 1) * pageSize };
}

export function createApiRouter(db: Db): Router {
  const r = Router();

  // --- Tenants ---
  r.post(
    "/tenants",
    asyncHandler(async (req, res) => {
      const body = req.body as {
        name: string;
        slug: string;
        status?: string;
        metadata?: Record<string, unknown>;
      };
      const now = new Date();
      const status = body.status ?? "active";
      try {
        const ins = await db.collection("tenants").insertOne({
          slug: body.slug,
          name: body.name,
          status,
          metadata: body.metadata,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        });
        const doc = await db.collection("tenants").findOne({ _id: ins.insertedId });
        if (!doc) throw new Error("insert failed");
        res
          .status(201)
          .location(`/lookup/v1/tenants/${ins.insertedId.toHexString()}`)
          .json(mapTenant(doc as Parameters<typeof mapTenant>[0]));
      } catch (e: unknown) {
        if (
          e &&
          typeof e === "object" &&
          "code" in e &&
          (e as { code: number }).code === 11000
        ) {
          throw new ConflictError("Tenant slug already exists");
        }
        throw e;
      }
    })
  );

  r.get(
    "/tenants",
    asyncHandler(async (req, res) => {
      const { page, pageSize, skip } = pagination(req);
      const q = (req.query.q as string | undefined)?.trim();
      const filter: Record<string, unknown> = { deletedAt: null };
      if (q) {
        filter.$or = [
          { name: { $regex: escapeRegex(q), $options: "i" } },
          { slug: { $regex: escapeRegex(q), $options: "i" } },
        ];
      }
      const col = db.collection("tenants");
      const [items, totalItems] = await Promise.all([
        col.find(filter).skip(skip).limit(pageSize).sort({ _id: 1 }).toArray(),
        col.countDocuments(filter),
      ]);
      res.json({
        items: items.map((d) => mapTenant(d as Parameters<typeof mapTenant>[0])),
        meta: {
          page,
          pageSize,
          totalItems,
          totalPages: Math.ceil(totalItems / pageSize),
        },
      });
    })
  );

  r.get(
    "/tenants/:tenantId",
    asyncHandler(async (req, res) => {
      const tenantId = parseObjectId(mustParam(req.params.tenantId, "tenantId"), "tenantId");
      const t = await requireTenant(db, tenantId);
      res.json(mapTenant(t as Parameters<typeof mapTenant>[0]));
    })
  );

  r.patch(
    "/tenants/:tenantId",
    asyncHandler(async (req, res) => {
      const tenantId = parseObjectId(mustParam(req.params.tenantId, "tenantId"), "tenantId");
      await requireTenant(db, tenantId);
      const body = req.body as Record<string, unknown>;
      const now = new Date();
      const set: Record<string, unknown> = { updatedAt: now };
      if (body.name !== undefined) set.name = body.name;
      if (body.status !== undefined) set.status = body.status;
      if (body.metadata !== undefined) set.metadata = body.metadata;
      const r0 = await db
        .collection("tenants")
        .findOneAndUpdate(
          { _id: tenantId, deletedAt: null },
          { $set: set },
          { returnDocument: "after" }
        );
      if (!r0 || !r0.value) throw new NotFoundError();
      res.json(mapTenant(r0.value as Parameters<typeof mapTenant>[0]));
    })
  );

  r.delete(
    "/tenants/:tenantId",
    asyncHandler(async (req, res) => {
      const tenantId = parseObjectId(mustParam(req.params.tenantId, "tenantId"), "tenantId");
      await requireTenant(db, tenantId);
      await db
        .collection("tenants")
        .updateOne({ _id: tenantId }, { $set: { deletedAt: new Date(), updatedAt: new Date() } });
      res.status(204).send();
    })
  );

  // --- Namespaces ---
  r.get(
    "/tenants/:tenantId/namespaces",
    asyncHandler(async (req, res) => {
      const tenantId = parseObjectId(mustParam(req.params.tenantId, "tenantId"), "tenantId");
      await requireTenant(db, tenantId);
      const { page, pageSize, skip } = pagination(req);
      const includeDeleted = req.query.includeDeleted === "true";
      const filter: Record<string, unknown> = { tenantId };
      if (!includeDeleted) filter.deletedAt = null;
      const col = db.collection("namespaces");
      const [items, totalItems] = await Promise.all([
        col.find(filter).skip(skip).limit(pageSize).sort({ slug: 1 }).toArray(),
        col.countDocuments(filter),
      ]);
      res.json({
        items: items.map((d) => mapNamespace(d as Parameters<typeof mapNamespace>[0])),
        meta: {
          page,
          pageSize,
          totalItems,
          totalPages: Math.ceil(totalItems / pageSize),
        },
      });
    })
  );

  r.post(
    "/tenants/:tenantId/namespaces",
    asyncHandler(async (req, res) => {
      const tenantId = parseObjectId(mustParam(req.params.tenantId, "tenantId"), "tenantId");
      await requireTenant(db, tenantId);
      const body = req.body as { name: string; slug: string; description?: string };
      const now = new Date();
      try {
        const ins = await db.collection("namespaces").insertOne({
          tenantId,
          slug: body.slug,
          name: body.name,
          description: body.description ?? null,
          deletedAt: null,
          deletedBy: null,
          createdAt: now,
          updatedAt: now,
        });
        const doc = await db.collection("namespaces").findOne({ _id: ins.insertedId });
        if (!doc) throw new Error("insert failed");
        res
          .status(201)
          .location(
            `/lookup/v1/tenants/${tenantId.toHexString()}/namespaces/${ins.insertedId.toHexString()}`
          )
          .json(mapNamespace(doc as Parameters<typeof mapNamespace>[0]));
      } catch (e: unknown) {
        if (
          e &&
          typeof e === "object" &&
          "code" in e &&
          (e as { code: number }).code === 11000
        ) {
          throw new ConflictError("Namespace slug already exists in tenant");
        }
        throw e;
      }
    })
  );

  r.get(
    "/tenants/:tenantId/namespaces/:namespaceId",
    asyncHandler(async (req, res) => {
      const tenantId = parseObjectId(mustParam(req.params.tenantId, "tenantId"), "tenantId");
      const namespaceId = parseObjectId(mustParam(req.params.namespaceId, "namespaceId"), "namespaceId");
      await requireTenant(db, tenantId);
      const includeDeleted = req.query.includeDeleted === "true";
      const n = await requireNamespace(db, tenantId, namespaceId, {
        includeDeleted,
      });
      res.json(mapNamespace(n as Parameters<typeof mapNamespace>[0]));
    })
  );

  r.patch(
    "/tenants/:tenantId/namespaces/:namespaceId",
    asyncHandler(async (req, res) => {
      const tenantId = parseObjectId(mustParam(req.params.tenantId, "tenantId"), "tenantId");
      const namespaceId = parseObjectId(mustParam(req.params.namespaceId, "namespaceId"), "namespaceId");
      await requireNamespace(db, tenantId, namespaceId);
      const body = req.body as Record<string, unknown>;
      const now = new Date();
      const set: Record<string, unknown> = { updatedAt: now };
      if (body.name !== undefined) set.name = body.name;
      if (body.slug !== undefined) set.slug = body.slug;
      if (body.description !== undefined) set.description = body.description;
      try {
        const r0 = await db
          .collection("namespaces")
          .findOneAndUpdate(
            { _id: namespaceId, tenantId, deletedAt: null },
            { $set: set },
            { returnDocument: "after" }
          );
        if (!r0 || !r0.value) throw new NotFoundError();
        res.json(mapNamespace(r0.value as Parameters<typeof mapNamespace>[0]));
      } catch (e: unknown) {
        if (
          e &&
          typeof e === "object" &&
          "code" in e &&
          (e as { code: number }).code === 11000
        ) {
          throw new ConflictError("Namespace slug already exists");
        }
        throw e;
      }
    })
  );

  r.delete(
    "/tenants/:tenantId/namespaces/:namespaceId",
    asyncHandler(async (req, res) => {
      const tenantId = parseObjectId(mustParam(req.params.tenantId, "tenantId"), "tenantId");
      const namespaceId = parseObjectId(mustParam(req.params.namespaceId, "namespaceId"), "namespaceId");
      await requireNamespace(db, tenantId, namespaceId);
      const permanent = req.query.permanent === "true";
      if (permanent) {
        const tables = await db
          .collection("lookup_tables")
          .find({ tenantId, namespaceId })
          .project({ _id: 1 })
          .toArray();
        for (const t of tables) {
          await cascadeDeleteTable(db, t._id as ObjectId);
        }
        await db.collection("namespaces").deleteOne({ _id: namespaceId, tenantId });
      } else {
        await db.collection("namespaces").updateOne(
          { _id: namespaceId, tenantId, deletedAt: null },
          {
            $set: {
              deletedAt: new Date(),
              deletedBy: "anonymous",
              updatedAt: new Date(),
            },
          }
        );
      }
      res.status(204).send();
    })
  );

  r.post(
    "/tenants/:tenantId/namespaces/:namespaceId/restore",
    asyncHandler(async (req, res) => {
      const tenantId = parseObjectId(mustParam(req.params.tenantId, "tenantId"), "tenantId");
      const namespaceId = parseObjectId(mustParam(req.params.namespaceId, "namespaceId"), "namespaceId");
      await requireTenant(db, tenantId);
      const r0 = await db.collection("namespaces").findOneAndUpdate(
        { _id: namespaceId, tenantId, deletedAt: { $ne: null } },
        {
          $set: { deletedAt: null, deletedBy: null, updatedAt: new Date() },
        },
        { returnDocument: "after" }
      );
      if (!r0 || !r0.value) throw new NotFoundError();
      res.json(mapNamespace(r0.value as Parameters<typeof mapNamespace>[0]));
    })
  );

  // --- Tables ---
  r.get(
    "/tenants/:tenantId/namespaces/:namespaceId/tables",
    asyncHandler(async (req, res) => {
      const tenantId = parseObjectId(mustParam(req.params.tenantId, "tenantId"), "tenantId");
      const namespaceId = parseObjectId(mustParam(req.params.namespaceId, "namespaceId"), "namespaceId");
      await requireNamespace(db, tenantId, namespaceId);
      const { page, pageSize, skip } = pagination(req);
      const includeDeprecated = req.query.includeDeprecated !== "false";
      const hideExpired = req.query.hideExpired === "true";
      const includeDeleted = req.query.includeDeleted === "true";
      const now = new Date();
      const filter: Record<string, unknown> = { tenantId, namespaceId };
      if (!includeDeleted) filter.deletedAt = null;
      if (!includeDeprecated) filter.isDeprecated = { $ne: true };
      if (hideExpired) {
        filter.$or = [
          { expiresAt: null },
          { expiresAt: { $exists: false } },
          { expiresAt: { $gt: now } },
        ];
      }
      const col = db.collection("lookup_tables");
      const [items, totalItems] = await Promise.all([
        col.find(filter).skip(skip).limit(pageSize).sort({ slug: 1 }).toArray(),
        col.countDocuments(filter),
      ]);
      res.json({
        items: items.map((d) => mapTable(d as Parameters<typeof mapTable>[0])),
        meta: {
          page,
          pageSize,
          totalItems,
          totalPages: Math.ceil(totalItems / pageSize),
        },
      });
    })
  );

  r.post(
    "/tenants/:tenantId/namespaces/:namespaceId/tables",
    asyncHandler(async (req, res) => {
      const tenantId = parseObjectId(mustParam(req.params.tenantId, "tenantId"), "tenantId");
      const namespaceId = parseObjectId(mustParam(req.params.namespaceId, "namespaceId"), "namespaceId");
      await requireNamespace(db, tenantId, namespaceId);
      const body = req.body as Record<string, unknown>;
      const now = new Date();
      const tableId = new ObjectId();
      const versionId = new ObjectId();
      try {
        await db.collection("lookup_tables").insertOne({
          _id: tableId,
          tenantId,
          namespaceId,
          slug: body.slug,
          name: body.name,
          description: body.description ?? null,
          currentVersionId: versionId,
          currentVersionNumber: 1,
          versionCounter: 1,
          isDeprecated: body.isDeprecated === true,
          deprecatedAt: body.deprecatedAt ? new Date(String(body.deprecatedAt)) : null,
          expiresAt: body.expiresAt ? new Date(String(body.expiresAt)) : null,
          valueSchema: body.valueSchema ?? null,
          deletedAt: null,
          deletedBy: null,
          createdAt: now,
          updatedAt: now,
        });
        await db.collection("lookup_table_versions").insertOne({
          _id: versionId,
          tenantId,
          tableId,
          versionNumber: 1,
          label: null,
          createdAt: now,
          createdBy: "anonymous",
          source: "manual",
          entryCount: 0,
          importAuditId: null,
        });
        const doc = await db.collection("lookup_tables").findOne({ _id: tableId });
        if (!doc) throw new Error("insert failed");
        res
          .status(201)
          .location(
            `/lookup/v1/tenants/${tenantId.toHexString()}/namespaces/${namespaceId.toHexString()}/tables/${tableId.toHexString()}`
          )
          .json(mapTable(doc as Parameters<typeof mapTable>[0]));
      } catch (e: unknown) {
        if (
          e &&
          typeof e === "object" &&
          "code" in e &&
          (e as { code: number }).code === 11000
        ) {
          throw new ConflictError("Table slug already exists in namespace");
        }
        throw e;
      }
    })
  );

  r.get(
    "/tenants/:tenantId/namespaces/:namespaceId/tables/:tableId",
    asyncHandler(async (req, res) => {
      const tenantId = parseObjectId(mustParam(req.params.tenantId, "tenantId"), "tenantId");
      const namespaceId = parseObjectId(mustParam(req.params.namespaceId, "namespaceId"), "namespaceId");
      const tableId = parseObjectId(mustParam(req.params.tableId, "tableId"), "tableId");
      const includeDeleted = req.query.includeDeleted === "true";
      const t = await requireTable(db, tenantId, namespaceId, tableId, {
        includeDeleted,
      });
      const row = mapTable(t as Parameters<typeof mapTable>[0]);
      if (row.isDeprecated) res.setHeader("Deprecation", "true");
      if (row.expiresAt) res.setHeader("Sunset", new Date(row.expiresAt).toUTCString());
      res.json(row);
    })
  );

  r.patch(
    "/tenants/:tenantId/namespaces/:namespaceId/tables/:tableId",
    asyncHandler(async (req, res) => {
      const tenantId = parseObjectId(mustParam(req.params.tenantId, "tenantId"), "tenantId");
      const namespaceId = parseObjectId(mustParam(req.params.namespaceId, "namespaceId"), "namespaceId");
      const tableId = parseObjectId(mustParam(req.params.tableId, "tableId"), "tableId");
      const t = await requireTable(db, tenantId, namespaceId, tableId);
      const body = req.body as Record<string, unknown>;
      const expiresAtCur = t.expiresAt as Date | null | undefined;
      if (
        isExpiredUtc(expiresAtCur ?? null) &&
        tableMutationBlocked(expiresAtCur ?? null, {
          expiresAt: body.expiresAt as string | null | undefined,
        })
      ) {
        throw new AppError(403, "TABLE_EXPIRED", "Table has expired");
      }
      const now = new Date();
      const set: Record<string, unknown> = { updatedAt: now };
      if (body.name !== undefined) set.name = body.name;
      if (body.slug !== undefined) set.slug = body.slug;
      if (body.description !== undefined) set.description = body.description;
      if (body.isDeprecated !== undefined) set.isDeprecated = body.isDeprecated;
      if (body.deprecatedAt !== undefined) {
        set.deprecatedAt =
          body.deprecatedAt === null ? null : new Date(String(body.deprecatedAt));
      }
      if (body.expiresAt !== undefined) {
        set.expiresAt =
          body.expiresAt === null ? null : new Date(String(body.expiresAt));
      }
      if (body.valueSchema !== undefined) {
        set.valueSchema = body.valueSchema;
      }
      try {
        const r0 = await db
          .collection("lookup_tables")
          .findOneAndUpdate(
            { _id: tableId, tenantId, namespaceId, deletedAt: null },
            { $set: set },
            { returnDocument: "after" }
          );
        if (!r0 || !r0.value) throw new NotFoundError();
        res.json(mapTable(r0.value as Parameters<typeof mapTable>[0]));
      } catch (e: unknown) {
        if (
          e &&
          typeof e === "object" &&
          "code" in e &&
          (e as { code: number }).code === 11000
        ) {
          throw new ConflictError("Table slug already exists");
        }
        throw e;
      }
    })
  );

  r.delete(
    "/tenants/:tenantId/namespaces/:namespaceId/tables/:tableId",
    asyncHandler(async (req, res) => {
      const tenantId = parseObjectId(mustParam(req.params.tenantId, "tenantId"), "tenantId");
      const namespaceId = parseObjectId(mustParam(req.params.namespaceId, "namespaceId"), "namespaceId");
      const tableId = parseObjectId(mustParam(req.params.tableId, "tableId"), "tableId");
      await requireTable(db, tenantId, namespaceId, tableId);
      const permanent = req.query.permanent === "true";
      if (permanent) {
        await cascadeDeleteTable(db, tableId);
      } else {
        await db.collection("lookup_tables").updateOne(
          { _id: tableId, tenantId, namespaceId, deletedAt: null },
          {
            $set: {
              deletedAt: new Date(),
              deletedBy: "anonymous",
              updatedAt: new Date(),
            },
          }
        );
      }
      res.status(204).send();
    })
  );

  r.post(
    "/tenants/:tenantId/namespaces/:namespaceId/tables/:tableId/restore",
    asyncHandler(async (req, res) => {
      const tenantId = parseObjectId(mustParam(req.params.tenantId, "tenantId"), "tenantId");
      const namespaceId = parseObjectId(mustParam(req.params.namespaceId, "namespaceId"), "namespaceId");
      const tableId = parseObjectId(mustParam(req.params.tableId, "tableId"), "tableId");
      await requireNamespace(db, tenantId, namespaceId);
      const r0 = await db.collection("lookup_tables").findOneAndUpdate(
        {
          _id: tableId,
          tenantId,
          namespaceId,
          deletedAt: { $ne: null },
        },
        {
          $set: { deletedAt: null, deletedBy: null, updatedAt: new Date() },
        },
        { returnDocument: "after" }
      );
      if (!r0 || !r0.value) throw new NotFoundError();
      res.json(mapTable(r0.value as Parameters<typeof mapTable>[0]));
    })
  );

  // --- Versions ---
  r.get(
    "/tenants/:tenantId/namespaces/:namespaceId/tables/:tableId/versions",
    asyncHandler(async (req, res) => {
      const tenantId = parseObjectId(mustParam(req.params.tenantId, "tenantId"), "tenantId");
      const namespaceId = parseObjectId(mustParam(req.params.namespaceId, "namespaceId"), "namespaceId");
      const tableId = parseObjectId(mustParam(req.params.tableId, "tableId"), "tableId");
      await requireTable(db, tenantId, namespaceId, tableId);
      const { page, pageSize, skip } = pagination(req);
      const filter = { tenantId, tableId };
      const col = db.collection("lookup_table_versions");
      const [items, totalItems] = await Promise.all([
        col.find(filter).sort({ versionNumber: -1 }).skip(skip).limit(pageSize).toArray(),
        col.countDocuments(filter),
      ]);
      res.json({
        items: items.map((d) => mapVersion(d as Parameters<typeof mapVersion>[0])),
        meta: {
          page,
          pageSize,
          totalItems,
          totalPages: Math.ceil(totalItems / pageSize),
        },
      });
    })
  );

  r.post(
    "/tenants/:tenantId/namespaces/:namespaceId/tables/:tableId/versions",
    asyncHandler(async (req, res) => {
      const tenantId = parseObjectId(mustParam(req.params.tenantId, "tenantId"), "tenantId");
      const namespaceId = parseObjectId(mustParam(req.params.namespaceId, "namespaceId"), "namespaceId");
      const tableId = parseObjectId(mustParam(req.params.tableId, "tableId"), "tableId");
      const table = await requireTable(db, tenantId, namespaceId, tableId);
      if (isExpiredUtc(table.expiresAt as Date | null)) {
        throw new AppError(403, "TABLE_EXPIRED", "Table has expired");
      }
      const body = req.body as {
        label?: string;
        cloneFromCurrent?: boolean;
        makeCurrent?: boolean;
      };
      const cloneFromCurrent = body.cloneFromCurrent !== false;
      const makeCurrent = body.makeCurrent !== false;
      const now = new Date();
      const newVersionId = new ObjectId();
      const currentVersionId = table.currentVersionId as ObjectId;
      const versionCounter = Number(
        table.versionCounter ?? table.currentVersionNumber ?? 0
      );
      const nextNum = versionCounter + 1;

      await db.collection("lookup_table_versions").insertOne({
        _id: newVersionId,
        tenantId,
        tableId,
        versionNumber: nextNum,
        label: body.label ?? null,
        createdAt: now,
        createdBy: "anonymous",
        source: "copy",
        entryCount: 0,
        importAuditId: null,
      });

      if (cloneFromCurrent) {
        const entries = await db
          .collection("lookup_entries")
          .find({ tenantId, tableId, versionId: currentVersionId })
          .toArray();
        if (entries.length) {
          const copies = entries.map((e) => ({
            tenantId,
            namespaceId,
            tableId,
            versionId: newVersionId,
            key: e.key,
            value: e.value,
            valueString: e.valueString ?? null,
            valueType: e.valueType,
            createdAt: now,
            updatedAt: now,
          }));
          await db.collection("lookup_entries").insertMany(copies);
          await db.collection("lookup_table_versions").updateOne(
            { _id: newVersionId },
            { $set: { entryCount: copies.length } }
          );
        }
      }

      const update: Record<string, unknown> = {
        versionCounter: nextNum,
        updatedAt: now,
      };
      if (makeCurrent) {
        update.currentVersionId = newVersionId;
        update.currentVersionNumber = nextNum;
      }
      await db.collection("lookup_tables").updateOne({ _id: tableId }, { $set: update });

      const vdoc = await db
        .collection("lookup_table_versions")
        .findOne({ _id: newVersionId });
      if (!vdoc) throw new Error("version missing");
      res.status(201).json(mapVersion(vdoc as Parameters<typeof mapVersion>[0]));
    })
  );

  r.get(
    "/tenants/:tenantId/namespaces/:namespaceId/tables/:tableId/versions/:versionId",
    asyncHandler(async (req, res) => {
      const tenantId = parseObjectId(mustParam(req.params.tenantId, "tenantId"), "tenantId");
      const namespaceId = parseObjectId(mustParam(req.params.namespaceId, "namespaceId"), "namespaceId");
      const tableId = parseObjectId(mustParam(req.params.tableId, "tableId"), "tableId");
      const versionId = parseObjectId(mustParam(req.params.versionId, "versionId"), "versionId");
      await requireTable(db, tenantId, namespaceId, tableId);
      const v = await db.collection("lookup_table_versions").findOne({
        _id: versionId,
        tableId,
        tenantId,
      });
      if (!v) throw new NotFoundError();
      res.json(mapVersion(v as Parameters<typeof mapVersion>[0]));
    })
  );

  // --- Imports (multipart) ---
  r.post(
    "/tenants/:tenantId/namespaces/:namespaceId/tables/:tableId/imports",
    asyncHandler(async (req, res) => {
      const tenantId = parseObjectId(mustParam(req.params.tenantId, "tenantId"), "tenantId");
      const namespaceId = parseObjectId(mustParam(req.params.namespaceId, "namespaceId"), "namespaceId");
      const tableId = parseObjectId(mustParam(req.params.tableId, "tableId"), "tableId");
      const table = await requireTable(db, tenantId, namespaceId, tableId);
      if (isExpiredUtc(table.expiresAt as Date | null)) {
        throw new AppError(403, "TABLE_EXPIRED", "Table has expired");
      }
      const asyncFlag = req.query.async === "true";
      if (asyncFlag) {
        throw new AppError(501, "NOT_IMPLEMENTED", "Async import not implemented");
      }
      const uploads = (req as Request & { files?: Express.Multer.File[] }).files;
      const file = uploads?.find((f) => f.fieldname === "file");
      if (!file?.buffer) {
        throw new ValidationAppError("file is required");
      }
      const mode = String(req.body.mode) as "new_version" | "overwrite_current";
      const format = String(req.body.format) as "wide" | "kv" | "json";
      if (format === "json") {
        throw new ValidationAppError("Use POST .../entries/bulk for JSON format");
      }
      const sheetName = req.body.sheetName ? String(req.body.sheetName) : undefined;
      const versionLabel = req.body.versionLabel
        ? String(req.body.versionLabel)
        : undefined;

      const valueSchema = table.valueSchema as Record<string, unknown> | null;
      const { entries: parsed, warnings, errors } = await parseExcelImport(
        file.buffer,
        format,
        sheetName
      );
      if (errors.length) {
        throw new ValidationAppError("Excel parse errors", { errors });
      }

      for (const row of parsed) {
        assertValueMatchesSchema(row.value, valueSchema);
      }

      const auditId = new ObjectId();
      const now = new Date();
      const currentVersionId = table.currentVersionId as ObjectId;

      await db.collection("lookup_import_audit").insertOne({
        _id: auditId,
        tenantId,
        tableId,
        actorSub: "anonymous",
        filename: file.originalname,
        fileSize: file.size,
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

      let targetVersionId = currentVersionId;
      let entriesWritten = 0;

      if (mode === "new_version") {
        const versionCounter =
          (table.versionCounter as number) || (table.currentVersionNumber as number);
        const nextNum = versionCounter + 1;
        const newVid = new ObjectId();
        targetVersionId = newVid;
        await db.collection("lookup_table_versions").insertOne({
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
        });
        const docs = parsed.map((row) => {
          const meta = computeValueMeta(row.value);
          return {
            tenantId,
            namespaceId,
            tableId,
            versionId: newVid,
            key: row.key,
            value: row.value,
            valueString: meta.valueString,
            valueType: meta.valueType,
            createdAt: now,
            updatedAt: now,
          };
        });
        if (docs.length) await db.collection("lookup_entries").insertMany(docs);
        entriesWritten = docs.length;
        await db.collection("lookup_table_versions").updateOne(
          { _id: newVid },
          { $set: { entryCount: entriesWritten } }
        );
        await db.collection("lookup_tables").updateOne(
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
        await db.collection("lookup_entries").deleteMany({
          tenantId,
          tableId,
          versionId: currentVersionId,
        });
        const docs = parsed.map((row) => {
          const meta = computeValueMeta(row.value);
          return {
            tenantId,
            namespaceId,
            tableId,
            versionId: currentVersionId,
            key: row.key,
            value: row.value,
            valueString: meta.valueString,
            valueType: meta.valueType,
            createdAt: now,
            updatedAt: now,
          };
        });
        if (docs.length) await db.collection("lookup_entries").insertMany(docs);
        entriesWritten = docs.length;
        await db.collection("lookup_table_versions").updateOne(
          { _id: currentVersionId },
          { $set: { entryCount: entriesWritten } }
        );
        await db
          .collection("lookup_tables")
          .updateOne({ _id: tableId }, { $set: { updatedAt: now } });
        targetVersionId = currentVersionId;
      }

      await db.collection("lookup_import_audit").updateOne(
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

      res.json({
        auditId: auditId.toHexString(),
        tableId: tableId.toHexString(),
        targetVersionId: targetVersionId.toHexString(),
        mode,
        keysParsed: parsed.length,
        entriesWritten,
        warnings,
        errors: [],
      });
    })
  );

  r.get(
    "/tenants/:tenantId/namespaces/:namespaceId/tables/:tableId/imports",
    asyncHandler(async (req, res) => {
      const tenantId = parseObjectId(mustParam(req.params.tenantId, "tenantId"), "tenantId");
      const namespaceId = parseObjectId(mustParam(req.params.namespaceId, "namespaceId"), "namespaceId");
      const tableId = parseObjectId(mustParam(req.params.tableId, "tableId"), "tableId");
      await requireTable(db, tenantId, namespaceId, tableId);
      const { page, pageSize, skip } = pagination(req);
      const filter = { tenantId, tableId };
      const col = db.collection("lookup_import_audit");
      const [items, totalItems] = await Promise.all([
        col.find(filter).sort({ startedAt: -1 }).skip(skip).limit(pageSize).toArray(),
        col.countDocuments(filter),
      ]);
      res.json({
        items: items.map((d) => mapImportAudit(d as Parameters<typeof mapImportAudit>[0])),
        meta: {
          page,
          pageSize,
          totalItems,
          totalPages: Math.ceil(totalItems / pageSize),
        },
      });
    })
  );

  r.get(
    "/tenants/:tenantId/namespaces/:namespaceId/tables/:tableId/imports/:auditId",
    asyncHandler(async (req, res) => {
      const tenantId = parseObjectId(mustParam(req.params.tenantId, "tenantId"), "tenantId");
      const namespaceId = parseObjectId(mustParam(req.params.namespaceId, "namespaceId"), "namespaceId");
      const tableId = parseObjectId(mustParam(req.params.tableId, "tableId"), "tableId");
      const auditId = parseObjectId(mustParam(req.params.auditId, "auditId"), "auditId");
      await requireTable(db, tenantId, namespaceId, tableId);
      const doc = await db.collection("lookup_import_audit").findOne({
        _id: auditId,
        tableId,
        tenantId,
      });
      if (!doc) throw new NotFoundError();
      res.json(mapImportAudit(doc as Parameters<typeof mapImportAudit>[0]));
    })
  );

  // --- Export ---
  r.get(
    "/tenants/:tenantId/namespaces/:namespaceId/tables/:tableId/exports",
    asyncHandler(async (req, res) => {
      const tenantId = parseObjectId(mustParam(req.params.tenantId, "tenantId"), "tenantId");
      const namespaceId = parseObjectId(mustParam(req.params.namespaceId, "namespaceId"), "namespaceId");
      const tableId = parseObjectId(mustParam(req.params.tableId, "tableId"), "tableId");
      const table = await requireTable(db, tenantId, namespaceId, tableId);
      const versionIdParam = req.query.versionId as string | undefined;
      const versionId = versionIdParam
        ? parseObjectId(versionIdParam, "versionId")
        : (table.currentVersionId as ObjectId);
      const format = (req.query.format as string) || "wide";
      const entries = await db
        .collection("lookup_entries")
        .find({ tenantId, tableId, versionId })
        .sort({ key: 1 })
        .toArray();
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("export");
      if (format === "wide") {
        const keys = entries.map((e) => e.key as string);
        ws.addRow(keys);
        ws.addRow(entries.map((e) => cellValueForWide(e.value)));
      } else {
        ws.addRow(["Key", "Value"]);
        for (const e of entries) {
          ws.addRow([e.key, cellValueForWide(e.value)]);
        }
      }
      const buf = await wb.xlsx.writeBuffer();
      const fname = (req.query.filename as string) || "export";
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader("Content-Disposition", `attachment; filename="${fname}.xlsx"`);
      res.send(Buffer.from(buf));
    })
  );

  // --- Entries ---
  r.get(
    "/tenants/:tenantId/namespaces/:namespaceId/tables/:tableId/entries",
    asyncHandler(async (req, res) => {
      const tenantId = parseObjectId(mustParam(req.params.tenantId, "tenantId"), "tenantId");
      const namespaceId = parseObjectId(mustParam(req.params.namespaceId, "namespaceId"), "namespaceId");
      const tableId = parseObjectId(mustParam(req.params.tableId, "tableId"), "tableId");
      const table = await requireTable(db, tenantId, namespaceId, tableId);
      const versionIdParam = req.query.versionId as string | undefined;
      const versionId = versionIdParam
        ? parseObjectId(versionIdParam, "versionId")
        : (table.currentVersionId as ObjectId);

      const cursor = req.query.cursor as string | undefined;
      const useCursor = Boolean(cursor);
      const filter: Record<string, unknown> = { tenantId, tableId, versionId };
      if (req.query.key) {
        filter.key = req.query.key as string;
      } else if (req.query.keyPrefix) {
        filter.key = { $regex: `^${escapeRegex(req.query.keyPrefix as string)}` };
      }
      const valueQ = req.query.value as string | undefined;
      const valueMatch = (req.query.valueMatch as string) || "exact";
      const caseSensitive = req.query.caseSensitive === "true";
      if (valueQ !== undefined) {
        if (valueMatch === "partial") {
          filter.valueType = "string";
          filter.valueString = {
            $regex: escapeRegex(valueQ),
            $options: caseSensitive ? "" : "i",
          };
        } else {
          filter.valueString = caseSensitive
            ? valueQ
            : { $regex: `^${escapeRegex(valueQ)}$`, $options: "i" };
        }
      }

      if (useCursor) {
        const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50)));
        const lastId = decodeEntryCursor(cursor!);
        filter._id = { $gt: lastId };
        const items = await db
          .collection("lookup_entries")
          .find(filter)
          .sort({ _id: 1 })
          .limit(limit + 1)
          .toArray();
        const hasMore = items.length > limit;
        const pageItems = hasMore ? items.slice(0, limit) : items;
        const last = pageItems[pageItems.length - 1];
        res.json({
          items: pageItems.map((d) => mapEntry(d as Parameters<typeof mapEntry>[0])),
          meta: {
            nextCursor:
              hasMore && last
                ? encodeEntryCursor(last._id as ObjectId)
                : null,
            limit,
          },
        });
        return;
      }

      const { page, pageSize, skip } = pagination(req);
      const col = db.collection("lookup_entries");
      const [items, totalItems] = await Promise.all([
        col.find(filter).sort({ _id: 1 }).skip(skip).limit(pageSize).toArray(),
        col.countDocuments(filter),
      ]);
      res.json({
        items: items.map((d) => mapEntry(d as Parameters<typeof mapEntry>[0])),
        meta: {
          page,
          pageSize,
          totalItems,
          totalPages: Math.ceil(totalItems / pageSize),
        },
      });
    })
  );

  r.post(
    "/tenants/:tenantId/namespaces/:namespaceId/tables/:tableId/entries",
    asyncHandler(async (req, res) => {
      const tenantId = parseObjectId(mustParam(req.params.tenantId, "tenantId"), "tenantId");
      const namespaceId = parseObjectId(mustParam(req.params.namespaceId, "namespaceId"), "namespaceId");
      const tableId = parseObjectId(mustParam(req.params.tableId, "tableId"), "tableId");
      const table = await requireTable(db, tenantId, namespaceId, tableId);
      if (isExpiredUtc(table.expiresAt as Date | null)) {
        throw new AppError(403, "TABLE_EXPIRED", "Table has expired");
      }
      const body = req.body as { key: string; value: unknown };
      assertValueMatchesSchema(
        body.value,
        table.valueSchema as Record<string, unknown> | null
      );
      const versionId = table.currentVersionId as ObjectId;
      const now = new Date();
      const meta = computeValueMeta(body.value);
      try {
        const ins = await db.collection("lookup_entries").insertOne({
          tenantId,
          namespaceId,
          tableId,
          versionId,
          key: body.key,
          value: body.value,
          valueString: meta.valueString,
          valueType: meta.valueType,
          createdAt: now,
          updatedAt: now,
        });
        const doc = await db.collection("lookup_entries").findOne({ _id: ins.insertedId });
        if (!doc) throw new Error("insert failed");
        res
          .status(201)
          .location(
            `/lookup/v1/tenants/${tenantId.toHexString()}/namespaces/${namespaceId.toHexString()}/tables/${tableId.toHexString()}/entries/${ins.insertedId.toHexString()}`
          )
          .json(mapEntry(doc as Parameters<typeof mapEntry>[0]));
      } catch (e: unknown) {
        if (
          e &&
          typeof e === "object" &&
          "code" in e &&
          (e as { code: number }).code === 11000
        ) {
          throw new ConflictError("Duplicate entry key in current version");
        }
        throw e;
      }
    })
  );

  r.post(
    "/tenants/:tenantId/namespaces/:namespaceId/tables/:tableId/entries/bulk",
    asyncHandler(async (req, res) => {
      const tenantId = parseObjectId(mustParam(req.params.tenantId, "tenantId"), "tenantId");
      const namespaceId = parseObjectId(mustParam(req.params.namespaceId, "namespaceId"), "namespaceId");
      const tableId = parseObjectId(mustParam(req.params.tableId, "tableId"), "tableId");
      const table = await requireTable(db, tenantId, namespaceId, tableId);
      if (isExpiredUtc(table.expiresAt as Date | null)) {
        throw new AppError(403, "TABLE_EXPIRED", "Table has expired");
      }
      const body = req.body as {
        mode: "new_version" | "overwrite_current";
        versionLabel?: string;
        items: Array<{ key: string; value: unknown }>;
      };
      const valueSchema = table.valueSchema as Record<string, unknown> | null;
      const keysFailed: Array<{ key: string; code: string; message: string }> = [];
      for (const it of body.items) {
        try {
          assertValueMatchesSchema(it.value, valueSchema);
        } catch (err) {
          if (err instanceof ValidationAppError) {
            keysFailed.push({
              key: it.key,
              code: err.code,
              message: err.message,
            });
          } else throw err;
        }
      }
      if (keysFailed.length) {
        throw new ValidationAppError("One or more values failed validation", {
          keysFailed,
        });
      }

      const auditId = new ObjectId();
      const now = new Date();
      const currentVersionId = table.currentVersionId as ObjectId;

      await db.collection("lookup_import_audit").insertOne({
        _id: auditId,
        tenantId,
        tableId,
        actorSub: "anonymous",
        filename: null,
        fileSize: null,
        sha256: null,
        mode: body.mode,
        format: "json",
        status: "running",
        startedAt: now,
        completedAt: null,
        previousVersionId: body.mode === "overwrite_current" ? currentVersionId : null,
        resultingVersionId: currentVersionId,
        stats: {},
        details: [],
      });

      let targetVersionId = currentVersionId;
      let entriesWritten = 0;

      if (body.mode === "new_version") {
        const versionCounter =
          (table.versionCounter as number) || (table.currentVersionNumber as number);
        const nextNum = versionCounter + 1;
        targetVersionId = new ObjectId();
        await db.collection("lookup_table_versions").insertOne({
          _id: targetVersionId,
          tenantId,
          tableId,
          versionNumber: nextNum,
          label: body.versionLabel ?? null,
          createdAt: now,
          createdBy: "anonymous",
          source: "bulk_upload",
          entryCount: 0,
          importAuditId: auditId,
        });
        const docs = body.items.map((row) => {
          const m = computeValueMeta(row.value);
          return {
            tenantId,
            namespaceId,
            tableId,
            versionId: targetVersionId,
            key: row.key,
            value: row.value,
            valueString: m.valueString,
            valueType: m.valueType,
            createdAt: now,
            updatedAt: now,
          };
        });
        if (docs.length) await db.collection("lookup_entries").insertMany(docs);
        entriesWritten = docs.length;
        await db.collection("lookup_table_versions").updateOne(
          { _id: targetVersionId },
          { $set: { entryCount: entriesWritten } }
        );
        await db.collection("lookup_tables").updateOne(
          { _id: tableId },
          {
            $set: {
              currentVersionId: targetVersionId,
              currentVersionNumber: nextNum,
              versionCounter: nextNum,
              updatedAt: now,
            },
          }
        );
      } else {
        await db.collection("lookup_entries").deleteMany({
          tenantId,
          tableId,
          versionId: currentVersionId,
        });
        const docs = body.items.map((row) => {
          const m = computeValueMeta(row.value);
          return {
            tenantId,
            namespaceId,
            tableId,
            versionId: currentVersionId,
            key: row.key,
            value: row.value,
            valueString: m.valueString,
            valueType: m.valueType,
            createdAt: now,
            updatedAt: now,
          };
        });
        if (docs.length) await db.collection("lookup_entries").insertMany(docs);
        entriesWritten = docs.length;
        await db.collection("lookup_table_versions").updateOne(
          { _id: currentVersionId },
          { $set: { entryCount: entriesWritten } }
        );
        await db
          .collection("lookup_tables")
          .updateOne({ _id: tableId }, { $set: { updatedAt: now } });
      }

      await db.collection("lookup_import_audit").updateOne(
        { _id: auditId },
        {
          $set: {
            status: "succeeded",
            completedAt: new Date(),
            resultingVersionId: targetVersionId,
            stats: {
              keysParsed: body.items.length,
              entriesWritten,
              warningsCount: 0,
              errorsCount: 0,
            },
          },
        }
      );

      res.json({
        auditId: auditId.toHexString(),
        tableId: tableId.toHexString(),
        targetVersionId: targetVersionId.toHexString(),
        mode: body.mode,
        entriesWritten,
        keysFailed: [],
      });
    })
  );

  r.get(
    "/tenants/:tenantId/namespaces/:namespaceId/tables/:tableId/entries/by-key/:key",
    asyncHandler(async (req, res) => {
      const tenantId = parseObjectId(mustParam(req.params.tenantId, "tenantId"), "tenantId");
      const namespaceId = parseObjectId(mustParam(req.params.namespaceId, "namespaceId"), "namespaceId");
      const tableId = parseObjectId(mustParam(req.params.tableId, "tableId"), "tableId");
      const table = await requireTable(db, tenantId, namespaceId, tableId);
      const key = decodeURIComponent(mustParam(req.params.key, "key"));
      const versionIdParam = req.query.versionId as string | undefined;
      const versionId = versionIdParam
        ? parseObjectId(versionIdParam, "versionId")
        : (table.currentVersionId as ObjectId);
      const doc = await db.collection("lookup_entries").findOne({
        tenantId,
        tableId,
        versionId,
        key,
      });
      if (!doc) throw new NotFoundError();
      res.json(mapEntry(doc as Parameters<typeof mapEntry>[0]));
    })
  );

  r.get(
    "/tenants/:tenantId/namespaces/:namespaceId/tables/:tableId/entries/:entryId",
    asyncHandler(async (req, res) => {
      const tenantId = parseObjectId(mustParam(req.params.tenantId, "tenantId"), "tenantId");
      const namespaceId = parseObjectId(mustParam(req.params.namespaceId, "namespaceId"), "namespaceId");
      const tableId = parseObjectId(mustParam(req.params.tableId, "tableId"), "tableId");
      const entryId = parseObjectId(mustParam(req.params.entryId, "entryId"), "entryId");
      await requireTable(db, tenantId, namespaceId, tableId);
      const doc = await db.collection("lookup_entries").findOne({
        _id: entryId,
        tenantId,
        tableId,
      });
      if (!doc) throw new NotFoundError();
      const versionIdQ = req.query.versionId as string | undefined;
      if (versionIdQ) {
        const vid = parseObjectId(versionIdQ, "versionId");
        if (!doc.versionId.equals(vid)) throw new NotFoundError();
      }
      res.json(mapEntry(doc as Parameters<typeof mapEntry>[0]));
    })
  );

  r.patch(
    "/tenants/:tenantId/namespaces/:namespaceId/tables/:tableId/entries/:entryId",
    asyncHandler(async (req, res) => {
      const tenantId = parseObjectId(mustParam(req.params.tenantId, "tenantId"), "tenantId");
      const namespaceId = parseObjectId(mustParam(req.params.namespaceId, "namespaceId"), "namespaceId");
      const tableId = parseObjectId(mustParam(req.params.tableId, "tableId"), "tableId");
      const entryId = parseObjectId(mustParam(req.params.entryId, "entryId"), "entryId");
      const table = await requireTable(db, tenantId, namespaceId, tableId);
      if (isExpiredUtc(table.expiresAt as Date | null)) {
        throw new AppError(403, "TABLE_EXPIRED", "Table has expired");
      }
      const currentVersionId = table.currentVersionId as ObjectId;
      const doc = await db.collection("lookup_entries").findOne({
        _id: entryId,
        tenantId,
        tableId,
        versionId: currentVersionId,
      });
      if (!doc) throw new NotFoundError();
      const body = req.body as { key?: string; value?: unknown };
      const nextValue = body.value !== undefined ? body.value : doc.value;
      assertValueMatchesSchema(
        nextValue,
        table.valueSchema as Record<string, unknown> | null
      );
      const nextKey = body.key !== undefined ? body.key : doc.key;
      const meta = computeValueMeta(nextValue);
      const now = new Date();
      try {
        const r0 = await db.collection("lookup_entries").findOneAndUpdate(
          { _id: entryId, versionId: currentVersionId },
          {
            $set: {
              key: nextKey,
              value: nextValue,
              valueString: meta.valueString,
              valueType: meta.valueType,
              updatedAt: now,
            },
          },
          { returnDocument: "after" }
        );
        if (!r0 || !r0.value) throw new NotFoundError();
        res.json(mapEntry(r0.value as Parameters<typeof mapEntry>[0]));
      } catch (e: unknown) {
        if (
          e &&
          typeof e === "object" &&
          "code" in e &&
          (e as { code: number }).code === 11000
        ) {
          throw new ConflictError("Duplicate entry key");
        }
        throw e;
      }
    })
  );

  r.delete(
    "/tenants/:tenantId/namespaces/:namespaceId/tables/:tableId/entries/:entryId",
    asyncHandler(async (req, res) => {
      const tenantId = parseObjectId(mustParam(req.params.tenantId, "tenantId"), "tenantId");
      const namespaceId = parseObjectId(mustParam(req.params.namespaceId, "namespaceId"), "namespaceId");
      const tableId = parseObjectId(mustParam(req.params.tableId, "tableId"), "tableId");
      const entryId = parseObjectId(mustParam(req.params.entryId, "entryId"), "entryId");
      const table = await requireTable(db, tenantId, namespaceId, tableId);
      if (isExpiredUtc(table.expiresAt as Date | null)) {
        throw new AppError(403, "TABLE_EXPIRED", "Table has expired");
      }
      const currentVersionId = table.currentVersionId as ObjectId;
      const del = await db.collection("lookup_entries").deleteOne({
        _id: entryId,
        tenantId,
        tableId,
        versionId: currentVersionId,
      });
      if (del.deletedCount === 0) throw new NotFoundError();
      res.status(204).send();
    })
  );

  return r;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function cascadeDeleteTable(db: Db, tableId: ObjectId): Promise<void> {
  await db.collection("lookup_entries").deleteMany({ tableId });
  await db.collection("lookup_table_versions").deleteMany({ tableId });
  await db.collection("lookup_import_audit").deleteMany({ tableId });
  await db.collection("lookup_tables").deleteOne({ _id: tableId });
}

function cellValueForWide(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return value as string | number | boolean;
}

async function parseExcelImport(
  buffer: Uint8Array,
  format: "wide" | "kv",
  sheetName?: string
): Promise<{
  entries: Array<{ key: string; value: unknown }>;
  warnings: Array<{ code: string; message: string; cell?: string | null; key?: string | null }>;
  errors: Array<{ code: string; message: string; cell?: string | null }>;
}> {
  const warnings: Array<{
    code: string;
    message: string;
    cell?: string | null;
    key?: string | null;
  }> = [];
  const errors: Array<{ code: string; message: string; cell?: string | null }> = [];
  const wb = new ExcelJS.Workbook();
  // exceljs typings expect legacy Buffer; Node's Buffer is structurally compatible
  await wb.xlsx.load(Buffer.from(buffer) as never);
  let sheet = sheetName ? wb.getWorksheet(sheetName) : wb.worksheets[0];
  if (!sheet) {
    errors.push({ code: "SHEET_NOT_FOUND", message: "Worksheet not found" });
    return { entries: [], warnings, errors };
  }
  const rows: ExcelJS.Row[] = [];
  sheet.eachRow((row) => rows.push(row));
  if (rows.length < 2 && format === "wide") {
    errors.push({ code: "INVALID_FORMAT", message: "wide format needs at least 2 rows" });
    return { entries: [], warnings, errors };
  }

  const entries: Array<{ key: string; value: unknown }> = [];

  if (format === "wide") {
    const header = rows[0];
    const data = rows[1];
    header.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const key = String(cell.value ?? "").trim();
      if (!key) return;
      const v = data.getCell(colNumber).value;
      const str =
        v === null || v === undefined
          ? ""
          : typeof v === "object" && v !== null && "text" in v
            ? String((v as { text: string }).text)
            : String(v);
      entries.push({ key, value: str });
    });
  } else {
    let keyCol = 1;
    let valCol = 2;
    const header = rows[0];
    header.eachCell((cell, colNumber) => {
      const h = String(cell.value ?? "").trim().toLowerCase();
      if (h === "key") keyCol = colNumber;
      if (h === "value") valCol = colNumber;
    });
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const k = row.getCell(keyCol).value;
      const v = row.getCell(valCol).value;
      const key = k === null || k === undefined ? "" : String(k).trim();
      if (!key) continue;
      const str =
        v === null || v === undefined
          ? ""
          : typeof v === "object" && v !== null && "text" in v
            ? String((v as { text: string }).text)
            : String(v);
      entries.push({ key, value: str });
    }
  }

  return { entries, warnings, errors };
}

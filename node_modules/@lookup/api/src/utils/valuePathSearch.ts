import { AppError } from "./errors.js";

const SEG_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Dot path under document `value` (optional `value.` prefix stripped). Segments: [a-zA-Z_][a-zA-Z0-9_]* */
export function normalizeValuePath(path: string): string[] {
  const t = path.trim();
  const withoutRoot = t.startsWith("value.") ? t.slice("value.".length) : t;
  if (!withoutRoot) {
    throw new AppError(400, "BAD_REQUEST", "valuePath must not be empty");
  }
  const parts = withoutRoot.split(".").filter(Boolean);
  if (parts.length === 0) {
    throw new AppError(400, "BAD_REQUEST", "valuePath must not be empty");
  }
  for (const p of parts) {
    if (!SEG_RE.test(p)) {
      throw new AppError(400, "BAD_REQUEST", `Invalid value path segment: ${p}`);
    }
  }
  return parts;
}

export function mongoFieldForValuePath(parts: string[]): string {
  return `value.${parts.join(".")}`;
}

export function mongoConditionForStringMatch(
  valueQ: string,
  match: "exact" | "partial",
  caseSensitive: boolean
): unknown {
  if (match === "partial") {
    return {
      $regex: escapeRegex(valueQ),
      $options: caseSensitive ? "" : "i",
    };
  }
  return caseSensitive
    ? valueQ
    : { $regex: `^${escapeRegex(valueQ)}$`, $options: "i" };
}

export type ValuePathFilterInput = {
  path: string;
  value: string;
  match?: string;
  caseSensitive?: boolean;
};

export function parseMatch(m: string | undefined): "exact" | "partial" {
  if (m === "partial" || m === "exact") return m;
  return "exact";
}

/** Drill into `value` following dot segments; expression root is `$value`. */
function valueDrillExpr(parts: string[]): unknown {
  let expr: unknown = "$value";
  for (const seg of parts) {
    expr = { $getField: { field: seg, input: expr } };
  }
  return expr;
}

/** $expr predicate: string field ref (e.g. "$$pair.v") matches user string. */
function exprStringMatchOnRef(
  fieldRef: string,
  valueQ: string,
  match: "exact" | "partial",
  caseSensitive: boolean
): unknown {
  if (match === "partial") {
    return {
      $regexMatch: {
        input: fieldRef,
        regex: escapeRegex(valueQ),
        options: caseSensitive ? "" : "i",
      },
    };
  }
  return caseSensitive
    ? { $eq: [fieldRef, valueQ] }
    : { $eq: [{ $toLower: fieldRef }, valueQ.toLowerCase()] };
}

/**
 * Match `value.<path>` as today, OR any **immediate** string child under that sub-object
 * (useful when the user types a path prefix and data lives one level deeper).
 */
export function buildValuePathLookaheadClause(
  pathParts: string[],
  valueQ: string,
  match: "exact" | "partial",
  caseSensitive: boolean
): Record<string, unknown> {
  const dotted = mongoFieldForValuePath(pathParts);
  const leafCond = mongoConditionForStringMatch(valueQ, match, caseSensitive);
  const drill = valueDrillExpr(pathParts);
  const childMatch = exprStringMatchOnRef("$$pair.v", valueQ, match, caseSensitive);

  const scanChildren = {
    $gt: [
      {
        $size: {
          $filter: {
            input: {
              $cond: {
                if: { $eq: [{ $type: drill }, "object"] },
                then: { $objectToArray: drill },
                else: [],
              },
            },
            as: "pair",
            cond: {
              $and: [{ $eq: [{ $type: "$$pair.v" }, "string"] }, childMatch],
            },
          },
        },
      },
      0,
    ],
  };

  return {
    $or: [{ [dotted]: leafCond }, { $expr: scanChildren }],
  };
}

/**
 * Mongo filter for entry list / search.
 * - Root `value` search uses `valueString` / `valueType` (primitive string storage).
 * - Path filters use dotted fields under BSON `value` (objects/arrays at path supported for exact BSON match where applicable).
 */
export function buildEntriesListMongoFilter(opts: {
  key?: string;
  keyPrefix?: string;
  /** When set without valuePath, applies legacy valueString filter */
  legacyValue?: string;
  legacyValueMatch?: string;
  legacyCaseSensitive?: boolean;
  /** With legacyValue: search this path under `value` instead of valueString */
  valuePath?: string;
  /** `exact` — single dotted field; `lookahead` — that field OR any immediate string child under it */
  valuePathMode?: "exact" | "lookahead";
  /** Additional path filters (AND) */
  valuePathFilters?: ValuePathFilterInput[];
}): Record<string, unknown> {
  const clauses: Record<string, unknown>[] = [];

  if (opts.key !== undefined && opts.key !== "") {
    if (opts.keyPrefix) {
      throw new AppError(400, "BAD_REQUEST", "Specify either key or keyPrefix, not both");
    }
    clauses.push({ key: opts.key });
  } else if (opts.keyPrefix) {
    clauses.push({ key: { $regex: `^${escapeRegex(opts.keyPrefix)}` } });
  }

  const extraFilters = opts.valuePathFilters ?? [];
  for (const f of extraFilters) {
    const parts = normalizeValuePath(f.path);
    const field = mongoFieldForValuePath(parts);
    const match = parseMatch(f.match);
    clauses.push({
      [field]: mongoConditionForStringMatch(f.value, match, f.caseSensitive ?? false),
    });
  }

  const valuePathTrimmed = opts.valuePath?.trim();
  const hasLegacyValue = opts.legacyValue !== undefined;

  if (hasLegacyValue && valuePathTrimmed) {
    const parts = normalizeValuePath(valuePathTrimmed);
    const match = parseMatch(opts.legacyValueMatch);
    const caseSensitive = opts.legacyCaseSensitive ?? false;
    const mode = opts.valuePathMode ?? "exact";
    if (mode === "lookahead") {
      clauses.push(
        buildValuePathLookaheadClause(parts, opts.legacyValue as string, match, caseSensitive)
      );
    } else {
      const field = mongoFieldForValuePath(parts);
      clauses.push({
        [field]: mongoConditionForStringMatch(
          opts.legacyValue as string,
          match,
          caseSensitive
        ),
      });
    }
  } else if (hasLegacyValue) {
    const match = parseMatch(opts.legacyValueMatch);
    const caseSensitive = opts.legacyCaseSensitive ?? false;
    if (match === "partial") {
      clauses.push({
        valueType: "string",
        valueString: mongoConditionForStringMatch(
          opts.legacyValue as string,
          "partial",
          caseSensitive
        ),
      });
    } else {
      clauses.push({
        valueString: mongoConditionForStringMatch(
          opts.legacyValue as string,
          "exact",
          caseSensitive
        ),
      });
    }
  }

  if (clauses.length === 0) return {};
  if (clauses.length === 1) return clauses[0] as Record<string, unknown>;
  return { $and: clauses };
}

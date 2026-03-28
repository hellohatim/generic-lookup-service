import { AppError } from "./errors.js";
import {
  escapeRegex,
  mongoConditionForStringMatch,
  mongoFieldForValuePath,
  normalizeValuePath,
  parseMatch,
} from "./valuePathSearch.js";

const MAX_DEPTH = 12;
const MAX_CLAUSES = 25;

export type SearchQueryLeaf =
  | { kind: "keyExact"; key: string }
  | { kind: "keyPrefix"; prefix: string }
  | {
      kind: "valueRoot";
      value: string;
      match?: string;
      caseSensitive?: boolean;
    }
  | {
      kind: "valuePath";
      path: string;
      value: string;
      match?: string;
      caseSensitive?: boolean;
    };

export type SearchQueryBool = {
  op: "and" | "or";
  clauses: SearchQuery[];
};

export type SearchQuery = SearchQueryBool | SearchQueryLeaf;

function isBoolNode(x: unknown): x is SearchQueryBool {
  return (
    typeof x === "object" &&
    x !== null &&
    "op" in x &&
    ((x as SearchQueryBool).op === "and" || (x as SearchQueryBool).op === "or")
  );
}

function leafMongoFilter(leaf: SearchQueryLeaf): Record<string, unknown> {
  switch (leaf.kind) {
    case "keyExact": {
      const k = leaf.key.trim();
      if (!k) {
        throw new AppError(400, "BAD_REQUEST", "keyExact.key must be non-empty");
      }
      return { key: leaf.key };
    }
    case "keyPrefix": {
      const p = leaf.prefix.trim();
      if (!p) {
        throw new AppError(400, "BAD_REQUEST", "keyPrefix.prefix must be non-empty");
      }
      return { key: { $regex: `^${escapeRegex(p)}` } };
    }
    case "valueRoot": {
      const match = parseMatch(leaf.match);
      const caseSensitive = leaf.caseSensitive === true;
      if (match === "partial") {
        return {
          valueType: "string",
          valueString: mongoConditionForStringMatch(leaf.value, "partial", caseSensitive),
        };
      }
      return {
        valueString: mongoConditionForStringMatch(leaf.value, "exact", caseSensitive),
      };
    }
    case "valuePath": {
      const parts = normalizeValuePath(leaf.path);
      const field = mongoFieldForValuePath(parts);
      const match = parseMatch(leaf.match);
      return {
        [field]: mongoConditionForStringMatch(
          leaf.value,
          match,
          leaf.caseSensitive === true
        ),
      };
    }
    default: {
      const _exhaustive: never = leaf;
      return _exhaustive;
    }
  }
}

/** Builds a Mongo filter from a recursive AND/OR query tree (POST .../entries/search `query`). */
export function buildMongoFilterFromSearchQuery(
  node: SearchQuery,
  depth = 0
): Record<string, unknown> {
  if (depth > MAX_DEPTH) {
    throw new AppError(400, "BAD_REQUEST", "Search query tree exceeds maximum depth");
  }

  if (isBoolNode(node)) {
    const clauses = node.clauses;
    if (!Array.isArray(clauses) || clauses.length === 0) {
      throw new AppError(400, "BAD_REQUEST", "Boolean search node requires at least one clause");
    }
    if (clauses.length > MAX_CLAUSES) {
      throw new AppError(
        400,
        "BAD_REQUEST",
        `Boolean search node may have at most ${MAX_CLAUSES} clauses`
      );
    }
    const parts = clauses.map((c) => buildMongoFilterFromSearchQuery(c, depth + 1));
    if (parts.length === 1) return parts[0] as Record<string, unknown>;
    return node.op === "and" ? { $and: parts } : { $or: parts };
  }

  if (typeof node !== "object" || node === null || !("kind" in node)) {
    throw new AppError(400, "BAD_REQUEST", "Invalid search query node");
  }
  return leafMongoFilter(node as SearchQueryLeaf);
}

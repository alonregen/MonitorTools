/**
 * Conditions → OpenSearch Query DSL compiler.
 * Per https://docs.opensearch.org/latest/query-dsl/
 * Pure JSON builder, no I/O.
 */

import type {
  Condition,
  CompileInput,
  OpenSearchDsl,
  Timeframe,
  FieldCatalog,
  FieldInfo,
} from "./types";

function getFieldInfo(catalog: FieldCatalog | undefined, field: string): FieldInfo | undefined {
  return catalog?.[field];
}

function resolveKeywordField(cond: Condition, catalog: FieldCatalog | undefined): string {
  const info = getFieldInfo(catalog, cond.field);
  if (info?.keywordField) return info.keywordField;
  return cond.field;
}

function resolveFieldType(catalog: FieldCatalog | undefined, field: string): string {
  const info = getFieldInfo(catalog, field);
  return info?.type ?? "unknown";
}

function isNumericOrDate(type: string): boolean {
  return ["date", "long", "integer", "float", "double"].includes(type);
}

/**
 * Decide which bool bucket to use: must, filter, must_not, should.
 * Per rule C: contains/phrase/query_string -> must; equals/in/range/exists -> filter.
 */
function getTargetBucket(
  clause: Condition["clause"],
  operator: Condition["operator"]
): "must" | "filter" | "must_not" | "should" {
  if (clause === "must_not") return "must_not";
  if (clause === "should") return "should";

  const scoringOps = ["contains", "phrase", "query_string"];
  const filterOps = ["equals", "exact", "in", "exists", "gt", "gte", "lt", "lte", "eq", "between"];

  if (scoringOps.includes(operator) && clause === "must") return "must";
  if (filterOps.includes(operator) || clause === "filter") return "filter";
  return clause === "must" ? "must" : "filter";
}

function buildMatch(field: string, value: string | number | boolean): Record<string, unknown> {
  return {
    match: {
      [field]: {
        query: value,
        operator: "OR",
      },
    },
  };
}

function buildMatchPhrase(
  field: string,
  value: string | number | boolean,
  slop?: number
): Record<string, unknown> {
  return {
    match_phrase: {
      [field]: {
        query: value,
        slop: slop ?? 0,
      },
    },
  };
}

function buildTerm(field: string, value: string | number | boolean): Record<string, unknown> {
  return {
    term: {
      [field]: { value },
    },
  };
}

function buildTerms(field: string, values: Array<string | number | boolean>): Record<string, unknown> {
  return {
    terms: {
      [field]: values,
    },
  };
}

function buildExists(field: string): Record<string, unknown> {
  return {
    exists: { field },
  };
}

function buildRange(
  field: string,
  opts: { gt?: unknown; gte?: unknown; lt?: unknown; lte?: unknown }
): Record<string, unknown> {
  const rangeBody: Record<string, unknown> = {};
  if (opts.gt !== undefined) rangeBody.gt = opts.gt;
  if (opts.gte !== undefined) rangeBody.gte = opts.gte;
  if (opts.lt !== undefined) rangeBody.lt = opts.lt;
  if (opts.lte !== undefined) rangeBody.lte = opts.lte;
  return {
    range: {
      [field]: rangeBody,
    },
  };
}

function buildQueryString(value: string): Record<string, unknown> {
  return {
    query_string: {
      query: value,
    },
  };
}

function buildTimeRange(timeframe: Timeframe): Record<string, unknown> {
  return buildRange(timeframe.field, {
    gte: timeframe.gte,
    lte: timeframe.lte ?? "now",
  });
}

function buildNested(path: string, query: Record<string, unknown>): Record<string, unknown> {
  return {
    nested: {
      path,
      query,
    },
  };
}

/**
 * Compile a single condition into a query clause.
 * Returns { query, bucket } or null if invalid.
 */
function compileCondition(
  cond: Condition,
  catalog?: FieldCatalog
): { query: Record<string, unknown>; bucket: "must" | "filter" | "must_not" | "should" } | null {
  const { clause, field, operator, value, value2, nestedPath, slop } = cond;

  if (!field) return null;

  const fieldType = resolveFieldType(catalog, field);
  const keywordField = resolveKeywordField(cond, catalog);

  // Value required for most operators
  const needsValue = !["exists", "not_exists"].includes(operator);
  if (needsValue) {
    if (value === undefined || value === null) return null;
    if (typeof value === "string" && value.trim() === "") return null;
    if (Array.isArray(value) && value.length === 0 && operator === "in") return null;
  }

  let query: Record<string, unknown> | null = null;
  let bucket: "must" | "filter" | "must_not" | "should" = getTargetBucket(clause, operator);

  switch (operator) {
    case "contains": {
      query = buildMatch(field, value as string | number | boolean);
      break;
    }
    case "not_contains": {
      query = buildMatch(field, value as string | number | boolean);
      bucket = "must_not";
      break;
    }
    case "phrase": {
      query = buildMatchPhrase(field, value as string | number | boolean, slop);
      break;
    }
    case "not_phrase": {
      query = buildMatchPhrase(field, value as string | number | boolean, slop);
      bucket = "must_not";
      break;
    }
    case "equals":
    case "exact": {
      if (fieldType === "keyword" || (fieldType === "text" && keywordField !== field)) {
        query = buildTerm(keywordField, value as string | number | boolean);
      } else {
        query = buildMatchPhrase(field, value as string | number | boolean);
      }
      break;
    }
    case "not_exact": {
      if (fieldType === "keyword" || (fieldType === "text" && keywordField !== field)) {
        query = buildTerm(keywordField, value as string | number | boolean);
      } else {
        query = buildMatchPhrase(field, value as string | number | boolean);
      }
      bucket = "must_not";
      break;
    }
    case "in": {
      const arr = Array.isArray(value) ? value : [value];
      if (arr.length === 0) return null;
      const targetField = fieldType === "keyword" ? field : keywordField;
      query = buildTerms(targetField, arr as Array<string | number | boolean>);
      break;
    }
    case "exists": {
      query = buildExists(field);
      bucket = clause === "must_not" ? "must_not" : "filter";
      break;
    }
    case "not_exists": {
      query = buildExists(field);
      bucket = "must_not";
      break;
    }
    case "gt":
      query = buildRange(field, { gt: value });
      break;
    case "gte":
      query = buildRange(field, { gte: value });
      break;
    case "lt":
      query = buildRange(field, { lt: value });
      break;
    case "lte":
      query = buildRange(field, { lte: value });
      break;
    case "eq":
      query = buildRange(field, { gte: value, lte: value });
      break;
    case "neq": {
      query = buildTerm(field, value as string | number | boolean);
      bucket = "must_not";
      break;
    }
    case "between":
      query = buildRange(field, { gte: value, lte: value2 ?? "now" });
      break;
    case "query_string":
      query = buildQueryString(String(value ?? ""));
      break;
    default:
      return null;
  }

  if (!query) return null;

  const effectivePath = nestedPath ?? getFieldInfo(catalog, field)?.nestedPath;
  const finalQuery = effectivePath ? buildNested(effectivePath, query) : query;

  return { query: finalQuery, bucket };
}

/**
 * Group conditions by nestedPath for nested query grouping.
 * Per spec G: group all conditions with same nestedPath into ONE nested query with inner bool.
 */
function groupByNestedPath(
  compiled: Array<{ cond: Condition; result: { query: Record<string, unknown>; bucket: string } }>,
  catalog?: FieldCatalog
): Map<string | null, Array<{ cond: Condition; result: { query: Record<string, unknown>; bucket: string } }>> {
  const groups = new Map<string | null, Array<{ cond: Condition; result: { query: Record<string, unknown>; bucket: string } }>>();
  for (const item of compiled) {
    const path = item.cond.nestedPath ?? getFieldInfo(catalog, item.cond.field)?.nestedPath ?? null;
    if (!groups.has(path)) groups.set(path, []);
    groups.get(path)!.push(item);
  }
  return groups;
}

/**
 * Build inner bool for a group of conditions with same nestedPath.
 */
function buildInnerBool(
  items: Array<{ result: { query: Record<string, unknown>; bucket: string } }>
): Record<string, unknown> {
  const buckets: Record<string, unknown[]> = { must: [], filter: [], must_not: [], should: [] };
  for (const { result } of items) {
    const arr = buckets[result.bucket as keyof typeof buckets];
    if (Array.isArray(arr)) arr.push(result.query);
  }
  const cleaned: Record<string, unknown> = {};
  for (const k of ["must", "filter", "must_not", "should"]) {
    const arr = buckets[k as keyof typeof buckets];
    if (Array.isArray(arr) && arr.length > 0) cleaned[k] = arr;
  }
  return { bool: cleaned };
}

/**
 * Compile conditions to OpenSearch Query DSL.
 */
export function compileToDsl(
  input: CompileInput,
  catalog?: FieldCatalog
): OpenSearchDsl {
  const size = input.size ?? 0;
  const conditions = input.conditions ?? [];

  const compiled: Array<{ cond: Condition; result: { query: Record<string, unknown>; bucket: string } }> = [];
  for (const cond of conditions) {
    const result = compileCondition(cond, catalog);
    if (result) compiled.push({ cond, result });
  }

  const groups = groupByNestedPath(compiled, catalog);
  const must: Record<string, unknown>[] = [];
  const filter: Record<string, unknown>[] = [];
  const must_not: Record<string, unknown>[] = [];
  const should: Record<string, unknown>[] = [];

  for (const [path, items] of groups) {
    const innerBool = buildInnerBool(items);
    const hasClauses = Object.keys(innerBool.bool as object).length > 0;
    if (!hasClauses) continue;

    if (path) {
      const nestedQuery = buildNested(path, innerBool);
      const hasMust = items.some((i) => i.result.bucket === "must");
      const hasFilter = items.some((i) => i.result.bucket === "filter");
      const hasMustNot = items.some((i) => i.result.bucket === "must_not");
      const hasShould = items.some((i) => i.result.bucket === "should");
      if (hasMust) must.push(nestedQuery);
      else if (hasFilter) filter.push(nestedQuery);
      else if (hasMustNot) must_not.push(nestedQuery);
      else if (hasShould) should.push(nestedQuery);
    } else {
      for (const { result } of items) {
        const arr = result.bucket === "must" ? must
          : result.bucket === "filter" ? filter
          : result.bucket === "must_not" ? must_not
          : should;
        arr.push(result.query);
      }
    }
  }

  if (input.timeframe) {
    filter.push(buildTimeRange(input.timeframe));
  }

  const boolClauses: Record<string, unknown> = {};
  if (must.length > 0) boolClauses.must = must;
  if (filter.length > 0) boolClauses.filter = filter;
  if (must_not.length > 0) boolClauses.must_not = must_not;
  if (should.length > 0) boolClauses.should = should;

  const hasAnyClause = Object.keys(boolClauses).length > 0;
  const query = hasAnyClause
    ? { bool: { ...boolClauses, adjust_pure_negative: true } }
    : { match_all: {} };

  return {
    size,
    query,
  };
}

/**
 * Simple timeframe from string like "now-1h" -> { field: "time", gte: "now-1h", lte: "now" }
 */
export function timeframeFromString(
  tf: string,
  field = "time"
): { field: string; gte: string; lte: string } {
  return {
    field,
    gte: tf || "now-1h",
    lte: "now",
  };
}

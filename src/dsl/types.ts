/**
 * Types for Conditions → OpenSearch Query DSL converter.
 * Per https://docs.opensearch.org/latest/query-dsl/
 */

export type Clause = "must" | "must_not" | "filter" | "should";

export type Operator =
  | "contains"        // full-text search
  | "not_contains"    // must_not match
  | "phrase"         // exact phrase
  | "not_phrase"     // must_not phrase
  | "equals"         // exact value
  | "exact"          // alias for equals
  | "not_exact"      // must_not exact
  | "in"             // list of exact values
  | "exists"
  | "not_exists"
  | "gt" | "gte" | "lt" | "lte"
  | "eq" | "neq"     // numeric equality
  | "between"
  | "query_string";  // only if explicitly selected

export interface Condition {
  clause: Clause;
  field: string;
  operator: Operator;
  value?: string | number | boolean | Array<string | number | boolean>;
  value2?: string | number;
  nestedPath?: string;
  slop?: number;
}

export interface Timeframe {
  field: string;
  gte: string | number;
  lte?: string | number;
}

export type FieldType =
  | "text" | "keyword"
  | "boolean"
  | "integer" | "long" | "float" | "double"
  | "date"
  | "ip"
  | "unknown";

export interface FieldInfo {
  name: string;
  type: FieldType;
  keywordField?: string;
  searchable?: boolean;
  aggregatable?: boolean;
  nestedPath?: string;
}

export type FieldCatalog = Record<string, FieldInfo>;

export interface CompileInput {
  index?: string;
  size?: number;
  timeframe?: Timeframe;
  conditions: Condition[];
}

export interface OpenSearchDsl {
  size?: number;
  query: Record<string, unknown>;
  aggregations?: Record<string, unknown>;
}

export interface LintMessage {
  level: "warn" | "error";
  message: string;
  path?: string;
}

export interface LintResult {
  ok: boolean;
  messages: LintMessage[];
}

/**
 * Conditions → OpenSearch Query DSL converter.
 * Per https://docs.opensearch.org/latest/query-dsl/
 */

export type {
  Clause,
  Operator,
  Condition,
  Timeframe,
  FieldType,
  FieldInfo,
  FieldCatalog,
  CompileInput,
  OpenSearchDsl,
  LintMessage,
  LintResult,
} from "./types";

export { compileToDsl, timeframeFromString } from "./compiler";
export { lintDsl } from "./lint";

/**
 * Pretty-print DSL as JSON string.
 */
export function stringifyDsl(dsl: { query: unknown; size?: number; aggregations?: unknown }): string {
  return JSON.stringify(dsl, null, 2);
}

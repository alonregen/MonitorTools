/**
 * Linter for OpenSearch Query DSL.
 * Checks common mistakes and emits warnings/errors.
 */

import type { OpenSearchDsl, FieldCatalog, FieldInfo, LintResult, LintMessage } from "./types";

function getFieldInfo(catalog: FieldCatalog | undefined, field: string): FieldInfo | undefined {
  return catalog?.[field];
}

function walkQuery(
  obj: unknown,
  path: string,
  catalog: FieldCatalog | undefined,
  messages: LintMessage[],
  currentNestedPath: string | null = null
): void {
  if (!obj || typeof obj !== "object") return;

  const o = obj as Record<string, unknown>;

  function checkNestedField(field: string, subPath: string): void {
    const info = getFieldInfo(catalog, field);
    if (info?.nestedPath && currentNestedPath !== info.nestedPath) {
      messages.push({
        level: "error",
        message: `nested field "${field}" (path: ${info.nestedPath}) used without nested wrapper`,
        path: subPath,
      });
    }
  }

  if (o.term) {
    const term = o.term as Record<string, unknown>;
    const field = Object.keys(term)[0];
    if (field) {
      checkNestedField(field, `${path}.term`);
      const info = getFieldInfo(catalog, field);
      if (info?.type === "text" && !info.keywordField) {
        messages.push({
          level: "warn",
          message: `term used on text field "${field}" without keywordField`,
          path: `${path}.term`,
        });
      }
    }
  }

  if (o.terms) {
    const terms = o.terms as Record<string, unknown>;
    const field = Object.keys(terms)[0];
    if (field) {
      checkNestedField(field, `${path}.terms`);
      const info = getFieldInfo(catalog, field);
      if (info?.type === "text" && !info.keywordField) {
        messages.push({
          level: "warn",
          message: `terms used on text field "${field}" without keywordField`,
          path: `${path}.terms`,
        });
      }
    }
  }

  if (o.match) {
    const match = o.match as Record<string, unknown>;
    const field = Object.keys(match)[0];
    if (field) {
      checkNestedField(field, `${path}.match`);
      const info = getFieldInfo(catalog, field);
      if (info?.type === "keyword") {
        messages.push({
          level: "warn",
          message: `match used on keyword field "${field}" - consider term for equals/in`,
          path: `${path}.match`,
        });
      }
    }
  }

  if (o.match_phrase) {
    const mp = o.match_phrase as Record<string, unknown>;
    const field = Object.keys(mp)[0];
    if (field) {
      checkNestedField(field, `${path}.match_phrase`);
      const info = getFieldInfo(catalog, field);
      if (info?.type === "keyword") {
        messages.push({
          level: "warn",
          message: `match_phrase used on keyword field "${field}" - consider term for exact match`,
          path: `${path}.match_phrase`,
        });
      }
    }
  }

  if (o.range) {
    const range = o.range as Record<string, unknown>;
    const field = Object.keys(range)[0];
    if (field) {
      checkNestedField(field, `${path}.range`);
      const info = getFieldInfo(catalog, field);
      const validRangeTypes = ["date", "long", "integer", "float", "double", "ip"];
      if (info && !validRangeTypes.includes(info.type)) {
        messages.push({
          level: "warn",
          message: `range used on non-numeric/date field "${field}" (type: ${info.type})`,
          path: `${path}.range`,
        });
      }
    }
  }

  if (o.query_string) {
    messages.push({
      level: "warn",
      message: "query_string used - strict syntax can fail on malformed input",
      path: `${path}.query_string`,
    });
  }

  if (o.nested) {
    const nested = o.nested as Record<string, unknown>;
    const pathVal = nested.path as string;
    if (pathVal && catalog) {
      const hasNestedFields = Object.values(catalog).some(
        (f) => f.nestedPath === pathVal || f.name.startsWith(pathVal + ".")
      );
      if (!hasNestedFields) {
        messages.push({
          level: "warn",
          message: `nested path "${pathVal}" not found in field catalog`,
          path: `${path}.nested`,
        });
      }
    }
    const innerQuery = nested.query;
    if (innerQuery) {
      walkQuery(innerQuery, `${path}.nested.query`, catalog, messages, pathVal ?? null);
    }
  }

  if (o.bool) {
    const bool = o.bool as Record<string, unknown>;
    for (const k of ["must", "filter", "must_not", "should"]) {
      const arr = bool[k];
      if (Array.isArray(arr)) {
        arr.forEach((item, i) =>
          walkQuery(item, `${path}.bool.${k}[${i}]`, catalog, messages, currentNestedPath)
        );
      }
    }
  }

  if (o.exists) {
    const exists = o.exists as Record<string, unknown>;
    const field = exists.field as string;
    if (field) {
      checkNestedField(field, `${path}.exists`);
    }
  }
}

/**
 * Lint OpenSearch DSL for common mistakes.
 */
export function lintDsl(
  dsl: OpenSearchDsl,
  catalog?: FieldCatalog
): LintResult {
  const messages: LintMessage[] = [];

  if (!dsl.query) {
    messages.push({ level: "error", message: "Missing query", path: "query" });
    return { ok: false, messages };
  }

  walkQuery(dsl.query, "query", catalog, messages, null);

  const hasError = messages.some((m) => m.level === "error");
  return {
    ok: !hasError,
    messages,
  };
}

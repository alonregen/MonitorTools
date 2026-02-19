import { describe, it, expect } from "vitest";
import { lintDsl } from "../src/dsl/index";
import type { OpenSearchDsl, FieldCatalog } from "../src/dsl/types";

const catalog: FieldCatalog = {
  message: { name: "message", type: "text", keywordField: "message.keyword" },
  label: { name: "label", type: "text", keywordField: "label.keyword" },
  time: { name: "time", type: "date" },
  nested_field: { name: "nested_field", type: "text", nestedPath: "items" },
};

describe("lintDsl", () => {
  it("returns error when query is missing", () => {
    const result = lintDsl({} as OpenSearchDsl);
    expect(result.ok).toBe(false);
    expect(result.messages).toContainEqual(
      expect.objectContaining({ level: "error", message: "Missing query" })
    );
  });

  it("returns ok for valid match_all", () => {
    const result = lintDsl({ size: 0, query: { match_all: {} } });
    expect(result.ok).toBe(true);
    expect(result.messages.length).toBe(0);
  });

  it("warns when term used on text field without keywordField", () => {
    const catalogNoKw: FieldCatalog = {
      message: { name: "message", type: "text" },
    };
    const dsl: OpenSearchDsl = {
      query: {
        bool: {
          filter: [{ term: { message: { value: "x" } } }],
        },
      },
    };
    const result = lintDsl(dsl, catalogNoKw);
    expect(result.messages).toContainEqual(
      expect.objectContaining({
        level: "warn",
        message: expect.stringContaining("term used on text field"),
      })
    );
  });

  it("warns when match used on keyword field", () => {
    const catalogKw: FieldCatalog = {
      label: { name: "label", type: "keyword" },
    };
    const dsl: OpenSearchDsl = {
      query: {
        bool: {
          must: [{ match: { label: { query: "x" } } }],
        },
      },
    };
    const result = lintDsl(dsl, catalogKw);
    expect(result.messages).toContainEqual(
      expect.objectContaining({
        level: "warn",
        message: expect.stringContaining("match used on keyword field"),
      })
    );
  });

  it("warns when range used on text field", () => {
    const dsl: OpenSearchDsl = {
      query: {
        bool: {
          filter: [{ range: { message: { gte: "a", lte: "z" } } }],
        },
      },
    };
    const result = lintDsl(dsl, catalog);
    expect(result.messages).toContainEqual(
      expect.objectContaining({
        level: "warn",
        message: expect.stringContaining("range used on non-numeric/date field"),
      })
    );
  });

  it("warns when query_string used", () => {
    const dsl: OpenSearchDsl = {
      query: {
        bool: {
          must: [{ query_string: { query: "x" } }],
        },
      },
    };
    const result = lintDsl(dsl, catalog);
    expect(result.messages).toContainEqual(
      expect.objectContaining({
        level: "warn",
        message: expect.stringContaining("query_string"),
      })
    );
  });

  it("returns ok when no issues", () => {
    const dsl: OpenSearchDsl = {
      query: {
        bool: {
          filter: [
            { range: { time: { gte: "now-1h", lte: "now" } } },
            { term: { "label.keyword": { value: "x" } } },
          ],
        },
      },
    };
    const result = lintDsl(dsl, catalog);
    expect(result.ok).toBe(true);
  });

  it("works without catalog", () => {
    const dsl: OpenSearchDsl = {
      query: { match_all: {} },
    };
    const result = lintDsl(dsl);
    expect(result.ok).toBe(true);
  });
});

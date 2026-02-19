import { describe, it, expect } from "vitest";
import { compileToDsl, timeframeFromString } from "../src/dsl/index";
import type { CompileInput, Condition, FieldCatalog } from "../src/dsl/types";

const catalog: FieldCatalog = {
  message: { name: "message", type: "text", keywordField: "message.keyword" },
  label: { name: "label", type: "text", keywordField: "label.keyword" },
  level: { name: "level", type: "text", keywordField: "level.keyword" },
  params: { name: "params", type: "text", keywordField: "params.keyword" },
  time: { name: "time", type: "date" },
  timestamp: { name: "timestamp", type: "long" },
};

describe("compileToDsl", () => {
  it("returns empty match_all when no conditions", () => {
    const result = compileToDsl({ conditions: [] });
    expect(result.size).toBe(0);
    expect(result.query).toEqual({ match_all: {} });
  });

  it("uses default size 0", () => {
    const result = compileToDsl({ conditions: [] });
    expect(result.size).toBe(0);
  });

  it("uses input size", () => {
    const result = compileToDsl({ conditions: [], size: 10 });
    expect(result.size).toBe(10);
  });

  it("compiles contains to match query", () => {
    const input: CompileInput = {
      conditions: [
        { clause: "must", field: "message", operator: "contains", value: "PAYMENT_FAILED" },
      ],
    };
    const result = compileToDsl(input, catalog);
    expect(result.query).toMatchObject({
      bool: {
        must: [{ match: { message: { query: "PAYMENT_FAILED", operator: "OR" } } }],
      },
    });
  });

  it("compiles phrase to match_phrase", () => {
    const input: CompileInput = {
      conditions: [
        { clause: "must", field: "message", operator: "phrase", value: "event not supported" },
      ],
    };
    const result = compileToDsl(input, catalog);
    expect(result.query).toMatchObject({
      bool: {
        must: [{ match_phrase: { message: { query: "event not supported", slop: 0 } } }],
      },
    });
  });

  it("compiles equals to term on keyword field", () => {
    const input: CompileInput = {
      conditions: [
        { clause: "must", field: "label", operator: "equals", value: "collect_service" },
      ],
    };
    const result = compileToDsl(input, catalog);
    expect(result.query).toMatchObject({
      bool: {
        filter: [{ term: { "label.keyword": { value: "collect_service" } } }],
      },
    });
  });

  it("compiles exact (alias for equals)", () => {
    const input: CompileInput = {
      conditions: [
        { clause: "must", field: "level", operator: "exact", value: "ERROR" },
      ],
    };
    const result = compileToDsl(input, catalog);
    expect(result.query).toMatchObject({
      bool: {
        filter: [{ term: { "level.keyword": { value: "ERROR" } } }],
      },
    });
  });

  it("compiles in to terms", () => {
    const input: CompileInput = {
      conditions: [
        { clause: "must", field: "label", operator: "in", value: ["a", "b", "c"] },
      ],
    };
    const result = compileToDsl(input, catalog);
    expect(result.query).toMatchObject({
      bool: {
        filter: [{ terms: { "label.keyword": ["a", "b", "c"] } }],
      },
    });
  });

  it("compiles not_contains to must_not match", () => {
    const input: CompileInput = {
      conditions: [
        { clause: "must_not", field: "message", operator: "not_contains", value: "skip" },
      ],
    };
    const result = compileToDsl(input, catalog);
    expect(result.query).toMatchObject({
      bool: {
        must_not: [{ match: { message: { query: "skip", operator: "OR" } } }],
      },
    });
  });

  it("compiles exists", () => {
    const input: CompileInput = {
      conditions: [
        { clause: "filter", field: "params", operator: "exists" },
      ],
    };
    const result = compileToDsl(input, catalog);
    expect(result.query).toMatchObject({
      bool: {
        filter: [{ exists: { field: "params" } }],
      },
    });
  });

  it("compiles not_exists to must_not exists", () => {
    const input: CompileInput = {
      conditions: [
        { clause: "must", field: "message", operator: "not_exists" },
      ],
    };
    const result = compileToDsl(input, catalog);
    expect(result.query).toMatchObject({
      bool: {
        must_not: [{ exists: { field: "message" } }],
      },
    });
  });

  it("compiles range gte/lte", () => {
    const input: CompileInput = {
      conditions: [
        { clause: "filter", field: "timestamp", operator: "gte", value: 1000 },
        { clause: "filter", field: "timestamp", operator: "lte", value: 2000 },
      ],
    };
    const result = compileToDsl(input, catalog);
    expect(result.query).toMatchObject({
      bool: {
        filter: [
          { range: { timestamp: { gte: 1000 } } },
          { range: { timestamp: { lte: 2000 } } },
        ],
      },
    });
  });

  it("compiles between", () => {
    const input: CompileInput = {
      conditions: [
        { clause: "filter", field: "time", operator: "between", value: "now-1h", value2: "now" },
      ],
    };
    const result = compileToDsl(input, catalog);
    expect(result.query).toMatchObject({
      bool: {
        filter: [{ range: { time: { gte: "now-1h", lte: "now" } } }],
      },
    });
  });

  it("injects timeframe into filter", () => {
    const input: CompileInput = {
      conditions: [
        { clause: "must", field: "message", operator: "contains", value: "x" },
      ],
      timeframe: { field: "time", gte: "now-1h", lte: "now" },
    };
    const result = compileToDsl(input, catalog);
    expect(result.query).toMatchObject({
      bool: {
        must: [{ match: { message: { query: "x", operator: "OR" } } }],
        filter: [{ range: { time: { gte: "now-1h", lte: "now" } } }],
      },
    });
  });

  it("ignores conditions with missing or empty value", () => {
    const input: CompileInput = {
      conditions: [
        { clause: "must", field: "message", operator: "contains", value: "" },
        { clause: "must", field: "message", operator: "contains" },
        { clause: "must", field: "message", operator: "contains", value: "   " },
      ],
    };
    const result = compileToDsl(input, catalog);
    expect(result.query).toEqual({ match_all: {} });
  });

  it("allows value 0", () => {
    const input: CompileInput = {
      conditions: [
        { clause: "filter", field: "timestamp", operator: "eq", value: 0 },
      ],
    };
    const result = compileToDsl(input, catalog);
    expect(result.query).toMatchObject({
      bool: {
        filter: [{ range: { timestamp: { gte: 0, lte: 0 } } }],
      },
    });
  });

  it("compiles query_string", () => {
    const input: CompileInput = {
      conditions: [
        { clause: "must", field: "message", operator: "query_string", value: "error OR fail" },
      ],
    };
    const result = compileToDsl(input, catalog);
    expect(result.query).toMatchObject({
      bool: {
        must: [{ query_string: { query: "error OR fail" } }],
      },
    });
  });

  it("compiles From Text example: status + message in params", () => {
    const input: CompileInput = {
      conditions: [
        { clause: "must", field: "params", operator: "contains", value: "FAILURE" },
        { clause: "must", field: "message", operator: "phrase", value: "event not supported: PAYMENT_FAILED" },
      ],
      timeframe: { field: "time", gte: "now-1h", lte: "now" },
    };
    const result = compileToDsl(input, catalog);
    expect(result.query).toMatchObject({
      bool: {
        must: [
          { match: { params: { query: "FAILURE", operator: "OR" } } },
          { match_phrase: { message: { query: "event not supported: PAYMENT_FAILED", slop: 0 } } },
        ],
        filter: [{ range: { time: { gte: "now-1h", lte: "now" } } }],
      },
    });
  });

  it("groups nested conditions into one nested query", () => {
    const catalogWithNested: FieldCatalog = {
      ...catalog,
      "items.name": { name: "items.name", type: "text", nestedPath: "items" },
    };
    const input: CompileInput = {
      conditions: [
        { clause: "must", field: "items.name", operator: "phrase", value: "x", nestedPath: "items" },
        { clause: "filter", field: "items.name", operator: "equals", value: "y", nestedPath: "items" },
      ],
    };
    const result = compileToDsl(input, catalogWithNested);
    expect(result.query).toMatchObject({
      bool: {
        must: [
          {
            nested: {
              path: "items",
              query: {
                bool: {
                  must: expect.any(Array),
                  filter: expect.any(Array),
                },
              },
            },
          },
        ],
      },
    });
  });

  it("is deterministic: same input produces same output", () => {
    const input: CompileInput = {
      conditions: [
        { clause: "must", field: "label", operator: "equals", value: "x" },
      ],
    };
    const a = compileToDsl(input, catalog);
    const b = compileToDsl(input, catalog);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("timeframeFromString", () => {
  it("returns timeframe with default field", () => {
    const tf = timeframeFromString("now-10m");
    expect(tf).toEqual({ field: "time", gte: "now-10m", lte: "now" });
  });

  it("uses custom field", () => {
    const tf = timeframeFromString("now-1d", "@timestamp");
    expect(tf).toEqual({ field: "@timestamp", gte: "now-1d", lte: "now" });
  });
});

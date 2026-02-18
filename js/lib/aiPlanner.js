/**
 * AI Planner – browser-based LLM (WebGPU) that converts natural language
 * into a structured "AI Plan" JSON, which is then applied to the existing
 * conditions UI. Uses @mlc-ai/web-llm loaded from CDN.
 *
 * Depends on: window.App.fieldCatalog
 */
(function (global) {
  'use strict';

  var MODEL_ID = 'Llama-3.1-8B-Instruct-q4f16_1-MLC';
  var WEB_LLM_CDN = 'https://esm.run/@mlc-ai/web-llm';

  var engine = null;
  var status = 'idle';
  var lastError = null;
  var webllmModule = null;

  var ALLOWED_TIMEFRAMES = [
    'now-5m', 'now-10m', 'now-30m', 'now-1h', 'now-3h',
    'now-6h', 'now-12h', 'now-1d', 'now-7d', 'now-30d'
  ];

  var ALLOWED_OPS = [
    'contains', 'phrase', 'exact', 'not_contains', 'not_phrase', 'not_exact',
    'gte', 'lte', 'between', 'eq', 'neq'
  ];

  var AGG_KINDS = ['none', 'filters_by_values', 'terms'];

  // ─── WebGPU Support ───────────────────────────────────────────

  function checkWebGPUSupport() {
    return !!(navigator && navigator.gpu);
  }

  function getStatus() { return status; }
  function getLastError() { return lastError; }

  // ─── Model Loading ────────────────────────────────────────────

  function loadModel(progressCallback) {
    if (engine) {
      status = 'ready';
      return Promise.resolve();
    }
    if (!checkWebGPUSupport()) {
      status = 'error';
      lastError = 'WebGPU not supported';
      return Promise.reject(new Error(lastError));
    }

    status = 'downloading';
    lastError = null;

    return import(WEB_LLM_CDN).then(function (mod) {
      webllmModule = mod;
      status = 'loading';
      return mod.CreateMLCEngine(MODEL_ID, {
        initProgressCallback: function (progress) {
          if (progressCallback) progressCallback(progress);
        }
      });
    }).then(function (eng) {
      engine = eng;
      status = 'ready';
    }).catch(function (err) {
      status = 'error';
      lastError = err.message || String(err);
      throw err;
    });
  }

  // ─── Prompt Construction ──────────────────────────────────────

  function buildFieldCatalogStr() {
    var catalog = global.App && global.App.fieldCatalog;
    if (!catalog || !catalog.fields) return '[]';
    return JSON.stringify(catalog.fields.map(function (f) {
      return { name: f.name, type: f.type, keywordField: f.keywordField || null };
    }));
  }

  var SYSTEM_PROMPT = [
    'You are a query-building assistant. Convert the user request into an AiPlan JSON object.',
    'Output ONLY valid JSON. No markdown, no explanation, no extra keys.',
    '',
    'SCHEMA (follow exactly):',
    '{',
    '  "queryType": "alert",',
    '  "timeframe": one of: "now-5m","now-10m","now-30m","now-1h","now-3h","now-6h","now-12h","now-1d","now-7d","now-30d",',
    '  "must": [{"field":"<fieldname>","op":"<operator>","value":"<val>"}],',
    '  "must_not": [{"field":"<fieldname>","op":"<operator>","value":"<val>"}],',
    '  "aggs": {"kind":"none"} or {"kind":"filters_by_values","field":"<f>","values":["v1","v2"]} or {"kind":"terms","field":"<f>","size":20} or null,',
    '  "notes": ["optional warnings"],',
    '  "confidence": 0.0 to 1.0',
    '}',
    '',
    'OPERATORS for text fields: "contains" (match), "phrase" (match_phrase), "exact" (term on .keyword)',
    'OPERATORS for date fields: "gte", "lte", "between"',
    'OPERATORS for numeric (long) fields: "eq", "neq", "gt", "gte", "lt", "lte", "between"',
    'Negation operators: "not_contains", "not_phrase", "not_exact" — put these in must_not array.',
    '',
    'RULES:',
    '- Always use "queryType": "alert"',
    '- Choose the timeframe that best matches the user request. Default to "now-1h" if unclear.',
    '- Use field names from the catalog. For exact match or aggregation, use the keywordField if available.',
    '- Put negative conditions (exclude, not, without) in must_not with positive operators (phrase, contains).',
    '- confidence: 1.0 if clear request, lower if ambiguous.',
    '- notes: add a note if you made assumptions.'
  ].join('\n');

  function buildUserPrompt(userRequest, currentState) {
    var parts = [];
    parts.push('FIELD CATALOG:\n' + buildFieldCatalogStr());
    parts.push('');
    parts.push('EXAMPLES:');
    parts.push('Request: "find payment failures from collect_service in the last 10 minutes"');
    parts.push('Answer: {"queryType":"alert","timeframe":"now-10m","must":[{"field":"label","op":"phrase","value":"collect_service"},{"field":"params","op":"contains","value":"PAYMENT_FAILED"}],"must_not":[],"aggs":null,"notes":[],"confidence":0.9}');
    parts.push('');
    parts.push('Request: "errors in the last hour excluding timeout messages"');
    parts.push('Answer: {"queryType":"alert","timeframe":"now-1h","must":[{"field":"level","op":"phrase","value":"error"}],"must_not":[{"field":"message","op":"contains","value":"timeout"}],"aggs":null,"notes":[],"confidence":0.85}');
    parts.push('');
    parts.push('Request: "show top labels for collect_service logs in last 30 minutes"');
    parts.push('Answer: {"queryType":"alert","timeframe":"now-30m","must":[{"field":"label","op":"phrase","value":"collect_service"}],"must_not":[],"aggs":{"kind":"terms","field":"label.keyword","size":20},"notes":[],"confidence":0.8}');
    parts.push('');
    if (currentState) {
      parts.push('CURRENT UI STATE: timeframe=' + (currentState.timeframe || 'now-1h'));
    }
    parts.push('');
    parts.push('USER REQUEST: ' + userRequest);
    parts.push('');
    parts.push('Output ONLY the JSON object:');
    return parts.join('\n');
  }

  // ─── Generation ───────────────────────────────────────────────

  /** Simple text generation (for natural language search, etc.). Returns raw string. */
  function generateText(userMessage, systemPrompt) {
    if (!engine) return Promise.reject(new Error('Model not loaded'));
    if (status === 'generating') return Promise.reject(new Error('Already generating'));

    status = 'generating';
    var messages = [
      { role: 'system', content: systemPrompt || 'You are a helpful assistant. Reply with only the requested output, no extra text.' },
      { role: 'user', content: userMessage }
    ];

    return engine.chat.completions.create({
      messages: messages,
      temperature: 0.1,
      max_tokens: 256
    }).then(function (reply) {
      status = 'ready';
      return (reply.choices[0] && reply.choices[0].message && reply.choices[0].message.content) || '';
    }).catch(function (err) {
      status = 'ready';
      throw err;
    });
  }

  function generatePlan(userRequest, currentState) {
    if (!engine) return Promise.reject(new Error('Model not loaded'));
    if (status === 'generating') return Promise.reject(new Error('Already generating'));

    status = 'generating';

    var messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(userRequest, currentState) }
    ];

    return engine.chat.completions.create({
      messages: messages,
      temperature: 0.1,
      max_tokens: 1024
    }).then(function (reply) {
      status = 'ready';
      var raw = reply.choices[0].message.content;
      return { raw: raw, plan: validatePlan(raw) };
    }).catch(function (err) {
      status = 'ready';
      throw err;
    });
  }

  // ─── Validation & Sanitization ────────────────────────────────

  function extractJsonFromResponse(str) {
    if (!str || typeof str !== 'string') return null;
    var s = str.trim();
    var match = s.match(/\{[\s\S]*\}/);
    if (match) return match[0];
    return s;
  }

  function validatePlan(rawStr) {
    var jsonStr = extractJsonFromResponse(rawStr);
    var parsed;
    try {
      parsed = JSON.parse(jsonStr || rawStr || '{}');
    } catch (e) {
      return { valid: false, errors: ['Invalid JSON: ' + e.message], plan: null };
    }

    var errors = [];
    var plan = {};

    plan.queryType = parsed.queryType === 'nested' ? 'nested' : 'alert';

    if (ALLOWED_TIMEFRAMES.indexOf(parsed.timeframe) !== -1) {
      plan.timeframe = parsed.timeframe;
    } else {
      plan.timeframe = 'now-1h';
      if (parsed.timeframe) errors.push('Unknown timeframe "' + parsed.timeframe + '", defaulted to now-1h');
    }

    plan.must = validateConditions(parsed.must, errors, 'must');
    plan.must_not = validateConditions(parsed.must_not, errors, 'must_not');

    if (plan.must.length === 0 && plan.must_not.length === 0) {
      errors.push('No conditions generated');
    }

    plan.aggs = validateAggs(parsed.aggs, errors);

    plan.notes = Array.isArray(parsed.notes)
      ? parsed.notes.filter(function (n) { return typeof n === 'string'; }).slice(0, 10)
      : [];

    plan.confidence = typeof parsed.confidence === 'number'
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0.5;

    if (errors.length > 0) plan.notes = errors.concat(plan.notes);

    return { valid: true, errors: errors, plan: plan };
  }

  function validateConditions(arr, errors, label) {
    if (!Array.isArray(arr)) return [];
    var MAX = 20;
    var result = [];
    arr.forEach(function (c, i) {
      if (i >= MAX) {
        if (i === MAX) errors.push(label + ': truncated to ' + MAX + ' conditions');
        return;
      }
      if (!c || typeof c !== 'object') return;
      var field = String(c.field || '').trim();
      var op = String(c.op || '').trim();
      var value = c.value !== undefined ? String(c.value).trim() : '';
      if (!field || !value) {
        errors.push(label + '[' + i + ']: missing field or value');
        return;
      }
      op = normalizeOp(op);
      field = normalizeField(field, op);
      result.push({ field: field, op: op, value: value });
    });
    return result;
  }

  function normalizeOp(op) {
    var map = {
      'match': 'contains',
      'match_phrase': 'phrase',
      'term': 'exact',
      'range_gte': 'gte',
      'range_lte': 'lte'
    };
    if (map[op]) return map[op];
    if (ALLOWED_OPS.indexOf(op) !== -1) return op;
    return 'contains';
  }

  function normalizeField(field, op) {
    var catalog = global.App && global.App.fieldCatalog;
    if (!catalog) return field;

    if (field.indexOf('.keyword') !== -1) {
      var base = field.replace('.keyword', '');
      var meta = catalog.getByName(base);
      if (meta && meta.hasKeyword) return base;
      return field;
    }

    if (op === 'exact' || op === 'not_exact') {
      var meta2 = catalog.getByName(field);
      if (meta2 && meta2.hasKeyword) return field;
    }

    return field;
  }

  function validateAggs(aggs, errors) {
    if (!aggs || typeof aggs !== 'object') return null;
    var kind = String(aggs.kind || 'none');
    if (AGG_KINDS.indexOf(kind) === -1) {
      errors.push('Unknown aggs.kind: ' + kind);
      return null;
    }
    if (kind === 'none') return null;

    var result = { kind: kind };
    if (aggs.field) result.field = String(aggs.field);
    if (Array.isArray(aggs.values)) {
      result.values = aggs.values.map(String).slice(0, 50);
    }
    if (typeof aggs.size === 'number') {
      result.size = Math.max(1, Math.min(10000, aggs.size));
    }
    return result;
  }

  // ─── Build aggregations from plan (for compile to OpenSearch DSL) ───

  function buildAggregationsFromPlan(aggs) {
    if (!aggs || typeof aggs !== 'object') return null;
    if (aggs.kind === 'filters_by_values' && aggs.field && Array.isArray(aggs.values)) {
      var filters = {};
      aggs.values.forEach(function (v) {
        var clause = { match_phrase: {} };
        clause.match_phrase[aggs.field] = { query: String(v), slop: 0, zero_terms_query: 'NONE', boost: 1 };
        filters[String(v)] = clause;
      });
      return { by_filter: { filters: { filters: filters } } };
    }
    if (aggs.kind === 'terms' && aggs.field) {
      var termsBody = { field: aggs.field, size: aggs.size || 20, order: { _count: 'desc' } };
      return { top_values: { terms: termsBody } };
    }
    return null;
  }

  // ─── Apply Plan to UI ────────────────────────────────────────

  function mapOpToConditionOp(op) {
    return op;
  }

  function mapClauseFromArray(arrayName) {
    return arrayName === 'must_not' ? 'must_not' : 'must';
  }

  // ─── Export ───────────────────────────────────────────────────

  global.App = global.App || {};
  global.App.aiPlanner = {
    checkWebGPUSupport: checkWebGPUSupport,
    getStatus: getStatus,
    getLastError: getLastError,
    loadModel: loadModel,
    generateText: generateText,
    generatePlan: generatePlan,
    validatePlan: validatePlan,
    buildAggregationsFromPlan: buildAggregationsFromPlan,
    mapOpToConditionOp: mapOpToConditionOp,
    mapClauseFromArray: mapClauseFromArray,
    ALLOWED_TIMEFRAMES: ALLOWED_TIMEFRAMES,
    ALLOWED_OPS: ALLOWED_OPS,
    MODEL_ID: MODEL_ID
  };

})(window);

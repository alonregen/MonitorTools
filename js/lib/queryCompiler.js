/**
 * Query Compiler – converts UI conditions into OpenSearch Query DSL.
 * Depends on window.App.fieldCatalog.
 */
(function (global) {
  'use strict';

  var catalog = null;
  function getCatalog() {
    if (!catalog) catalog = global.App.fieldCatalog;
    return catalog;
  }

  function buildMatchClause(field, value) {
    var obj = {};
    obj[field] = {
      query: value,
      operator: 'OR',
      prefix_length: 0,
      max_expansions: 50,
      fuzzy_transpositions: true,
      lenient: false,
      zero_terms_query: 'NONE',
      auto_generate_synonyms_phrase_query: true,
      boost: 1
    };
    return { match: obj };
  }

  function buildMatchPhraseClause(field, value) {
    var obj = {};
    obj[field] = {
      query: value,
      slop: 0,
      zero_terms_query: 'NONE',
      boost: 1
    };
    return { match_phrase: obj };
  }

  function buildTermClause(field, value) {
    var obj = {};
    obj[field] = { value: value, boost: 1 };
    return { term: obj };
  }

  function buildRangeClause(field, operator, value, value2) {
    var obj = {};
    var rangeParams = { boost: 1 };

    if (operator === 'between') {
      rangeParams.from = value;
      rangeParams.to = value2 || 'now';
      rangeParams.include_lower = true;
      rangeParams.include_upper = true;
    } else if (operator === 'gte') {
      rangeParams.from = value;
      rangeParams.to = null;
      rangeParams.include_lower = true;
      rangeParams.include_upper = true;
    } else if (operator === 'lte') {
      rangeParams.from = null;
      rangeParams.to = value;
      rangeParams.include_lower = true;
      rangeParams.include_upper = true;
    } else if (operator === 'gt') {
      rangeParams.from = value;
      rangeParams.to = null;
      rangeParams.include_lower = false;
      rangeParams.include_upper = true;
    } else if (operator === 'lt') {
      rangeParams.from = null;
      rangeParams.to = value;
      rangeParams.include_lower = true;
      rangeParams.include_upper = false;
    } else if (operator === 'eq') {
      rangeParams.from = value;
      rangeParams.to = value;
      rangeParams.include_lower = true;
      rangeParams.include_upper = true;
    } else if (operator === 'neq') {
      return null;
    }

    obj[field] = rangeParams;
    return { range: obj };
  }

  function buildNumericNeqClauses(field, value) {
    var obj = {};
    obj[field] = { value: value, boost: 1 };
    return { term: obj };
  }

  /**
   * Compile a single condition into one or more DSL clauses.
   * Returns { must: [...], must_not: [...] }
   */
  function compileCondition(cond) {
    var result = { must: [], must_not: [] };
    var fieldMeta = getCatalog().getByName(cond.field);
    var fieldName = cond.field;
    var op = cond.operator;
    var val = cond.value;
    var val2 = cond.value2;
    var clause = cond.clause; // 'must' or 'must_not'

    if (!fieldName || !val && val !== 0 && val !== '0') return result;

    if (fieldMeta && (fieldMeta.type === 'date' || fieldMeta.type === 'long' || fieldMeta.type === 'double')) {
      if (op === 'neq') {
        result.must_not.push(buildNumericNeqClauses(fieldName, val));
      } else {
        var rangeClause = buildRangeClause(fieldName, op, val, val2);
        if (rangeClause) {
          result[clause].push(rangeClause);
        }
      }
      return result;
    }

    // Text / keyword fields
    if (op === 'contains') {
      result[clause].push(buildMatchClause(fieldName, val));
    } else if (op === 'not_contains') {
      var targetClause = clause === 'must' ? 'must_not' : 'must';
      result[targetClause].push(buildMatchClause(fieldName, val));
    } else if (op === 'phrase') {
      result[clause].push(buildMatchPhraseClause(fieldName, val));
    } else if (op === 'not_phrase') {
      var phraseTarget = clause === 'must' ? 'must_not' : 'must';
      result[phraseTarget].push(buildMatchPhraseClause(fieldName, val));
    } else if (op === 'exact') {
      var kwField = (fieldMeta && fieldMeta.hasKeyword) ? fieldMeta.keywordField : fieldName;
      result[clause].push(buildTermClause(kwField, val));
    } else if (op === 'not_exact') {
      var kwField2 = (fieldMeta && fieldMeta.hasKeyword) ? fieldMeta.keywordField : fieldName;
      var exactTarget = clause === 'must' ? 'must_not' : 'must';
      result[exactTarget].push(buildTermClause(kwField2, val));
    } else {
      result[clause].push(buildMatchPhraseClause(fieldName, val));
    }

    return result;
  }

  /**
   * Build the time range filter clause.
   */
  function buildTimeRange(timeframe) {
    return {
      range: {
        time: {
          from: timeframe,
          to: 'now',
          include_lower: true,
          include_upper: true,
          boost: 1
        }
      }
    };
  }

  /**
   * Compile all conditions + timeframe into full OpenSearch DSL.
   * @param {Array} conditions - [{clause, field, operator, value, value2?}]
   * @param {string} timeframe - e.g. 'now-10m'
   * @param {object} [aggregations] - optional aggregations object to merge
   * @returns {object} OpenSearch query JSON
   */
  function compile(conditions, timeframe, aggregations) {
    var query = {
      size: 0,
      query: {
        bool: {
          must: [],
          filter: [],
          must_not: [],
          adjust_pure_negative: true,
          boost: 1
        }
      }
    };

    if (timeframe) {
      query.query.bool.filter.push(buildTimeRange(timeframe));
    }

    (conditions || []).forEach(function (cond) {
      var compiled = compileCondition(cond);
      compiled.must.forEach(function (c) { query.query.bool.must.push(c); });
      compiled.must_not.forEach(function (c) { query.query.bool.must_not.push(c); });
    });

    if (aggregations && Object.keys(aggregations).length > 0) {
      query.aggregations = aggregations;
    }

    return query;
  }

  global.App = global.App || {};
  global.App.queryCompiler = {
    compile: compile,
    compileCondition: compileCondition,
    buildTimeRange: buildTimeRange,
    buildMatchClause: buildMatchClause,
    buildMatchPhraseClause: buildMatchPhraseClause,
    buildTermClause: buildTermClause,
    buildRangeClause: buildRangeClause
  };
})(window);

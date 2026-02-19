/**
 * Field Catalog – metadata from prd-logs-* OpenSearch mappings.
 * Only includes fields that exist in the index. Provides field lookup,
 * search filtering, and per-type operator lists.
 */
(function (global) {
  'use strict';

  var FIELD_TYPES = {
    text:    { label: 'text',    icon: 'fa-font',        color: 'indigo' },
    keyword: { label: 'keyword', icon: 'fa-key',         color: 'violet' },
    date:    { label: 'date',    icon: 'fa-calendar-day', color: 'emerald' },
    long:    { label: 'long',    icon: 'fa-hashtag',     color: 'amber' },
    double:  { label: 'double',  icon: 'fa-hashtag',     color: 'amber' },
    boolean: { label: 'bool',    icon: 'fa-toggle-on',   color: 'rose' },
    ip:      { label: 'ip',      icon: 'fa-network-wired', color: 'cyan' }
  };

  var OPERATORS = {
    text: [
      { value: 'contains',     label: 'contains (match)' },
      { value: 'not_contains', label: 'not contains' },
      { value: 'phrase',       label: 'exact phrase (match_phrase)' },
      { value: 'not_phrase',   label: 'not phrase' },
      { value: 'exact',        label: 'exact term (.keyword)' },
      { value: 'not_exact',    label: 'not exact term' }
    ],
    date: [
      { value: 'gte',     label: '>= (from)' },
      { value: 'lte',     label: '<= (to)' },
      { value: 'between', label: 'between' }
    ],
    long: [
      { value: 'eq',      label: '=' },
      { value: 'neq',     label: '!=' },
      { value: 'gt',      label: '>' },
      { value: 'gte',     label: '>=' },
      { value: 'lt',      label: '<' },
      { value: 'lte',     label: '<=' },
      { value: 'between', label: 'between' }
    ]
  };
  OPERATORS.double = OPERATORS.long;

  var CATEGORIES = {
    time:        'Time',
    meta:        'Metadata',
    identifiers: 'Identifiers',
    content:     'Content'
  };

  var fields = [
    { name: 'time',                type: 'date', hasKeyword: false, keywordField: null,                        category: 'time' },
    { name: 'timestamp',           type: 'long', hasKeyword: false, keywordField: null,                        category: 'time' },
    { name: 'timestamp_ns',        type: 'long', hasKeyword: false, keywordField: null,                        category: 'time' },
    { name: 'level',               type: 'text', hasKeyword: true,  keywordField: 'level.keyword',             category: 'meta' },
    { name: 'label',               type: 'text', hasKeyword: true,  keywordField: 'label.keyword',             category: 'meta' },
    { name: 'tags',                type: 'text', hasKeyword: true,  keywordField: 'tags.keyword',              category: 'meta' },
    { name: 'source',              type: 'text', hasKeyword: true,  keywordField: 'source.keyword',            category: 'meta' },
    { name: 'moduleName',          type: 'text', hasKeyword: true,  keywordField: 'moduleName.keyword',        category: 'identifiers' },
    { name: 'filename',            type: 'text', hasKeyword: true,  keywordField: 'filename.keyword',          category: 'identifiers' },
    { name: 'function',            type: 'text', hasKeyword: true,  keywordField: 'function.keyword',          category: 'identifiers' },
    { name: 'instance_id',         type: 'text', hasKeyword: true,  keywordField: 'instance_id.keyword',       category: 'identifiers' },
    { name: 'operation_id',        type: 'text', hasKeyword: true,  keywordField: 'operation_id.keyword',      category: 'identifiers' },
    { name: 'source_operation_id', type: 'text', hasKeyword: true,  keywordField: 'source_operation_id.keyword', category: 'identifiers' },
    { name: 'message',             type: 'text', hasKeyword: true,  keywordField: 'message.keyword',           category: 'content' },
    { name: 'params',              type: 'text', hasKeyword: true,  keywordField: 'params.keyword',            category: 'content' }
  ];

  var fieldMap = {};
  fields.forEach(function (f) { fieldMap[f.name] = f; });

  function getByName(name) {
    return fieldMap[name] || null;
  }

  function search(query) {
    if (!query) return fields;
    var q = query.toLowerCase();
    return fields.filter(function (f) {
      return f.name.toLowerCase().indexOf(q) !== -1;
    });
  }

  function getOperators(fieldType) {
    return OPERATORS[fieldType] || OPERATORS.text;
  }

  function getFieldsByCategory() {
    var grouped = {};
    var order = ['time', 'meta', 'identifiers', 'content'];
    order.forEach(function (cat) { grouped[cat] = []; });
    fields.forEach(function (f) {
      if (!grouped[f.category]) grouped[f.category] = [];
      grouped[f.category].push(f);
    });
    return { order: order, groups: grouped, labels: CATEGORIES };
  }

  function getTypeMeta(type) {
    return FIELD_TYPES[type] || FIELD_TYPES.text;
  }

  global.App = global.App || {};
  global.App.fieldCatalog = {
    fields: fields,
    getByName: getByName,
    search: search,
    getOperators: getOperators,
    getFieldsByCategory: getFieldsByCategory,
    getTypeMeta: getTypeMeta,
    FIELD_TYPES: FIELD_TYPES,
    CATEGORIES: CATEGORIES
  };
})(window);

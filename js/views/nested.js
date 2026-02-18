/**
 * Nested Search Query Builder – Smart Field edition.
 * - "Nested Query" mode: paste OpenSearch JSON, convert to query string
 * - "Alert Query > By Conditions": smart field picker, operator, clause, aggregations
 * - "Alert Query > By JSON": paste raw JSON, inject time range
 */
(function () {
  'use strict';

  var fieldCatalog = null;
  var queryCompiler = null;

  function getCatalog()  { return fieldCatalog  || (fieldCatalog  = window.App.fieldCatalog); }
  function getCompiler() { return queryCompiler || (queryCompiler = window.App.queryCompiler); }

  function root(container) { return container || document; }

  function byId(id, r) {
    r = r || document;
    return r.getElementById ? r.getElementById(id) : r.querySelector('[id="' + id + '"]');
  }

  var inputCls  = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:ring-2 focus:ring-primary focus:border-primary font-mono text-sm';
  var selectCls = 'border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:ring-2 focus:ring-primary focus:border-primary text-sm bg-white';
  var labelCls  = 'block text-sm font-medium text-slate-700 mb-1';
  var btnPrimary = 'inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 text-sm font-medium transition shadow-sm';
  var btnDanger  = 'rounded-lg bg-red-600 hover:bg-red-700 text-white px-3 py-2 text-sm font-medium transition';

  // ─── Aggregation Templates ───────────────────────────────────────
  var AGG_TEMPLATES = {
    filters_by_values: {
      label: 'Filters by Values',
      icon: 'fa-filter',
      hasUI: true,
      configId: 'filtersConfig'
    },
    terms_by_field: {
      label: 'Terms by Field',
      icon: 'fa-list-ol',
      hasUI: true,
      configId: 'termsConfig'
    },
    time_comparison: {
      label: 'Time Comparison Script',
      icon: 'fa-clock',
      hasUI: true,
      configId: 'timeCompareConfig'
    }
  };

  // ─── Time Comparison Script Builder ────────────────────────────

  function buildTimeComparisonAgg(cfg) {
    var windowMs  = cfg.windowAmount * cfg.windowUnit;
    var period1Ms = cfg.period1Amount * cfg.period1Unit;
    var period2Ms = cfg.period2Amount * cfg.period2Unit;
    var minAvg    = cfg.minAvgThreshold;
    var pctTrigger = cfg.pctIncreaseTrigger;
    var zeroCap   = cfg.zeroBaselineThreshold;

    var initSrc = 'state.currentCount = 0; state.period1Count = 0; state.period2Count = 0;';

    var mapSrc = "long now = new Date().getTime();"
      + " long windowMs = " + windowMs + "L;"
      + " long period1Ms = " + period1Ms + "L;"
      + " long period2Ms = " + period2Ms + "L;"
      + " long docTime = doc['time'].value.millis;"
      + " if (docTime >= (now - windowMs) && docTime <= now) { state.currentCount++; }"
      + " else if (docTime >= (now - period1Ms - windowMs) && docTime <= (now - period1Ms)) { state.period1Count++; }"
      + " else if (docTime >= (now - period2Ms - windowMs) && docTime <= (now - period2Ms)) { state.period2Count++; }";

    var combineSrc = 'return state;';

    var reduceSrc = "long currentCount = 0; long period1Count = 0; long period2Count = 0;"
      + " for (s in states) { currentCount += s.currentCount; period1Count += s.period1Count; period2Count += s.period2Count; }"
      + " double averageOld = (period1Count + period2Count) / 2.0;"
      + " boolean trigger = false;"
      + " if (currentCount != 0) {"
      + "   if (averageOld > " + minAvg + ") {"
      + "     double percentageIncrease = ((currentCount - averageOld) / averageOld) * 100;"
      + "     trigger = percentageIncrease > " + pctTrigger + ";"
      + "   } else if (averageOld == 0 && currentCount > " + zeroCap + ") { trigger = true; }"
      + " }"
      + " if (!trigger) { return [:]; }"
      + " return [ 'currentCount': currentCount, 'period1Count': period1Count, 'period2Count': period2Count, 'averageOld': averageOld, 'compareResult': 1 ];";

    return {
      scripted_time_comparison: {
        scripted_metric: {
          init_script:    { source: initSrc,    lang: 'painless' },
          map_script:     { source: mapSrc,     lang: 'painless' },
          combine_script: { source: combineSrc, lang: 'painless' },
          reduce_script:  { source: reduceSrc,  lang: 'painless' }
        }
      }
    };
  }

  // ─── Filters by Values Builder ──────────────────────────────────

  function buildFiltersAgg(cfg) {
    var filters = {};
    (cfg.values || []).forEach(function (entry) {
      if (!entry.label || !entry.value) return;
      var clause;
      if (cfg.queryType === 'term') {
        clause = { term: {} };
        clause.term[cfg.field] = entry.value;
      } else {
        clause = { match_phrase: {} };
        clause.match_phrase[cfg.field] = { query: entry.value, slop: 0, zero_terms_query: 'NONE', boost: 1 };
      }
      filters[entry.label] = clause;
    });
    var result = {};
    result[cfg.aggName || 'by_filter'] = { filters: { filters: filters } };
    return result;
  }

  // ─── Terms by Field Builder ───────────────────────────────────

  function buildTermsAgg(cfg) {
    var termsBody = { field: cfg.field, size: cfg.size || 20 };
    if (cfg.orderKey && cfg.orderDir) {
      var order = {};
      order[cfg.orderKey] = cfg.orderDir;
      termsBody.order = order;
    }
    if (cfg.minDocCount !== undefined && cfg.minDocCount !== '') {
      termsBody.min_doc_count = parseInt(cfg.minDocCount, 10) || 1;
    }
    if (cfg.missing) {
      termsBody.missing = cfg.missing;
    }
    var result = {};
    result[cfg.aggName || 'top_values'] = { terms: termsBody };
    return result;
  }

  // ─── Field <option> helper for configurator selects ───────────

  function buildFieldOptionsHTML(filterFn) {
    var cat = getCatalog().getFieldsByCategory();
    var html = '';
    cat.order.forEach(function (catKey) {
      var group = cat.groups[catKey];
      if (!group || !group.length) return;
      var filtered = filterFn ? group.filter(filterFn) : group;
      if (!filtered.length) return;
      html += '<optgroup label="' + cat.labels[catKey] + '">';
      filtered.forEach(function (f) {
        var display = f.name;
        if (f.hasKeyword) display += '  (.keyword)';
        html += '<option value="' + f.name + '">' + display + '</option>';
      });
      html += '</optgroup>';
    });
    return html;
  }

  // ─── Smart Dropdown Builder ──────────────────────────────────────

  function buildFieldDropdownHTML() {
    var cat = getCatalog().getFieldsByCategory();
    var html = '';
    cat.order.forEach(function (catKey) {
      var group = cat.groups[catKey];
      if (!group || !group.length) return;
      html += '<div class="smart-dropdown-category">' + cat.labels[catKey] + '</div>';
      group.forEach(function (f) {
        var meta = getCatalog().getTypeMeta(f.type);
        html += '<div class="smart-dropdown-item" data-field="' + f.name + '" data-type="' + f.type + '">'
              + '<span class="field-badge field-badge-' + meta.color + '"><i class="fas ' + meta.icon + '"></i> ' + meta.label + '</span>'
              + '<span class="field-name">' + f.name + '</span>'
              + '</div>';
      });
    });
    return html;
  }

  function buildOperatorOptions(fieldType) {
    var ops = getCatalog().getOperators(fieldType);
    return ops.map(function (op) {
      return '<option value="' + op.value + '">' + op.label + '</option>';
    }).join('');
  }

  // ─── Render ──────────────────────────────────────────────────────

  var timeOptions = [
    { v: 'now-10m', l: 'Last 10 minutes' },
    { v: 'now-30m', l: 'Last 30 minutes' },
    { v: 'now-1h',  l: 'Last 1 hour' },
    { v: 'now-3h',  l: 'Last 3 hours' },
    { v: 'now-6h',  l: 'Last 6 hours' },
    { v: 'now-12h', l: 'Last 12 hours' },
    { v: 'now-1d',  l: 'Last 24 hours' },
    { v: 'now-7d',  l: 'Last 7 days' },
    { v: 'now-30d', l: 'Last 30 days' }
  ];

  function timeOptionsHTML(id) {
    return '<select class="' + selectCls + ' w-full mb-3" id="' + id + '">'
      + timeOptions.map(function (o) { return '<option value="' + o.v + '">' + o.l + '</option>'; }).join('')
      + '</select>';
  }

  function render() {
    return ''
    + '<div class="mb-6">'
    + '  <p class="' + labelCls + '">Select Query Type:</p>'
    + '  <div class="flex flex-wrap gap-4">'
    + '    <label class="flex items-center gap-2 cursor-pointer">'
    + '      <input type="radio" name="queryType" id="nestedQueryRadio" value="nested" class="rounded-full border-slate-300 text-primary focus:ring-primary">'
    + '      <span class="text-sm font-medium text-slate-700">Nested Query</span>'
    + '    </label>'
    + '    <label class="flex items-center gap-2 cursor-pointer">'
    + '      <input type="radio" name="queryType" id="alertQueryRadio" value="alert" checked class="rounded-full border-slate-300 text-primary focus:ring-primary">'
    + '      <span class="text-sm font-medium text-slate-700">Alert Query</span>'
    + '    </label>'
    + '  </div>'
    + '</div>'

    // ── Nested Query section (hidden by default) ──
    + '<div id="nestedQueryInput" class="grid lg:grid-cols-2 gap-6" style="display:none;">'
    + '  <div id="nestedJsonInputCol">'
    + '    <label for="jsonInput" class="' + labelCls + '"><i class="fas fa-search mr-1"></i> Enter OpenSearch Request:</label>'
    + '    <textarea class="' + inputCls + ' mb-3 resize-none" id="jsonInput" rows="10"></textarea>'
    + '    <div class="mt-4 pt-4 border-t border-slate-200">'
    + '      <button class="' + btnPrimary + '" type="button" id="convertJsonBtn"><i class="fas fa-magic"></i> Convert</button>'
    + '    </div>'
    + '  </div>'
    + '  <div id="nestedOutputCol">'
    + '    <label for="nestedOutput" class="' + labelCls + '"><i class="fas fa-file-alt mr-1"></i> Query Result:</label>'
    + '    <textarea class="' + inputCls + ' mb-3 resize-none bg-slate-50" id="nestedOutput" rows="10" readonly></textarea>'
    + '    <button class="' + btnPrimary + '" type="button" id="copyNestedBtn"><i class="fas fa-copy"></i> Copy Output</button>'
    + '  </div>'
    + '</div>'

    // ── Alert Query section ──
    + '<div id="alertQueryInput">'
    + '  <div class="mb-6">'
    + '    <p class="' + labelCls + '">Choose Query Method:</p>'
    + '    <div class="flex flex-wrap gap-4">'
    + '      <label class="flex items-center gap-2 cursor-pointer">'
    + '        <input type="radio" name="queryMethod" id="conditionQueryRadio" value="condition" checked class="rounded-full border-slate-300 text-primary focus:ring-primary">'
    + '        <span class="text-sm font-medium text-slate-700">By Conditions</span>'
    + '      </label>'
    + '      <label class="flex items-center gap-2 cursor-pointer">'
    + '        <input type="radio" name="queryMethod" id="jsonQueryRadio" value="json" class="rounded-full border-slate-300 text-primary focus:ring-primary">'
    + '        <span class="text-sm font-medium text-slate-700">By JSON</span>'
    + '      </label>'
    + '    </div>'
    + '  </div>'

    // ── By Conditions ──
    + '  <div id="conditionQuerySection">'
    + '    <div class="grid lg:grid-cols-2 gap-6">'
    + '      <div>'
    + '        <label class="' + labelCls + '"><i class="fas fa-clock mr-1"></i> Alert Time Frame:</label>'
    +          timeOptionsHTML('alertTimeFrame')
    + '        <div id="queryInputs" class="space-y-3"></div>'
    + '        <div class="flex flex-wrap gap-2 mt-3">'
    + '          <button class="' + btnPrimary + '" type="button" id="addQueryInputBtn"><i class="fas fa-plus"></i> Add Condition</button>'
    + '        </div>'

    // ── Aggregations panel ──
    + '        <details class="agg-panel mt-4 border border-slate-200 rounded-lg">'
    + '          <summary class="agg-panel-toggle px-4 py-2.5 text-sm font-medium text-slate-700">'
    + '            <i class="fas fa-layer-group mr-1"></i> Aggregations'
    + '          </summary>'
    + '          <div class="px-4 pb-4 pt-2">'
    + '            <p class="text-xs text-slate-500 mb-2">Insert a template, then edit the JSON below:</p>'
    + '            <div class="flex flex-wrap gap-2 mb-3" id="aggTemplateButtons"></div>'

    // ── Time Comparison Configurator (hidden until button clicked) ──
    + '            <div id="timeCompareConfig" class="hidden mb-4 p-4 bg-indigo-50 border border-indigo-200 rounded-lg">'
    + '              <div class="flex items-center justify-between mb-3">'
    + '                <h4 class="text-sm font-semibold text-indigo-900"><i class="fas fa-clock mr-1"></i> Time Comparison Config</h4>'
    + '                <button type="button" id="closeTimeCompareBtn" class="text-indigo-400 hover:text-indigo-600 text-lg leading-none">&times;</button>'
    + '              </div>'

    + '              <div class="grid grid-cols-2 gap-3 mb-3">'
    + '                <div>'
    + '                  <label class="block text-xs font-semibold text-indigo-800 mb-1">Current Window</label>'
    + '                  <div class="flex gap-1">'
    + '                    <input type="number" id="tcWindowAmt" class="' + inputCls + '" value="2" min="1" style="width:70px">'
    + '                    <select id="tcWindowUnit" class="' + selectCls + '">'
    + '                      <option value="3600000">hours</option>'
    + '                      <option value="60000">minutes</option>'
    + '                      <option value="86400000">days</option>'
    + '                    </select>'
    + '                  </div>'
    + '                  <p class="text-xs text-indigo-500 mt-0.5">The "now" measurement window</p>'
    + '                </div>'
    + '                <div>'
    + '                  <label class="block text-xs font-semibold text-indigo-800 mb-1">Compare Back #1</label>'
    + '                  <div class="flex gap-1">'
    + '                    <input type="number" id="tcPeriod1Amt" class="' + inputCls + '" value="1" min="1" style="width:70px">'
    + '                    <select id="tcPeriod1Unit" class="' + selectCls + '">'
    + '                      <option value="604800000">weeks</option>'
    + '                      <option value="86400000">days</option>'
    + '                      <option value="3600000">hours</option>'
    + '                    </select>'
    + '                  </div>'
    + '                  <p class="text-xs text-indigo-500 mt-0.5">First historical period</p>'
    + '                </div>'
    + '                <div>'
    + '                  <label class="block text-xs font-semibold text-indigo-800 mb-1">Compare Back #2</label>'
    + '                  <div class="flex gap-1">'
    + '                    <input type="number" id="tcPeriod2Amt" class="' + inputCls + '" value="2" min="1" style="width:70px">'
    + '                    <select id="tcPeriod2Unit" class="' + selectCls + '">'
    + '                      <option value="604800000">weeks</option>'
    + '                      <option value="86400000">days</option>'
    + '                      <option value="3600000">hours</option>'
    + '                    </select>'
    + '                  </div>'
    + '                  <p class="text-xs text-indigo-500 mt-0.5">Second historical period</p>'
    + '                </div>'
    + '              </div>'

    + '              <div class="border-t border-indigo-200 pt-3 mt-1 mb-3">'
    + '                <label class="block text-xs font-semibold text-indigo-800 mb-2">Trigger Thresholds</label>'
    + '                <div class="grid grid-cols-3 gap-3">'
    + '                  <div>'
    + '                    <label class="block text-xs text-indigo-600 mb-0.5">Min avg baseline</label>'
    + '                    <input type="number" id="tcMinAvg" class="' + inputCls + '" value="70" min="0">'
    + '                    <p class="text-xs text-indigo-400 mt-0.5">Ignore if avg &lt; this</p>'
    + '                  </div>'
    + '                  <div>'
    + '                    <label class="block text-xs text-indigo-600 mb-0.5">% increase trigger</label>'
    + '                    <input type="number" id="tcPctTrigger" class="' + inputCls + '" value="300" min="0">'
    + '                    <p class="text-xs text-indigo-400 mt-0.5">Alert if increase &gt; X%</p>'
    + '                  </div>'
    + '                  <div>'
    + '                    <label class="block text-xs text-indigo-600 mb-0.5">Zero-baseline cap</label>'
    + '                    <input type="number" id="tcZeroCap" class="' + inputCls + '" value="80" min="0">'
    + '                    <p class="text-xs text-indigo-400 mt-0.5">If avg=0, alert when &gt; X</p>'
    + '                  </div>'
    + '                </div>'
    + '              </div>'

    + '              <button type="button" id="generateTimeCompareBtn" class="' + btnPrimary + '"><i class="fas fa-cog"></i> Generate Script</button>'
    + '            </div>'

    // ── Filters by Values Configurator ──
    + '            <div id="filtersConfig" class="hidden mb-4 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">'
    + '              <div class="flex items-center justify-between mb-3">'
    + '                <h4 class="text-sm font-semibold text-emerald-900"><i class="fas fa-filter mr-1"></i> Filters by Values Config</h4>'
    + '                <button type="button" data-close="filtersConfig" class="agg-config-close text-emerald-400 hover:text-emerald-600 text-lg leading-none">&times;</button>'
    + '              </div>'

    + '              <div class="grid grid-cols-2 gap-3 mb-3">'
    + '                <div>'
    + '                  <label class="block text-xs font-semibold text-emerald-800 mb-1">Aggregation Name</label>'
    + '                  <input type="text" id="fbAggName" class="' + inputCls + '" value="by_filter" placeholder="by_filter">'
    + '                </div>'
    + '                <div>'
    + '                  <label class="block text-xs font-semibold text-emerald-800 mb-1">Field</label>'
    + '                  <select id="fbField" class="' + selectCls + ' w-full"></select>'
    + '                </div>'
    + '              </div>'

    + '              <div class="mb-3">'
    + '                <label class="block text-xs font-semibold text-emerald-800 mb-1">Query Type</label>'
    + '                <div class="flex gap-4">'
    + '                  <label class="flex items-center gap-1.5 cursor-pointer text-xs text-emerald-700">'
    + '                    <input type="radio" name="fbQueryType" value="match_phrase" checked class="rounded-full border-emerald-300 text-emerald-600 focus:ring-emerald-500"> match_phrase'
    + '                  </label>'
    + '                  <label class="flex items-center gap-1.5 cursor-pointer text-xs text-emerald-700">'
    + '                    <input type="radio" name="fbQueryType" value="term" class="rounded-full border-emerald-300 text-emerald-600 focus:ring-emerald-500"> term (.keyword)'
    + '                  </label>'
    + '                </div>'
    + '              </div>'

    + '              <div class="border-t border-emerald-200 pt-3 mt-1 mb-3">'
    + '                <div class="flex items-center justify-between mb-2">'
    + '                  <label class="block text-xs font-semibold text-emerald-800">Filter Values</label>'
    + '                  <button type="button" id="addFilterValueBtn" class="text-xs text-emerald-600 hover:text-emerald-800 font-semibold"><i class="fas fa-plus mr-0.5"></i> Add Row</button>'
    + '                </div>'
    + '                <div id="filterValueRows" class="space-y-2"></div>'
    + '              </div>'

    + '              <button type="button" id="generateFiltersBtn" class="' + btnPrimary + ' bg-emerald-600 hover:bg-emerald-700"><i class="fas fa-cog"></i> Generate Filters</button>'
    + '            </div>'

    // ── Terms by Field Configurator ──
    + '            <div id="termsConfig" class="hidden mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">'
    + '              <div class="flex items-center justify-between mb-3">'
    + '                <h4 class="text-sm font-semibold text-amber-900"><i class="fas fa-list-ol mr-1"></i> Terms by Field Config</h4>'
    + '                <button type="button" data-close="termsConfig" class="agg-config-close text-amber-400 hover:text-amber-600 text-lg leading-none">&times;</button>'
    + '              </div>'

    + '              <div class="grid grid-cols-2 gap-3 mb-3">'
    + '                <div>'
    + '                  <label class="block text-xs font-semibold text-amber-800 mb-1">Aggregation Name</label>'
    + '                  <input type="text" id="tbAggName" class="' + inputCls + '" value="top_values" placeholder="top_values">'
    + '                </div>'
    + '                <div>'
    + '                  <label class="block text-xs font-semibold text-amber-800 mb-1">Field</label>'
    + '                  <select id="tbField" class="' + selectCls + ' w-full"></select>'
    + '                  <p class="text-xs text-amber-500 mt-0.5">Uses .keyword subfield automatically</p>'
    + '                </div>'
    + '              </div>'

    + '              <div class="grid grid-cols-3 gap-3 mb-3">'
    + '                <div>'
    + '                  <label class="block text-xs font-semibold text-amber-800 mb-1">Size (top N)</label>'
    + '                  <input type="number" id="tbSize" class="' + inputCls + '" value="20" min="1" max="10000">'
    + '                </div>'
    + '                <div>'
    + '                  <label class="block text-xs font-semibold text-amber-800 mb-1">Order By</label>'
    + '                  <select id="tbOrderKey" class="' + selectCls + ' w-full">'
    + '                    <option value="_count">Doc count</option>'
    + '                    <option value="_key">Alphabetical</option>'
    + '                  </select>'
    + '                </div>'
    + '                <div>'
    + '                  <label class="block text-xs font-semibold text-amber-800 mb-1">Direction</label>'
    + '                  <select id="tbOrderDir" class="' + selectCls + ' w-full">'
    + '                    <option value="desc">Descending</option>'
    + '                    <option value="asc">Ascending</option>'
    + '                  </select>'
    + '                </div>'
    + '              </div>'

    + '              <div class="grid grid-cols-2 gap-3 mb-3">'
    + '                <div>'
    + '                  <label class="block text-xs font-semibold text-amber-800 mb-1">Min Doc Count</label>'
    + '                  <input type="number" id="tbMinDocCount" class="' + inputCls + '" value="1" min="0">'
    + '                  <p class="text-xs text-amber-500 mt-0.5">Exclude buckets with fewer docs</p>'
    + '                </div>'
    + '                <div>'
    + '                  <label class="block text-xs font-semibold text-amber-800 mb-1">Missing Value</label>'
    + '                  <input type="text" id="tbMissing" class="' + inputCls + '" placeholder="(optional)">'
    + '                  <p class="text-xs text-amber-500 mt-0.5">Bucket for docs missing this field</p>'
    + '                </div>'
    + '              </div>'

    + '              <button type="button" id="generateTermsBtn" class="' + btnPrimary + ' bg-amber-600 hover:bg-amber-700"><i class="fas fa-cog"></i> Generate Terms</button>'
    + '            </div>'

    + '            <textarea class="' + inputCls + ' resize-none" id="aggJsonInput" rows="6" placeholder="{}"></textarea>'
    + '          </div>'
    + '        </details>'

    + '        <div class="mt-4 pt-4 border-t border-slate-200">'
    + '          <button class="' + btnPrimary + '" type="button" id="convertAlertBtn"><i class="fas fa-magic"></i> Convert</button>'
    + '        </div>'
    + '      </div>'
    + '      <div>'
    + '        <label class="' + labelCls + '"><i class="fas fa-file-alt mr-1"></i> Query Result:</label>'
    + '        <textarea class="' + inputCls + ' mb-3 resize-none bg-slate-50" id="alertOutput" rows="18" readonly></textarea>'
    + '        <button class="' + btnPrimary + '" type="button" id="copyAlertBtn"><i class="fas fa-copy"></i> Copy Output</button>'
    + '      </div>'
    + '    </div>'
    + '  </div>'

    // ── By JSON (unchanged) ──
    + '  <div id="jsonQuerySection" style="display:none;">'
    + '    <div class="mb-4">'
    + '      <label for="alertTimeFrame2" class="' + labelCls + '"><i class="fas fa-clock mr-1"></i> Alert Time Frame:</label>'
    +        timeOptionsHTML('alertTimeFrame2')
    + '    </div>'
    + '    <div class="grid lg:grid-cols-2 gap-6">'
    + '      <div>'
    + '        <label for="jsonInput2" class="' + labelCls + '"><i class="fas fa-code mr-1"></i> Enter JSON Query:</label>'
    + '        <textarea class="' + inputCls + ' mb-3 resize-none" id="jsonInput2" rows="10"></textarea>'
    + '        <div class="mt-4 pt-4 border-t border-slate-200">'
    + '          <button class="' + btnPrimary + '" type="button" id="convertJsonQueryBtn"><i class="fas fa-magic"></i> Convert</button>'
    + '        </div>'
    + '      </div>'
    + '      <div>'
    + '        <label for="jsonOutput2" class="' + labelCls + '"><i class="fas fa-file-alt mr-1"></i> Converted Query:</label>'
    + '        <textarea class="' + inputCls + ' mb-3 resize-none bg-slate-50" id="jsonOutput2" rows="10" readonly></textarea>'
    + '        <button class="' + btnPrimary + '" type="button" id="copyJson2Btn"><i class="fas fa-copy"></i> Copy Output</button>'
    + '      </div>'
    + '    </div>'
    + '  </div>'

    + '</div>';
  }

  // ─── Condition Row (smart) ───────────────────────────────────────

  function createConditionRow(container) {
    var r = root(container);
    var queryInputs = byId('queryInputs', r);
    if (!queryInputs) return;

    var row = document.createElement('div');
    row.className = 'condition-row';

    // Clause select (must / must_not)
    var clauseWrap = document.createElement('div');
    clauseWrap.innerHTML = '<label class="' + labelCls + '">Clause</label>'
      + '<select class="' + selectCls + ' w-full clause-select">'
      + '  <option value="must">must</option>'
      + '  <option value="must_not">must_not</option>'
      + '</select>';
    row.appendChild(clauseWrap);

    // Key – smart dropdown
    var keyWrap = document.createElement('div');
    keyWrap.className = 'smart-dropdown';
    keyWrap.innerHTML = '<label class="' + labelCls + '">Key (field)</label>'
      + '<input type="text" class="' + inputCls + ' key-search-input" placeholder="Search fields..." autocomplete="off">'
      + '<div class="smart-dropdown-list">' + buildFieldDropdownHTML() + '</div>';
    row.appendChild(keyWrap);

    // Operator
    var opWrap = document.createElement('div');
    opWrap.innerHTML = '<label class="' + labelCls + '">Operator</label>'
      + '<select class="' + selectCls + ' w-full operator-select">'
      + buildOperatorOptions('text')
      + '</select>';
    row.appendChild(opWrap);

    // Value
    var valWrap = document.createElement('div');
    valWrap.className = 'value-wrap';
    valWrap.innerHTML = '<label class="' + labelCls + '">Value</label>'
      + '<input type="text" class="' + inputCls + ' value-input" placeholder="Value">';
    row.appendChild(valWrap);

    // Remove button
    var rmWrap = document.createElement('div');
    rmWrap.innerHTML = '<label class="' + labelCls + '">&nbsp;</label>'
      + '<button type="button" class="' + btnDanger + ' remove-condition-btn"><i class="fas fa-trash-alt"></i></button>';
    row.appendChild(rmWrap);

    queryInputs.appendChild(row);
    wireConditionRow(row, container);
  }

  function wireConditionRow(row) {
    var keyInput    = row.querySelector('.key-search-input');
    var dropdown    = row.querySelector('.smart-dropdown');
    var list        = row.querySelector('.smart-dropdown-list');
    var opSelect    = row.querySelector('.operator-select');
    var valWrap     = row.querySelector('.value-wrap');
    var removeBtn   = row.querySelector('.remove-condition-btn');
    var activeIndex = -1;

    // Store selected field name as data attribute
    row.dataset.selectedField = '';

    function setOperatorsForType(type) {
      opSelect.innerHTML = buildOperatorOptions(type);
      updateValueInputForOperator();
    }

    function updateValueInputForOperator() {
      var op = opSelect.value;
      if (op === 'between') {
        valWrap.innerHTML = '<label class="' + labelCls + '">Value</label>'
          + '<div class="value-between-group">'
          + '  <input type="text" class="' + inputCls + ' value-input" placeholder="From">'
          + '  <span class="text-slate-400 text-xs font-medium">to</span>'
          + '  <input type="text" class="' + inputCls + ' value-input-2" placeholder="To">'
          + '</div>';
      } else {
        valWrap.innerHTML = '<label class="' + labelCls + '">Value</label>'
          + '<input type="text" class="' + inputCls + ' value-input" placeholder="Value">';
      }
    }

    // Show / hide dropdown
    keyInput.addEventListener('focus', function () {
      dropdown.classList.add('open');
      filterDropdown();
    });

    keyInput.addEventListener('input', function () {
      dropdown.classList.add('open');
      activeIndex = -1;
      filterDropdown();
    });

    function filterDropdown() {
      var q = keyInput.value.toLowerCase();
      var items = list.querySelectorAll('.smart-dropdown-item');
      var cats  = list.querySelectorAll('.smart-dropdown-category');
      items.forEach(function (item) {
        var name = item.dataset.field || '';
        item.style.display = name.indexOf(q) !== -1 ? '' : 'none';
      });
      // Hide empty categories
      cats.forEach(function (catEl) {
        var next = catEl.nextElementSibling;
        var hasVisible = false;
        while (next && !next.classList.contains('smart-dropdown-category')) {
          if (next.style.display !== 'none') hasVisible = true;
          next = next.nextElementSibling;
        }
        catEl.style.display = hasVisible ? '' : 'none';
      });
    }

    function selectField(name) {
      keyInput.value = name;
      row.dataset.selectedField = name;
      dropdown.classList.remove('open');
      var fieldMeta = getCatalog().getByName(name);
      if (fieldMeta) setOperatorsForType(fieldMeta.type);
      var valInput = valWrap.querySelector('.value-input');
      if (valInput) valInput.focus();
    }

    // Click on item
    list.addEventListener('click', function (e) {
      var item = e.target.closest('.smart-dropdown-item');
      if (item) selectField(item.dataset.field);
    });

    // Keyboard navigation
    keyInput.addEventListener('keydown', function (e) {
      var visibleItems = Array.from(list.querySelectorAll('.smart-dropdown-item')).filter(function (it) {
        return it.style.display !== 'none';
      });
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIndex = Math.min(activeIndex + 1, visibleItems.length - 1);
        highlightItem(visibleItems);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIndex = Math.max(activeIndex - 1, 0);
        highlightItem(visibleItems);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (activeIndex >= 0 && visibleItems[activeIndex]) {
          selectField(visibleItems[activeIndex].dataset.field);
        }
      } else if (e.key === 'Escape') {
        dropdown.classList.remove('open');
      }
    });

    function highlightItem(items) {
      items.forEach(function (it, i) {
        it.classList.toggle('active', i === activeIndex);
        if (i === activeIndex) it.scrollIntoView({ block: 'nearest' });
      });
    }

    // Close on outside click
    document.addEventListener('click', function (e) {
      if (!dropdown.contains(e.target)) {
        dropdown.classList.remove('open');
      }
    });

    // Operator change
    opSelect.addEventListener('change', updateValueInputForOperator);

    // Remove
    removeBtn.addEventListener('click', function () { row.remove(); });
  }

  // ─── Read Conditions from UI ─────────────────────────────────────

  function readConditions(container) {
    var r = root(container);
    var rows = r.querySelectorAll('#queryInputs .condition-row');
    var conditions = [];
    rows.forEach(function (row) {
      var clause   = row.querySelector('.clause-select').value;
      var field    = row.dataset.selectedField || row.querySelector('.key-search-input').value.trim();
      var operator = row.querySelector('.operator-select').value;
      var valInput = row.querySelector('.value-input');
      var val2Input = row.querySelector('.value-input-2');
      var value    = valInput ? valInput.value.trim() : '';
      var value2   = val2Input ? val2Input.value.trim() : undefined;
      if (field && value) {
        conditions.push({ clause: clause, field: field, operator: operator, value: value, value2: value2 });
      }
    });
    return conditions;
  }

  // ─── Original convertJson (Nested Query mode) ───────────────────

  function convertJson(container) {
    var r = root(container);
    var inputEl  = byId('jsonInput', r);
    var outputEl = byId('nestedOutput', r);
    if (!inputEl || !outputEl) return;
    var inputJson = inputEl.value.trim();
    try {
      var input_data = JSON.parse(inputJson);
      if (!input_data.query || !input_data.query.bool) {
        outputEl.value = 'Invalid input!';
        return;
      }
      var must_not_phrases = (input_data.query.bool.must_not || []).reduce(function (acc, filter, index) {
        if (filter.match_phrase) {
          var prefix = index === 0 ? 'NOT' : 'AND NOT';
          Object.entries(filter.match_phrase).forEach(function (entry) {
            acc.push(prefix + ' ' + entry[0] + ': "' + entry[1] + '"');
          });
        }
        return acc;
      }, []);
      var other_clauses = (input_data.query.bool.filter || []).reduce(function (acc, filter) {
        if (filter.match_phrase) {
          var prefix = acc.length === 0 && must_not_phrases.length === 0 ? '' : 'AND';
          Object.entries(filter.match_phrase).forEach(function (entry) {
            acc.push(prefix + ' ' + entry[0] + ': "' + entry[1] + '"');
          });
        } else if (filter.bool && filter.bool.filter) {
          var nested_clauses = filter.bool.filter.reduce(function (na, nf) {
            if (nf.multi_match && nf.multi_match.query) na.push('"' + nf.multi_match.query + '"');
            return na;
          }, []);
          if (nested_clauses.length > 0) {
            var prefix2 = acc.length === 0 && must_not_phrases.length === 0 ? '' : 'AND';
            acc.push(prefix2 + ' ' + nested_clauses.join(' AND '));
          }
        }
        return acc;
      }, []);
      outputEl.value = (must_not_phrases.join(' ') + ' ' + other_clauses.join(' ')).trim();
    } catch (err) {
      outputEl.value = 'Invalid input!';
    }
  }

  // ─── Smart convertAlert (By Conditions) ─────────────────────────

  function convertAlert(container) {
    var r = root(container);
    var tfEl = byId('alertTimeFrame', r);
    if (!tfEl) return;
    var timeframe  = tfEl.value;
    var conditions = readConditions(container);

    var aggregations = null;
    var aggInput = byId('aggJsonInput', r);
    if (aggInput && aggInput.value.trim()) {
      try {
        aggregations = JSON.parse(aggInput.value.trim());
      } catch (e) {
        var outputEl = byId('alertOutput', r);
        if (outputEl) outputEl.value = 'Error in aggregations JSON: ' + e.message;
        return;
      }
    }

    var result   = getCompiler().compile(conditions, timeframe, aggregations);
    var outputEl = byId('alertOutput', r);
    if (outputEl) outputEl.value = JSON.stringify(result, null, 4);

  }

  // ─── Copy helper ─────────────────────────────────────────────────

  function copyOutput(container, outputId) {
    var r = root(container);
    var el = byId(outputId, r);
    if (!el) return;
    el.select();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(el.value).catch(function () { document.execCommand('copy'); });
    } else {
      document.execCommand('copy');
    }
  }

  // ─── View toggle helpers ─────────────────────────────────────────

  function handleConvertButtonClick(container) {
    var r = root(container);
    var nestedRadio  = byId('nestedQueryRadio', r);
    var alertRadio   = byId('alertQueryRadio', r);
    var nestedInput  = byId('nestedQueryInput', r);
    var alertInput   = byId('alertQueryInput', r);

    if (nestedRadio && nestedRadio.checked) {
      if (nestedInput) nestedInput.style.display = '';
      if (alertInput)  alertInput.style.display  = 'none';
    } else if (alertRadio && alertRadio.checked) {
      if (nestedInput) nestedInput.style.display = 'none';
      if (alertInput)  alertInput.style.display  = '';
      handleQueryMethodChange(container);
    }
  }

  function handleQueryMethodChange(container) {
    var r = root(container);
    var condSection = byId('conditionQuerySection', r);
    var jsonSection = byId('jsonQuerySection', r);
    var condRadio   = byId('conditionQueryRadio', r);
    if (condRadio && condRadio.checked) {
      if (condSection) condSection.style.display = 'block';
      if (jsonSection) jsonSection.style.display = 'none';
    } else {
      if (condSection) condSection.style.display = 'none';
      if (jsonSection) jsonSection.style.display = 'block';
    }
  }

  // ─── By JSON helpers (unchanged logic) ───────────────────────────

  function generateOutputJsonQuery(inputJson, alertTimeFrame) {
    var outputJson = { size: 0, query: { bool: { must: [], filter: [], must_not: [], adjust_pure_negative: true, boost: 1 } } };
    outputJson.query.bool.filter.push({
      range: { time: { from: alertTimeFrame, to: 'now', include_lower: true, include_upper: true, boost: 1 } }
    });
    if (inputJson && inputJson.query && inputJson.query.bool && inputJson.query.bool.filter) {
      var filter = inputJson.query.bool.filter.filter(function (f) { return !(f.range && f.range.time); });
      outputJson.query.bool.filter = outputJson.query.bool.filter.concat(filter);
    }
    return outputJson;
  }

  function convertJsonQuery(container) {
    var r = root(container);
    var inputEl  = byId('jsonInput2', r);
    var outputEl = byId('jsonOutput2', r);
    var tfEl     = byId('alertTimeFrame2', r);
    if (!inputEl || !outputEl) return;
    var inputJsonStr = inputEl.value.trim();
    var alertTimeFrame = tfEl ? tfEl.value : 'now-1h';
    if (!inputJsonStr) { outputEl.value = 'Error: Input JSON is empty.'; return; }
    try {
      var inputJson = JSON.parse(inputJsonStr);
      var outputJson = generateOutputJsonQuery(inputJson, alertTimeFrame);
      outputEl.value = JSON.stringify(outputJson, null, 4);
    } catch (error) {
      outputEl.value = 'Error parsing input JSON: ' + error.message;
    }
  }

  // ─── Aggregation Template Buttons ────────────────────────────────

  function mergeIntoAggInput(aggInput, newAgg) {
    var currentAgg = {};
    if (aggInput.value.trim()) {
      try { currentAgg = JSON.parse(aggInput.value.trim()); } catch (e) { currentAgg = {}; }
    }
    Object.keys(newAgg).forEach(function (k) { currentAgg[k] = newAgg[k]; });
    aggInput.value = JSON.stringify(currentAgg, null, 4);
  }

  function hideAllAggConfigs(r) {
    var ids = ['timeCompareConfig', 'filtersConfig', 'termsConfig'];
    ids.forEach(function (id) {
      var el = byId(id, r);
      if (el) el.classList.add('hidden');
    });
  }

  function addFilterValueRow(container, r) {
    var rows = byId('filterValueRows', r);
    if (!rows) return;
    var idx = rows.children.length;
    var row = document.createElement('div');
    row.className = 'flex gap-2 items-center';
    row.innerHTML = '<input type="text" class="' + inputCls + ' flex-1 fb-label" placeholder="Label (e.g. visa)" value="value_' + (idx + 1) + '">'
      + '<input type="text" class="' + inputCls + ' flex-1 fb-value" placeholder="Match value">'
      + '<button type="button" class="text-red-400 hover:text-red-600 text-sm fb-remove-row"><i class="fas fa-trash-alt"></i></button>';
    row.querySelector('.fb-remove-row').addEventListener('click', function () { row.remove(); });
    rows.appendChild(row);
  }

  function mountAggTemplateButtons(container) {
    var r = root(container);
    var btnContainer = byId('aggTemplateButtons', r);
    var aggInput     = byId('aggJsonInput', r);
    if (!btnContainer || !aggInput) return;

    // Template buttons toggle their config panel (hide others first)
    Object.keys(AGG_TEMPLATES).forEach(function (key) {
      var tmpl = AGG_TEMPLATES[key];
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'agg-template-btn';
      btn.innerHTML = '<i class="fas ' + tmpl.icon + '"></i> ' + tmpl.label;
      btn.addEventListener('click', function () {
        var panel = byId(tmpl.configId, r);
        if (!panel) return;
        var wasHidden = panel.classList.contains('hidden');
        hideAllAggConfigs(r);
        if (wasHidden) panel.classList.remove('hidden');
      });
      btnContainer.appendChild(btn);
    });

    // Close buttons (all use data-close attribute)
    r.querySelectorAll('.agg-config-close').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var target = byId(btn.getAttribute('data-close'), r);
        if (target) target.classList.add('hidden');
      });
    });
    var tcClose = byId('closeTimeCompareBtn', r);
    if (tcClose) tcClose.addEventListener('click', function () { hideAllAggConfigs(r); });

    // ── Filters by Values wiring ──
    var fbField = byId('fbField', r);
    if (fbField) {
      fbField.innerHTML = buildFieldOptionsHTML();
      if (fbField.querySelector('option')) fbField.value = fbField.querySelector('option').value;
    }
    var addFvBtn = byId('addFilterValueBtn', r);
    if (addFvBtn) addFvBtn.addEventListener('click', function () { addFilterValueRow(container, r); });
    addFilterValueRow(container, r);
    addFilterValueRow(container, r);

    var genFiltersBtn = byId('generateFiltersBtn', r);
    if (genFiltersBtn) {
      genFiltersBtn.addEventListener('click', function () {
        var fieldName = fbField ? fbField.value : 'params';
        var fieldMeta = getCatalog().getByName(fieldName);
        var qtRadio = r.querySelector('input[name="fbQueryType"]:checked');
        var queryType = qtRadio ? qtRadio.value : 'match_phrase';
        var resolvedField = fieldName;
        if (queryType === 'term' && fieldMeta && fieldMeta.hasKeyword) {
          resolvedField = fieldMeta.keywordField;
        }
        var values = [];
        var rows = byId('filterValueRows', r);
        if (rows) {
          Array.prototype.slice.call(rows.children).forEach(function (row) {
            var lbl = row.querySelector('.fb-label');
            var val = row.querySelector('.fb-value');
            if (lbl && val && val.value.trim()) {
              values.push({ label: lbl.value.trim() || val.value.trim(), value: val.value.trim() });
            }
          });
        }
        var cfg = {
          aggName: (byId('fbAggName', r) || {}).value || 'by_filter',
          field: resolvedField,
          queryType: queryType,
          values: values
        };
        mergeIntoAggInput(aggInput, buildFiltersAgg(cfg));
        hideAllAggConfigs(r);
      });
    }

    // ── Terms by Field wiring ──
    var tbField = byId('tbField', r);
    if (tbField) {
      tbField.innerHTML = buildFieldOptionsHTML();
      if (tbField.querySelector('option')) tbField.value = tbField.querySelector('option').value;
    }

    var genTermsBtn = byId('generateTermsBtn', r);
    if (genTermsBtn) {
      genTermsBtn.addEventListener('click', function () {
        var fieldName = tbField ? tbField.value : 'label';
        var fieldMeta = getCatalog().getByName(fieldName);
        var resolvedField = (fieldMeta && fieldMeta.hasKeyword) ? fieldMeta.keywordField : fieldName;
        var cfg = {
          aggName: (byId('tbAggName', r) || {}).value || 'top_values',
          field: resolvedField,
          size: parseInt((byId('tbSize', r) || {}).value, 10) || 20,
          orderKey: (byId('tbOrderKey', r) || {}).value || '_count',
          orderDir: (byId('tbOrderDir', r) || {}).value || 'desc',
          minDocCount: (byId('tbMinDocCount', r) || {}).value,
          missing: (byId('tbMissing', r) || {}).value || ''
        };
        mergeIntoAggInput(aggInput, buildTermsAgg(cfg));
        hideAllAggConfigs(r);
      });
    }

    // ── Time Comparison wiring ──
    var genTcBtn = byId('generateTimeCompareBtn', r);
    if (genTcBtn) {
      genTcBtn.addEventListener('click', function () {
        var cfg = {
          windowAmount:         parseInt(byId('tcWindowAmt', r).value, 10) || 2,
          windowUnit:           parseInt(byId('tcWindowUnit', r).value, 10) || 3600000,
          period1Amount:        parseInt(byId('tcPeriod1Amt', r).value, 10) || 1,
          period1Unit:          parseInt(byId('tcPeriod1Unit', r).value, 10) || 604800000,
          period2Amount:        parseInt(byId('tcPeriod2Amt', r).value, 10) || 2,
          period2Unit:          parseInt(byId('tcPeriod2Unit', r).value, 10) || 604800000,
          minAvgThreshold:      parseInt(byId('tcMinAvg', r).value, 10) || 70,
          pctIncreaseTrigger:   parseInt(byId('tcPctTrigger', r).value, 10) || 300,
          zeroBaselineThreshold: parseInt(byId('tcZeroCap', r).value, 10) || 80
        };
        mergeIntoAggInput(aggInput, buildTimeComparisonAgg(cfg));
        hideAllAggConfigs(r);
      });
    }
  }

  // ─── Mount ───────────────────────────────────────────────────────

  function mount(container) {
    var r = root(container);

    // Query type radios
    var nestedRadio = byId('nestedQueryRadio', r);
    var alertRadio  = byId('alertQueryRadio', r);
    if (nestedRadio) nestedRadio.addEventListener('change', function () { handleConvertButtonClick(container); });
    if (alertRadio)  alertRadio.addEventListener('change', function () { handleConvertButtonClick(container); });

    // Nested query convert + copy
    var convertJsonBtn = byId('convertJsonBtn', r);
    if (convertJsonBtn) convertJsonBtn.addEventListener('click', function () { convertJson(container); });
    var copyNestedBtn = byId('copyNestedBtn', r);
    if (copyNestedBtn) copyNestedBtn.addEventListener('click', function () { copyOutput(container, 'nestedOutput'); });

    // Add condition
    var addBtn = byId('addQueryInputBtn', r);
    if (addBtn) addBtn.addEventListener('click', function () { createConditionRow(container); });

    // Convert alert
    var convertAlertBtn = byId('convertAlertBtn', r);
    if (convertAlertBtn) convertAlertBtn.addEventListener('click', function () { convertAlert(container); });

    // Copy alert
    var copyAlertBtn = byId('copyAlertBtn', r);
    if (copyAlertBtn) copyAlertBtn.addEventListener('click', function () { copyOutput(container, 'alertOutput'); });

    // Query method radios
    var condRadio = byId('conditionQueryRadio', r);
    var jsonRadio = byId('jsonQueryRadio', r);
    if (condRadio) condRadio.addEventListener('change', function () { handleQueryMethodChange(container); });
    if (jsonRadio) jsonRadio.addEventListener('change', function () { handleQueryMethodChange(container); });

    // By JSON convert + copy
    var convertJsonQueryBtn = byId('convertJsonQueryBtn', r);
    if (convertJsonQueryBtn) convertJsonQueryBtn.addEventListener('click', function () { convertJsonQuery(container); });
    var copyJson2Btn = byId('copyJson2Btn', r);
    if (copyJson2Btn) copyJson2Btn.addEventListener('click', function () { copyOutput(container, 'jsonOutput2'); });

    // Aggregation template buttons
    mountAggTemplateButtons(container);

    // Initial state
    createConditionRow(container);
    handleConvertButtonClick(container);
  }

  // ─── Export ──────────────────────────────────────────────────────

  var nestedView = {
    route: 'nested',
    navLabel: 'Nested Search Query Builder',
    render: render,
    mount: mount
  };

  window.MonitorToolsViews = window.MonitorToolsViews || {};
  window.MonitorToolsViews.nestedView = nestedView;
})();

/**
 * Nested Search Query Builder – from Nested_Search.
 * convertJson (OpenSearch → query string), convertAlert (conditions + time frame),
 * convertJsonQuery + generateOutputJsonQuery, template clone for conditions.
 */
var dom = window.App.dom;

function root(container) {
  return container || document;
}

function byId(id, container) {
  const r = root(container);
  return r.getElementById ? r.getElementById(id) : r.querySelector('[id="' + id + '"]');
}

const inputCls = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:ring-2 focus:ring-primary focus:border-primary font-mono text-sm';
const labelCls = 'block text-sm font-medium text-slate-700 mb-1';
const btnPrimary = 'inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 text-sm font-medium transition shadow-sm';
const btnDanger = 'rounded-lg bg-red-600 hover:bg-red-700 text-white px-3 py-2 text-sm font-medium transition w-full';

function render() {
  return `
    <div class="mb-6">
      <p class="${labelCls}">Select Query Type:</p>
      <div class="flex flex-wrap gap-4">
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="radio" name="queryType" id="nestedQueryRadio" value="nested" checked class="rounded-full border-slate-300 text-primary focus:ring-primary">
          <span class="text-sm font-medium text-slate-700">Nested Query</span>
        </label>
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="radio" name="queryType" id="alertQueryRadio" value="alert" class="rounded-full border-slate-300 text-primary focus:ring-primary">
          <span class="text-sm font-medium text-slate-700">Alert Query</span>
        </label>
      </div>
    </div>

    <div id="nestedQueryInput" class="grid lg:grid-cols-2 gap-6">
      <div id="nestedJsonInputCol">
        <label for="jsonInput" class="${labelCls}"><i class="fas fa-search mr-1"></i> Enter OpenSearch Request:</label>
        <textarea class="${inputCls} mb-3 resize-none" id="jsonInput" rows="10"></textarea>
        <div class="mt-4 pt-4 border-t border-slate-200">
          <button class="${btnPrimary}" type="button" id="convertJsonBtn"><i class="fas fa-magic"></i> Convert</button>
        </div>
      </div>
      <div id="nestedOutputCol">
        <label for="nestedOutput" class="${labelCls}"><i class="fas fa-file-alt mr-1"></i> Query Result:</label>
        <textarea class="${inputCls} mb-3 resize-none bg-slate-50" id="nestedOutput" rows="10" readonly></textarea>
        <button class="${btnPrimary}" type="button" id="copyNestedBtn"><i class="fas fa-copy"></i> Copy Output</button>
      </div>
    </div>

    <div id="alertQueryInput" style="display: none;">
      <div class="mb-6">
        <p class="${labelCls}">Choose Query Method:</p>
        <div class="flex flex-wrap gap-4">
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="queryMethod" id="conditionQueryRadio" value="condition" checked class="rounded-full border-slate-300 text-primary focus:ring-primary">
            <span class="text-sm font-medium text-slate-700">By Conditions</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="queryMethod" id="jsonQueryRadio" value="json" class="rounded-full border-slate-300 text-primary focus:ring-primary">
            <span class="text-sm font-medium text-slate-700">By JSON</span>
          </label>
        </div>
      </div>

      <div id="conditionQuerySection">
        <div class="grid lg:grid-cols-2 gap-6">
          <div>
            <label for="alertTimeFrame" class="${labelCls}"><i class="fas fa-clock mr-1"></i> Alert Time Frame:</label>
            <select class="${inputCls} mb-3" id="alertTimeFrame">
              <option value="now-10m">Last 10 minutes</option>
              <option value="now-30m">Last 30 minutes</option>
              <option value="now-1h">Last 1 hour</option>
              <option value="now-3h">Last 3 hours</option>
              <option value="now-6h">Last 6 hours</option>
              <option value="now-12h">Last 12 hours</option>
              <option value="now-1d">Last 24 hours</option>
              <option value="now-7d">Last 7 days</option>
              <option value="now-30d">Last 30 days</option>
            </select>
            <div id="queryInputs" class="space-y-3"></div>
            <div class="flex flex-wrap gap-2 mt-2">
              <button class="${btnPrimary}" type="button" id="addQueryInputBtn"><i class="fas fa-plus"></i> Add Condition</button>
            </div>
            <div class="mt-4 pt-4 border-t border-slate-200">
              <button class="${btnPrimary}" type="button" id="convertAlertBtn"><i class="fas fa-magic"></i> Convert</button>
            </div>
          </div>
          <div>
            <label for="alertOutput" class="${labelCls}"><i class="fas fa-file-alt mr-1"></i> Query Result:</label>
            <textarea class="${inputCls} mb-3 resize-none bg-slate-50" id="alertOutput" rows="10" readonly></textarea>
            <button class="${btnPrimary}" type="button" id="copyAlertBtn"><i class="fas fa-copy"></i> Copy Output</button>
          </div>
        </div>
      </div>
      <div id="jsonQuerySection" style="display: none;">
        <div class="mb-4">
          <label for="alertTimeFrame2" class="${labelCls}"><i class="fas fa-clock mr-1"></i> Alert Time Frame:</label>
          <select class="${inputCls}" id="alertTimeFrame2">
            <option value="now-10m">Last 10 minutes</option>
            <option value="now-30m">Last 30 minutes</option>
            <option value="now-1h">Last 1 hour</option>
            <option value="now-3h">Last 3 hours</option>
            <option value="now-6h">Last 6 hours</option>
            <option value="now-12h">Last 12 hours</option>
            <option value="now-1d">Last 24 hours</option>
            <option value="now-7d">Last 7 days</option>
            <option value="now-30d">Last 30 days</option>
          </select>
        </div>
        <div class="grid lg:grid-cols-2 gap-6">
          <div>
            <label for="jsonInput2" class="${labelCls}"><i class="fas fa-code mr-1"></i> Enter JSON Query:</label>
            <textarea class="${inputCls} mb-3 resize-none" id="jsonInput2" rows="10"></textarea>
            <div class="mt-4 pt-4 border-t border-slate-200">
              <button class="${btnPrimary}" type="button" id="convertJsonQueryBtn"><i class="fas fa-magic"></i> Convert</button>
            </div>
          </div>
          <div>
            <label for="jsonOutput2" class="${labelCls}"><i class="fas fa-file-alt mr-1"></i> Converted Query:</label>
            <textarea class="${inputCls} mb-3 resize-none bg-slate-50" id="jsonOutput2" rows="10" readonly></textarea>
            <button class="${btnPrimary}" type="button" id="copyJson2Btn"><i class="fas fa-copy"></i> Copy Output</button>
          </div>
        </div>
      </div>
    </div>

    <template id="queryInputTemplate">
      <div class="condition-container flex flex-wrap items-end gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
        <div class="flex-1 min-w-[120px]">
          <label class="${labelCls}">Key:</label>
          <input class="${inputCls} key-input" type="text" placeholder="Key" required>
        </div>
        <div class="flex-1 min-w-[120px]">
          <label class="${labelCls}">Value:</label>
          <input class="${inputCls} value-input" type="text" placeholder="Value" required>
        </div>
        <button class="${btnDanger} remove-condition-btn shrink-0" type="button">Remove</button>
      </div>
    </template>
  `;
}

function convertJson(container) {
  const r = root(container);
  const inputEl = byId('jsonInput', r);
  const outputEl = byId('nestedOutput', r);
  if (!inputEl || !outputEl) return;
  const inputJson = inputEl.value.trim();
  try {
    const input_data = JSON.parse(inputJson);
    if (!input_data.query || !input_data.query.bool) {
      outputEl.value = 'Invalid input!';
      return;
    }
    const must_not_phrases = (input_data.query.bool.must_not || []).reduce((acc, filter, index) => {
      if (filter.match_phrase) {
        const prefix = index === 0 ? 'NOT' : 'AND NOT';
        Object.entries(filter.match_phrase).forEach(([key, value]) => {
          acc.push(`${prefix} ${key}: "${value}"`);
        });
      }
      return acc;
    }, []);
    const other_clauses = (input_data.query.bool.filter || []).reduce((acc, filter, index) => {
      if (filter.match_phrase) {
        const prefix = acc.length === 0 && must_not_phrases.length === 0 ? '' : 'AND';
        Object.entries(filter.match_phrase).forEach(([key, value]) => {
          acc.push(`${prefix} ${key}: "${value}"`);
        });
      } else if (filter.bool && filter.bool.filter) {
        const nested_clauses = filter.bool.filter.reduce((nested_acc, nested_filter) => {
          if (nested_filter.multi_match && nested_filter.multi_match.query) {
            nested_acc.push(`"${nested_filter.multi_match.query}"`);
          }
          return nested_acc;
        }, []);
        if (nested_clauses.length > 0) {
          const prefix = acc.length === 0 && must_not_phrases.length === 0 ? '' : 'AND';
          acc.push(`${prefix} ${nested_clauses.join(' AND ')}`);
        }
      }
      return acc;
    }, []);
    const output = `${must_not_phrases.join(' ')} ${other_clauses.join(' ')}`.trim();
    outputEl.value = output;
  } catch (error) {
    outputEl.value = 'Invalid input!';
  }
}

function copyOutput(container, outputId) {
  const r = root(container);
  const el = byId(outputId, r);
  if (!el) return;
  el.select();
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(el.value).catch(function () {
      document.execCommand('copy');
    });
  } else {
    document.execCommand('copy');
  }
}

function handleConvertButtonClick(container) {
  const r = root(container);
  const nestedRadio = byId('nestedQueryRadio', r);
  const alertQueryRadio = byId('alertQueryRadio', r);
  const nestedJsonInputCol = byId('nestedJsonInputCol', r);
  const nestedOutputCol = byId('nestedOutputCol', r);
  const alertQueryInput = byId('alertQueryInput', r);

  if (nestedRadio && nestedRadio.checked) {
    if (nestedJsonInputCol) nestedJsonInputCol.style.display = 'block';
    if (nestedOutputCol) nestedOutputCol.style.display = 'block';
    if (alertQueryInput) alertQueryInput.style.display = 'none';
  } else if (alertQueryRadio && alertQueryRadio.checked) {
    if (nestedJsonInputCol) nestedJsonInputCol.style.display = 'none';
    if (nestedOutputCol) nestedOutputCol.style.display = 'none';
    if (alertQueryInput) alertQueryInput.style.display = 'block';
    handleQueryMethodChange(container);
  }
}

function addQueryInput(container) {
  const r = root(container);
  const queryInputs = byId('queryInputs', r);
  const template = byId('queryInputTemplate', r);
  if (!queryInputs || !template || !template.content) return;
  const clone = template.content.cloneNode(true);
  const removeBtn = clone.querySelector('.remove-condition-btn');
  if (removeBtn) removeBtn.addEventListener('click', function () {
    const cond = removeBtn.closest('.condition-container');
    if (cond) cond.remove();
  });
  queryInputs.appendChild(clone);
}

function convertAlert(container) {
  const r = root(container);
  const alertTimeFrameEl = byId('alertTimeFrame', r);
  if (!alertTimeFrameEl) return;
  const alertTimeFrame = alertTimeFrameEl.value;
  const conditionInputs = r.querySelectorAll('#queryInputs .condition-container');
  const filterConditions = [];
  conditionInputs.forEach((conditionInput) => {
    const keyInput = conditionInput.querySelector('input[placeholder="Key"]');
    const valueInput = conditionInput.querySelector('input[placeholder="Value"]');
    if (keyInput && valueInput) {
      const key = keyInput.value.trim();
      const value = valueInput.value.trim();
      const matchPhrase = { query: value, slop: 0, zero_terms_query: 'NONE', boost: 1 };
      filterConditions.push({ match_phrase: { [key]: matchPhrase } });
    }
  });
  const timeRange = {
    range: {
      time: { from: alertTimeFrame, to: 'now', include_lower: true, include_upper: true, boost: 1 }
    }
  };
  const query = {
    size: 0,
    query: {
      bool: {
        must: [timeRange],
        filter: filterConditions,
        must_not: [],
        adjust_pure_negative: true,
        boost: 1
      }
    }
  };
  const outputEl = byId('alertOutput', r);
  if (outputEl) outputEl.value = JSON.stringify(query, null, 4);
}

function handleQueryMethodChange(container) {
  const r = root(container);
  const conditionQuerySection = byId('conditionQuerySection', r);
  const jsonQuerySection = byId('jsonQuerySection', r);
  const conditionQueryRadio = byId('conditionQueryRadio', r);
  if (conditionQueryRadio && conditionQueryRadio.checked) {
    if (conditionQuerySection) conditionQuerySection.style.display = 'block';
    if (jsonQuerySection) jsonQuerySection.style.display = 'none';
  } else {
    if (conditionQuerySection) conditionQuerySection.style.display = 'none';
    if (jsonQuerySection) jsonQuerySection.style.display = 'block';
  }
}

function generateOutputJsonQuery(inputJson, alertTimeFrame) {
  const outputJson = {
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
  const timeRange = {
    range: {
      time: { from: alertTimeFrame, to: 'now', include_lower: true, include_upper: true, boost: 1 }
    }
  };
  outputJson.query.bool.must.push(timeRange);
  if (inputJson && inputJson.query && inputJson.query.bool && inputJson.query.bool.filter) {
    const inputQuery = inputJson.query;
    const filter = inputQuery.bool.filter.filter(f => !(f.range && f.range.time));
    outputJson.query.bool.filter = outputJson.query.bool.filter.concat(filter);
  }
  return outputJson;
}

function convertJsonQuery(container) {
  const r = root(container);
  const inputEl = byId('jsonInput2', r);
  const outputEl = byId('jsonOutput2', r);
  const alertTimeFrameEl = byId('alertTimeFrame2', r);
  if (!inputEl || !outputEl) return;
  const inputJsonStr = inputEl.value.trim();
  const alertTimeFrame = alertTimeFrameEl ? alertTimeFrameEl.value : 'now-1h';
  if (!inputJsonStr) {
    outputEl.value = 'Error: Input JSON is empty.';
    return;
  }
  try {
    const inputJson = JSON.parse(inputJsonStr);
    const outputJson = generateOutputJsonQuery(inputJson, alertTimeFrame);
    outputEl.value = JSON.stringify(outputJson, null, 4);
  } catch (error) {
    outputEl.value = 'Error parsing input JSON: ' + error.message;
  }
}

function mount(container, context) {
  const r = root(container);

  const nestedRadio = byId('nestedQueryRadio', r);
  const alertRadio = byId('alertQueryRadio', r);
  nestedRadio && nestedRadio.addEventListener('change', function () { handleConvertButtonClick(container); });
  alertRadio && alertRadio.addEventListener('change', function () { handleConvertButtonClick(container); });

  const convertJsonBtn = byId('convertJsonBtn', r);
  if (convertJsonBtn) convertJsonBtn.addEventListener('click', function () { convertJson(container); });

  const copyNestedBtn = byId('copyNestedBtn', r);
  if (copyNestedBtn) copyNestedBtn.addEventListener('click', function () { copyOutput(container, 'nestedOutput'); });

  const addQueryInputBtn = byId('addQueryInputBtn', r);
  if (addQueryInputBtn) addQueryInputBtn.addEventListener('click', function () { addQueryInput(container); });

  const convertAlertBtn = byId('convertAlertBtn', r);
  if (convertAlertBtn) convertAlertBtn.addEventListener('click', function () { convertAlert(container); });

  const copyAlertBtn = byId('copyAlertBtn', r);
  if (copyAlertBtn) copyAlertBtn.addEventListener('click', function () { copyOutput(container, 'alertOutput'); });

  const conditionQueryRadio = byId('conditionQueryRadio', r);
  const jsonQueryRadio = byId('jsonQueryRadio', r);
  conditionQueryRadio && conditionQueryRadio.addEventListener('change', function () { handleQueryMethodChange(container); });
  jsonQueryRadio && jsonQueryRadio.addEventListener('change', function () { handleQueryMethodChange(container); });

  const convertJsonQueryBtn = byId('convertJsonQueryBtn', r);
  if (convertJsonQueryBtn) convertJsonQueryBtn.addEventListener('click', function () { convertJsonQuery(container); });

  const copyJson2Btn = byId('copyJson2Btn', r);
  if (copyJson2Btn) copyJson2Btn.addEventListener('click', function () { copyOutput(container, 'jsonOutput2'); });

  addQueryInput(container);
  handleConvertButtonClick(container);
}

var nestedView = {
  route: 'nested',
  navLabel: 'Nested Search Query Builder',
  render: render,
  mount: mount
};
(function () { window.MonitorToolsViews = window.MonitorToolsViews || {}; window.MonitorToolsViews.nestedView = nestedView; })();

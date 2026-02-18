/**
 * Analyze Logs – from Nested_Search analyze.js.
 * #logInput → parseLogs (hits.hits), totalHits, occurrences, label counts, details table,
 * connectors service, timing + pie charts, generated email with copy/clear.
 */
var dom = window.App.dom;

function root(container) {
  return container || document;
}

function byId(id, container) {
  const r = root(container);
  return r.getElementById ? r.getElementById(id) : r.querySelector('[id="' + id + '"]');
}

let chartTiming = null;
let chartPie = null;

function destroyCharts() {
  if (chartTiming) { chartTiming.destroy(); chartTiming = null; }
  if (chartPie) { chartPie.destroy(); chartPie = null; }
}

function render() {
  return `
    <h2 class="text-xl font-bold text-slate-800 mb-2">Log Analysis</h2>
    <p class="text-slate-600 text-sm mb-4">Paste your logs below:</p>
    <textarea id="logInput" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:ring-2 focus:ring-primary focus:border-primary font-mono text-sm resize-none" rows="15" placeholder="OpenSearch -> Get all the hits for the operation ID -> Inspect > Response -> Copy button -> Paste your logs here..."></textarea>
    <div class="mt-4 pt-4 border-t border-slate-200">
      <button class="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 text-sm font-medium transition shadow-sm" type="button" id="analyzeBtn"><i class="fas fa-chart-line"></i> Analyze Logs</button>
    </div>
    <div id="logOutput" class="mt-6">
      <pre id="analysisResults" class="text-sm text-slate-600">Results will appear here...</pre>
    </div>
    <div id="emailOutput" class="mt-6 hidden">
      <h4 class="text-lg font-semibold text-slate-800 mb-2">Generated Email:</h4>
      <pre id="generatedEmail"></pre>
    </div>
  `;
}

function parseLogs(logs) {
  try {
    const logData = JSON.parse(logs);
    return logData.hits ? (logData.hits.hits || []) : [];
  } catch (e) {
    console.error('Failed to parse logs as JSON:', e);
    return [];
  }
}

function extractDetails(hit) {
  return {
    label: hit._source.label || 'N/A',
    level: hit._source.level || 'N/A',
    message: hit._source.message || 'N/A',
    time: hit._source.time || 'N/A',
    params: hit._source.params ? JSON.stringify(hit._source.params, null, 2) : 'N/A'
  };
}

function fullLogHtml(hit) {
  const s = hit._source || {};
  const time = dom.escapeHtml(s.time || 'N/A');
  const label = dom.escapeHtml(s.label || 'N/A');
  const level = dom.escapeHtml(s.level || 'N/A');
  const message = dom.escapeHtml(s.message || 'N/A');
  const params = dom.escapeHtml(s.params != null ? (typeof s.params === 'string' ? s.params : JSON.stringify(s.params, null, 2)) : 'N/A');
  return '<div class="full-log-details text-xs border-t border-slate-200 mt-2 pt-2 space-y-1">' +
    '<div><strong class="text-slate-500">Time:</strong> ' + time + '</div>' +
    '<div><strong class="text-slate-500">Label:</strong> ' + label + '</div>' +
    '<div><strong class="text-slate-500">Level:</strong> ' + level + '</div>' +
    '<div><strong class="text-slate-500">Message:</strong> ' + message + '</div>' +
    '<div><strong class="text-slate-500">Params:</strong><pre class="mt-1 p-2 rounded bg-slate-100 overflow-x-auto text-xs">' + params + '</pre></div>' +
    '</div>';
}

const fieldIcons = {
  payment_token: 'fas fa-credit-card',
  payment_original_amount: 'fas fa-dollar-sign',
  payment_currency_code: 'fas fa-money-bill',
  payment_failure_code: 'fas fa-exclamation-triangle',
  payment_failure_message: 'fas fa-comment-dots',
  payment_method_type_type: 'fas fa-credit-card',
  reference_id: 'fas fa-id-badge',
  gateway: 'fas fa-network-wired',
  payout_token: 'fas fa-credit-card',
  payout_original_amount: 'fas fa-dollar-sign',
  payout_currency_code: 'fas fa-money-bill',
  payout_failure_code: 'fas fa-exclamation-triangle',
  payout_failure_message: 'fas fa-comment-dots',
  payout_method_type_type: 'fas fa-credit-card',
  quarantined_item_id: 'fas fa-shield-alt'
};

const fieldPatterns = {
  payment_token: /payment_token:\s*'([^']*)'/,
  payment_original_amount: /payment_original_amount:\s*'([^']*)'/,
  payment_currency_code: /payment_currency_code:\s*'([^']*)'/,
  payment_failure_code: /payment_failure_code:\s*'([^']*)'/,
  payment_failure_message: /payment_failure_message:\s*'([^']*)'/,
  payment_method_type_type: /payment_method_type_type:\s*'([^']*)'/,
  reference_id: /reference_id:\s*'([^']*)'/,
  gateway: /gc_type:\s*'([^']*)'/,
  payout_token: /payout_token:\s*'([^']*)'/,
  payout_original_amount: /payout_original_amount:\s*'([^']*)'/,
  payout_currency_code: /payout_currency_code:\s*'([^']*)'/,
  payout_failure_code: /payout_failure_code:\s*'([^']*)'/,
  payout_failure_message: /payout_failure_message:\s*'([^']*)'/,
  payout_method_type_type: /payout_method_type_type:\s*'([^']*)'/,
  quarantined_item_id: /quarantined_item_id:\s*'([^']*)'/
};

function extractUniqueDetails(hits) {
  const uniqueDetails = {};
  hits.forEach((hit) => {
    const source = hit._source;
    if (source.params != null) {
      const paramsStr = typeof source.params === 'string' ? source.params : JSON.stringify(source.params);
      Object.keys(fieldPatterns).forEach((fieldName) => {
        const pattern = fieldPatterns[fieldName];
        const match = paramsStr.match(pattern);
        if (match && match[1]) {
          const normalizedValue = match[1].trim();
          if (!uniqueDetails[fieldName]) {
            uniqueDetails[fieldName] = normalizedValue;
          }
        }
      });
    }
  });
  return uniqueDetails;
}

function extractConnectorsServiceDetails(hits) {
  const uriOrUrlPattern = /https?:\/\/[^\s]+/i;
  const httpMethodPattern = /method:\s*'(POST|GET|PUT|DELETE|PATCH|OPTIONS|HEAD)'/i;
  const details = [];
  hits.forEach(hit => {
    const source = hit._source;
    if (!/.*_connectors_service/.test(source.label)) return;
    const message = source.message || '';
    const params = (source.params != null ? String(source.params) : '');
    const hasUri = uriOrUrlPattern.test(params);
    const hasMethod = httpMethodPattern.test(params);
    if ((/options_data/.test(message) || /input/.test(message)) && hasUri && hasMethod) {
      details.push({ label: source.label || 'N/A', level: source.level || 'N/A', message, time: source.time || 'N/A', params: 'Request: ' + params, type: 'request' });
    }
    if ((/makeRawRequest/.test(message) || /makeCustomRequest/.test(message)) && (/error/.test(message) || (/response/.test(message) && !/resolve_with_full_response/.test(message)))) {
      details.push({ label: source.label || 'N/A', level: source.level || 'N/A', message, time: source.time || 'N/A', params: 'Response: ' + params, type: 'response' });
    }
  });
  return details;
}

function contextLogBlock(hit, labelText) {
  const s = hit._source || {};
  const time = dom.escapeHtml(s.time || 'N/A');
  const service = dom.escapeHtml(s.label || 'N/A');
  const msg = dom.escapeHtml((s.message || '').slice(0, 80)) + ((s.message || '').length > 80 ? '…' : '');
  return '<details class="context-log-block mt-3 rounded-xl border-2 border-slate-200 bg-slate-50 overflow-hidden">' +
    '<summary class="cursor-pointer px-4 py-2 text-sm flex items-center gap-2 list-none [&::-webkit-details-marker]:hidden hover:bg-slate-100">' +
    '<span class="font-medium text-slate-600">' + dom.escapeHtml(labelText) + '</span>' +
    '<span class="font-mono text-slate-500 text-xs">' + time + '</span>' +
    '<span class="rounded-full bg-slate-200 text-slate-800 px-2 py-0.5 text-xs">' + service + '</span>' +
    '<span class="text-slate-600 truncate flex-1 min-w-0">' + msg + '</span>' +
    '<span class="text-slate-400 text-xs">Click for full log</span>' +
    '</summary><div class="px-4 pb-4">' + fullLogHtml(hit) + '</div></details>';
}

function generateOccurrenceHtml(index, details, hit, sortedHits) {
  const key = (h) => (h._source.label || '') + '|' + (h._source.timestamp || 0) + '|' + (h._source.message || '').slice(0, 80);
  const hitKey = key(hit);
  const idx = sortedHits.findIndex((h) => key(h) === hitKey);
  const prevHtml = idx > 0 ? contextLogBlock(sortedHits[idx - 1], 'Previous log') : '';
  const nextHtml = idx >= 0 && idx < sortedHits.length - 1 ? contextLogBlock(sortedHits[idx + 1], 'Next log') : '';
  return `
    <div class="occurrence-card rounded-xl border-2 border-red-200 bg-white shadow-sm mb-4 overflow-hidden">
      ${prevHtml ? '<div class="px-0 pt-0">' + prevHtml + '</div>' : ''}
      <div class="bg-red-600 text-white px-4 py-2 flex items-center justify-between">
        <h5 class="font-semibold text-sm m-0"><i class="fas fa-exclamation-triangle mr-1"></i>Occurrence ${index + 1}</h5>
        <span class="text-sm opacity-90">${dom.escapeHtml(details.time)}</span>
      </div>
      <div class="p-4">
        <div class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 mb-2 text-sm">
          <span class="font-medium text-slate-600">Label:</span>
          <span class="rounded-full bg-slate-200 text-slate-800 px-2 py-0.5 text-xs">${dom.escapeHtml(details.label)}</span>
        </div>
        <div class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 mb-2 text-sm">
          <span class="font-medium text-slate-600">Level:</span>
          <span class="rounded-full bg-amber-200 text-amber-900 px-2 py-0.5 text-xs">${dom.escapeHtml(details.level)}</span>
        </div>
        <div class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 mb-2 text-sm">
          <span class="font-medium text-slate-600">Message:</span>
          <span class="text-slate-800">${dom.escapeHtml(details.message)}</span>
        </div>
        <div class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 mb-2 text-sm">
          <span class="font-medium text-slate-600">Time:</span>
          <span class="text-slate-800">${dom.escapeHtml(details.time)}</span>
        </div>
        <details class="mt-3">
          <summary class="cursor-pointer inline-flex items-center gap-1 rounded-lg bg-slate-200 text-slate-800 px-3 py-1.5 text-sm font-medium hover:bg-slate-300"><i class="fas fa-expand-alt mr-1"></i>Full log</summary>
          <div class="mt-2">${fullLogHtml(hit)}</div>
        </details>
      </div>
      ${nextHtml ? '<div class="px-0 pb-0">' + nextHtml + '</div>' : ''}
    </div>`;
}

function generateDetailsTable(uniqueDetails) {
  let html = '<table class="w-full border-collapse border border-slate-300"><thead><tr class="bg-slate-100"><th class="border border-slate-300 px-3 py-2 text-left text-sm font-semibold">Field</th><th class="border border-slate-300 px-3 py-2 text-left text-sm font-semibold">Value</th></tr></thead><tbody>';
  Object.keys(uniqueDetails).forEach(field => {
    const icon = fieldIcons[field] || 'fas fa-question-circle';
    html += '<tr class="odd:bg-slate-50"><td class="border border-slate-300 px-3 py-2 text-sm"><i class="' + icon + ' mr-1"></i>' + field.replace(/_/g, ' ').toUpperCase() + '</td><td class="border border-slate-300 px-3 py-2 text-sm">' + dom.escapeHtml(uniqueDetails[field]) + '</td></tr>';
  });
  html += '</tbody></table>';
  return html;
}

/** Build timeline events: errors/warnings + first/last per label + prev/next around each error/warning, sorted by time */
function buildTimelineEvents(hits) {
  const byTime = [...hits].sort((a, b) => (a._source.timestamp || 0) - (b._source.timestamp || 0));
  const seen = new Set();
  const key = (h) => (h._source.label || '') + '|' + (h._source.timestamp || 0) + '|' + (h._source.message || '').slice(0, 80);
  const events = [];
  byTime.forEach((hit) => {
    const level = (hit._source.level || '').toLowerCase();
    const isErrorOrWarn = level === 'error' || level === 'warning';
    const id = key(hit);
    if (isErrorOrWarn) {
      if (!seen.has(id)) { seen.add(id); events.push({ hit, type: level }); }
    }
  });
  const firstLastByLabel = {};
  byTime.forEach((hit) => {
    const label = hit._source.label || 'N/A';
    if (!firstLastByLabel[label]) firstLastByLabel[label] = { first: hit, last: hit };
    else firstLastByLabel[label].last = hit;
  });
  Object.values(firstLastByLabel).forEach(({ first, last }) => {
    [first, last].forEach((h) => {
      const id = key(h);
      if (!seen.has(id)) { seen.add(id); events.push({ hit: h, type: 'info' }); }
    });
  });
  /* Add previous and next log around each error/warning */
  events.forEach((ev) => {
    if (ev.type !== 'error' && ev.type !== 'warning') return;
    const idx = byTime.findIndex((h) => key(h) === key(ev.hit));
    if (idx < 0) return;
    if (idx > 0) {
      const prev = byTime[idx - 1];
      const prevId = key(prev);
      if (!seen.has(prevId)) { seen.add(prevId); events.push({ hit: prev, type: 'context' }); }
    }
    if (idx < byTime.length - 1) {
      const next = byTime[idx + 1];
      const nextId = key(next);
      if (!seen.has(nextId)) { seen.add(nextId); events.push({ hit: next, type: 'context' }); }
    }
  });
  return events.sort((a, b) => (a.hit._source.timestamp || 0) - (b.hit._source.timestamp || 0));
}

function generateTimelineHtml(hits) {
  const events = buildTimelineEvents(hits);
  if (events.length === 0) return '<p class="text-slate-600 text-sm">No timeline events.</p>';
  let html = '<div class="log-timeline relative pl-6 border-l-2 border-slate-200 border-solid">';
  events.forEach((ev) => {
    const s = ev.hit._source;
    const time = s.time || 'N/A';
    const label = dom.escapeHtml(s.label || 'N/A');
    const msg = dom.escapeHtml((s.message || '').slice(0, 120)) + ((s.message || '').length > 120 ? '…' : '');
    const isError = ev.type === 'error';
    const isWarn = ev.type === 'warning';
    const isContext = ev.type === 'context';
    const dotClass = isError ? 'bg-red-500 ring-red-200' : isWarn ? 'bg-amber-500 ring-amber-200' : isContext ? 'bg-slate-300 ring-slate-200' : 'bg-slate-400 ring-slate-200';
    const cardClass = isError ? 'border-red-200 bg-red-50' : isWarn ? 'border-amber-200 bg-amber-50' : isContext ? 'border-slate-200 bg-slate-50' : 'border-slate-200 bg-white';
    html += '<div class="log-timeline-item relative mb-2">';
    html += '<span class="absolute -left-6 top-1.5 w-2.5 h-2.5 rounded-full ring-2 ' + dotClass + '" title="' + ev.type + '"></span>';
    html += '<details class="log-timeline-details rounded border shadow-sm ' + cardClass + '">';
    html += '<summary class="cursor-pointer p-2 list-none flex flex-wrap items-center gap-2 [&::-webkit-details-marker]:hidden">';
    html += '<span class="text-xs font-mono text-slate-500">' + dom.escapeHtml(time) + '</span>';
    html += '<span class="rounded-full bg-slate-200 text-slate-800 px-2 py-0.5 text-xs font-medium">' + label + '</span>';
    if (isError) html += '<span class="rounded-full bg-red-600 text-white px-2 py-0.5 text-xs font-medium"><i class="fas fa-times-circle mr-1"></i>Error</span>';
    else if (isWarn) html += '<span class="rounded-full bg-amber-600 text-white px-2 py-0.5 text-xs font-medium"><i class="fas fa-exclamation-triangle mr-1"></i>Warning</span>';
    else if (isContext) html += '<span class="rounded-full bg-slate-300 text-slate-700 px-2 py-0.5 text-xs font-medium">Context</span>';
    html += '<span class="text-sm text-slate-700 break-words flex-1 min-w-0">' + msg + '</span>';
    html += '<span class="text-slate-400 text-xs">Click to expand</span>';
    html += '</summary>';
    html += '<div class="px-2 pb-2">' + fullLogHtml(ev.hit) + '</div>';
    html += '</details></div>';
  });
  html += '</div>';
  return html;
}

function generateConnectorsServiceHtml(details) {
  let html = '<h3 class="mt-6 text-base font-semibold text-slate-800 mb-2">Connectors Service Details</h3>';
  details.forEach((detail, index) => {
    const icon = detail.type === 'request' ? '<i class="fas fa-sign-in-alt mr-1"></i>' : '<i class="fas fa-sign-out-alt mr-1"></i>';
    const typeLabel = detail.type.charAt(0).toUpperCase() + detail.type.slice(1);
    html += '<div class="rounded-xl border-2 border-indigo-200 bg-white shadow-sm mb-4 overflow-hidden"><div class="bg-indigo-600 text-white px-4 py-2"><h5 class="font-semibold text-sm m-0">' + icon + typeLabel + ' ' + (index + 1) + ' <i class="fas fa-exclamation-triangle ml-1"></i></h5></div><div class="p-4"><div class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 mb-2 text-sm"><span class="font-medium text-slate-600">Label:</span><span class="rounded-full bg-slate-200 text-slate-800 px-2 py-0.5 text-xs">' + dom.escapeHtml(detail.label) + '</span></div><div class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 mb-2 text-sm"><span class="font-medium text-slate-600">Level:</span><span class="rounded-full bg-amber-200 text-amber-900 px-2 py-0.5 text-xs">' + dom.escapeHtml(detail.level) + '</span></div><div class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 mb-2 text-sm"><span class="font-medium text-slate-600">Message:</span><span class="text-slate-800">' + dom.escapeHtml(detail.message) + '</span></div><div class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 mb-2 text-sm"><span class="font-medium text-slate-600">Time:</span><span class="text-slate-800">' + dom.escapeHtml(detail.time) + '</span></div><details class="mt-3"><summary class="cursor-pointer inline-flex items-center gap-1 rounded-lg bg-red-100 text-red-800 px-3 py-1.5 text-sm font-medium hover:bg-red-200"><i class="fas fa-cogs"></i> Show Params</summary><pre class="mt-2 p-3 rounded-lg bg-slate-100 text-xs overflow-x-auto"><code>' + dom.escapeHtml(detail.params) + '</code></pre></details></div></div>';
  });
  return html;
}

function generateEmailContent(container, uniqueDetails) {
  let emailBody = 'Dear Team,\n\nPlease provide help regarding the following details:\n';
  if (uniqueDetails.gateway) emailBody += '- Gateway: ' + uniqueDetails.gateway + '\n';
  if (uniqueDetails.payment_token) emailBody += '- Payment Token: ' + uniqueDetails.payment_token + '\n';
  if (uniqueDetails.payment_original_amount) emailBody += '- Payment Original Amount: ' + uniqueDetails.payment_original_amount + '\n';
  if (uniqueDetails.payment_currency_code) emailBody += '- Currency Code: ' + uniqueDetails.payment_currency_code + '\n';
  if (uniqueDetails.payout_token) emailBody += '- Payout Token: ' + uniqueDetails.payout_token + '\n';
  if (uniqueDetails.payout_original_amount) emailBody += '- Payout Original Amount: ' + uniqueDetails.payout_original_amount + '\n';
  if (uniqueDetails.payout_currency_code) emailBody += '- Payout Currency Code: ' + uniqueDetails.payout_currency_code + '\n';
  if (uniqueDetails.quarantined_item_id) emailBody += '- Quarantined Item ID: ' + uniqueDetails.quarantined_item_id + '\n';
  emailBody += '\nThank you for your assistance!';

  const emailOutputEl = document.getElementById('emailOutput');
  if (!emailOutputEl) return;
  emailOutputEl.innerHTML = '<div class="email-content"><strong class="text-slate-800">Email to Team:</strong><pre id="emailContent" class="border border-slate-300 rounded-lg p-4 bg-slate-50 mt-2 text-sm whitespace-pre-wrap">' + dom.escapeHtml(emailBody) + '</pre><button type="button" id="copyEmailBtn" class="mt-2 rounded-lg bg-green-600 hover:bg-green-700 text-white px-4 py-2 text-sm font-medium">Copy to Clipboard</button><button type="button" id="clearEmailBtn" class="mt-2 ml-2 rounded-lg bg-red-600 hover:bg-red-700 text-white px-4 py-2 text-sm font-medium">Clear</button><div id="copyFeedback" class="mt-2 text-green-600 text-sm hidden">Email content copied to clipboard!</div></div>';
  emailOutputEl.classList.remove('hidden');

  const copyBtn = document.getElementById('copyEmailBtn');
  const clearBtn = document.getElementById('clearEmailBtn');
  const feedback = document.getElementById('copyFeedback');
  if (copyBtn) {
    copyBtn.addEventListener('click', function () {
      const pre = document.getElementById('emailContent');
      const text = pre ? pre.innerText : '';
      dom.copyToClipboard(text).then(ok => {
        if (feedback) feedback.style.display = ok ? 'block' : 'none';
        setTimeout(() => { if (feedback) feedback.style.display = 'none'; }, 3000);
      });
    });
  }
  if (clearBtn) {
    clearBtn.addEventListener('click', function () {
      emailOutputEl.classList.add('hidden');
      emailOutputEl.innerHTML = '<h4 class="text-lg font-semibold text-slate-800 mb-2">Generated Email:</h4><pre id="generatedEmail"></pre>';
    });
  }
}

function runAnalysis(container) {
  const r = root(container);
  const logsEl = byId('logInput', r);
  const resultsEl = byId('analysisResults', r);
  const canvasPlaceholder = byId('canvasPlaceholder', r);
  if (!logsEl || !resultsEl) return;
  const logs = logsEl.value;

  resultsEl.innerHTML = '<div class="text-center py-8"><p class="text-slate-600"><i class="fas fa-spinner fa-spin mr-2"></i>Analyzing logs, please wait...</p></div>';

  const totalHitsPattern = /"hits":\s*{[^}]*"total":\s*(\d+)/;
  const totalHitsMatch = logs.match(totalHitsPattern);
  const totalHits = totalHitsMatch ? totalHitsMatch[1] : 'Not found';

  const hits = parseLogs(logs);
  let results = '<div class="analyze-results-wrapper rounded-xl bg-slate-100/80 border border-slate-200 p-4">';
  results += '<h2 class="text-lg font-bold text-slate-800 mb-3"><i class="fas fa-chart-line mr-2"></i>Log Analysis Results</h2>';

  results += '<details class="analyze-section analyze-section-timeline mb-3 rounded-xl border border-slate-200 shadow-sm overflow-hidden" open>';
  results += '<summary class="analyze-section-summary cursor-pointer px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 font-semibold text-slate-800 flex items-center gap-2"><i class="fas fa-stream"></i> Log flow timeline</summary>';
  results += '<div class="p-2 border-t border-slate-200 bg-slate-50/50">';
  results += '<div class="timeline-header flex flex-wrap items-center gap-x-3 gap-y-1 mb-2">';
  results += '<span class="rounded bg-indigo-100 border border-indigo-200 px-2 py-1 text-slate-800 text-sm font-medium"><i class="fas fa-tachometer-alt mr-1"></i>Total Hits: ' + totalHits + '</span>';
  results += '<span class="text-xs text-slate-500">Shown: all errors &amp; warnings (with previous and next log), plus first/last log per service, in chronological order. Click any entry for full log.</span>';
  results += '</div>';
  results += '<div class="log-timeline-wrapper overflow-y-auto">' + generateTimelineHtml(hits) + '</div>';
  results += '</div></details>';

  results += '<details class="analyze-section mb-3 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden" open>';
  results += '<summary class="analyze-section-summary cursor-pointer px-4 py-2.5 bg-slate-50 hover:bg-slate-100 font-semibold text-slate-800 flex items-center gap-2"><i class="fas fa-chart-bar"></i> Charts</summary>';
  results += '<div class="p-3 border-t border-slate-200 bg-slate-50/30"><div class="grid grid-cols-1 md:grid-cols-2 gap-3" id="canvasPlaceholder"></div></div>';
  results += '</details>';

  const sortedHits = [...hits].sort((a, b) => (a._source.timestamp || 0) - (b._source.timestamp || 0));
  let occurrencesHtml = '';
  let occurrenceIndex = 0;
  hits.forEach(hit => {
    const source = hit._source;
    if (source.level === 'error' || source.level === 'warning') {
      occurrencesHtml += generateOccurrenceHtml(occurrenceIndex++, extractDetails(hit), hit, sortedHits);
    }
  });

  const labelPattern = /"label":\s*"([^"]+)"/gi;
  const labelCounts = {};
  hits.forEach(hit => {
    const logEntry = JSON.stringify(hit._source);
    let labelMatch;
    while ((labelMatch = labelPattern.exec(logEntry)) !== null) {
      const label = labelMatch[1];
      labelCounts[label] = (labelCounts[label] || 0) + 1;
    }
  });
  const sortedLabels = Object.entries(labelCounts).sort((a, b) => b[1] - a[1]);
  let labelListHtml = '<ul class="space-y-2">';
  sortedLabels.forEach(([label, count]) => {
    labelListHtml += '<li class="flex justify-between items-center py-2 px-3 rounded-lg bg-slate-50 border border-slate-200"><span class="text-sm font-medium text-slate-700">' + dom.escapeHtml(label) + '</span> <span class="rounded-full bg-indigo-600 text-white text-xs font-medium px-2 py-0.5">' + count + '</span></li>';
  });
  labelListHtml += '</ul>';
  results += '<details class="analyze-section mb-3 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">';
  results += '<summary class="analyze-section-summary cursor-pointer px-4 py-2.5 bg-slate-50 hover:bg-slate-100 font-semibold text-slate-800 flex items-center gap-2"><i class="fas fa-tag mr-1"></i>Label Counts <span class="rounded-full bg-slate-200 text-slate-700 text-xs px-2 py-0.5">' + sortedLabels.length + '</span></summary>';
  results += '<div class="p-3 border-t border-slate-200 bg-slate-50/30">' + labelListHtml + '</div></details>';

  const uniqueDetails = extractUniqueDetails(hits);
  if (Object.keys(uniqueDetails).length > 0) {
    results += '<details class="analyze-section mb-3 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden" open>';
    results += '<summary class="analyze-section-summary cursor-pointer px-4 py-2.5 bg-slate-50 hover:bg-slate-100 font-semibold text-slate-800 flex items-center gap-2"><i class="fas fa-info-circle mr-1"></i>Important Details</summary>';
    results += '<div class="p-3 border-t border-slate-200 bg-slate-50/30">' + generateDetailsTable(uniqueDetails) + '</div></details>';
  }
  const connectorsDetails = extractConnectorsServiceDetails(hits);
  if (connectorsDetails.length > 0) {
    results += '<details class="analyze-section mb-3 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">';
    results += '<summary class="analyze-section-summary cursor-pointer px-4 py-2.5 bg-slate-50 hover:bg-slate-100 font-semibold text-slate-800 flex items-center gap-2">Connectors Service Details <span class="rounded-full bg-indigo-100 text-indigo-800 text-xs px-2 py-0.5">' + connectorsDetails.length + '</span></summary>';
    results += '<div class="p-3 border-t border-slate-200 bg-slate-50/30">' + generateConnectorsServiceHtml(connectorsDetails).replace('<h3 class="mt-6 text-base font-semibold text-slate-800 mb-2">Connectors Service Details</h3>', '') + '</div></details>';
  }

  results += '<details class="analyze-section analyze-section-errors mb-3 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden" open>';
  results += '<summary class="analyze-section-summary cursor-pointer px-4 py-2.5 bg-slate-50 hover:bg-slate-100 font-semibold text-slate-800 flex items-center gap-2"><i class="fas fa-exclamation-triangle text-red-600"></i> Errors &amp; warnings' + (occurrenceIndex > 0 ? ' <span class="rounded-full bg-red-100 text-red-800 text-xs px-2 py-0.5">' + occurrenceIndex + '</span>' : '') + '</summary>';
  results += '<div class="p-3 border-t border-slate-200 bg-slate-50/30 errors-section-body">' + (occurrencesHtml || '<div class="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-slate-800 text-sm"><i class="fas fa-check-circle mr-2 text-green-600"></i>No significant issues detected.</div>') + '</div></details>';

  results += '</div>';
  resultsEl.innerHTML = results;

  const placeholder = document.getElementById('canvasPlaceholder');
  if (placeholder) placeholder.innerHTML = '';

  destroyCharts();
  const timingData = hits.map((hit) => new Date(hit._source.time).getTime()).filter((t) => !isNaN(t));
  if (timingData.length > 0 && typeof window.Chart !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.id = 'timingChart';
    const col = document.createElement('div');
    col.className = 'mb-4 h-[300px]';
    col.style.maxWidth = '50%';
    col.style.height = '300px';
    col.appendChild(canvas);
    if (placeholder) placeholder.appendChild(col);
    const minTime = Math.min(...timingData);
    const maxTime = Math.max(...timingData);
    const interval = 60 * 1000;
    const histogramData = [];
    for (let start = minTime; start <= maxTime; start += interval) {
      const end = start + interval;
      histogramData.push({ interval: new Date(start).toLocaleTimeString(), count: timingData.filter((t) => t >= start && t < end).length });
    }
    chartTiming = new window.Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels: histogramData.map((d) => d.interval),
        datasets: [{ label: 'Number of Hits', data: histogramData.map((d) => d.count), backgroundColor: 'rgba(75, 192, 192, 0.2)', borderColor: 'rgba(75, 192, 192, 1)', borderWidth: 1 }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { x: { ticks: { autoSkip: true, maxTicksLimit: 20 } }, y: { beginAtZero: true, title: { display: true, text: 'Number of Hits' } } },
        plugins: { legend: { display: true, position: 'top' } }
      }
    });
  }

  const logLevels = hits.map((hit) => hit._source.level || 'N/A');
  const levelCounts = logLevels.reduce((acc, level) => { acc[level] = (acc[level] || 0) + 1; return acc; }, {});
  const levelLabels = Object.keys(levelCounts);
  const levelData = Object.values(levelCounts);
  if (levelLabels.length > 0 && typeof window.Chart !== 'undefined') {
    const pieCanvas = document.createElement('canvas');
    pieCanvas.id = 'logLevelPieChart';
    const pieCol = document.createElement('div');
    pieCol.className = 'mb-4 h-[300px]';
    pieCol.style.maxWidth = '50%';
    pieCol.style.height = '300px';
    pieCol.appendChild(pieCanvas);
    if (placeholder) placeholder.appendChild(pieCol);
    chartPie = new window.Chart(pieCanvas.getContext('2d'), {
      type: 'pie',
      data: {
        labels: levelLabels,
        datasets: [{
          label: 'Log Level Distribution',
          data: levelData,
          backgroundColor: ['rgba(75, 192, 192, 0.2)', 'rgba(153, 102, 255, 0.2)', 'rgba(255, 159, 64, 0.2)', 'rgba(255, 99, 132, 0.2)'],
          borderColor: ['rgba(75, 192, 192, 1)', 'rgba(153, 102, 255, 1)', 'rgba(255, 159, 64, 1)', 'rgba(255, 99, 132, 1)'],
          borderWidth: 1
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, position: 'top' } } }
    });
  }

  generateEmailContent(container, uniqueDetails);
}

function mount(container) {
  const r = root(container);
  const btn = byId('analyzeBtn', r);
  if (btn) btn.addEventListener('click', function () { runAnalysis(container); });
}

function unmount() {
  destroyCharts();
}

var analyzeView = {
  route: 'analyze',
  navLabel: 'Analyze Logs',
  render: render,
  mount: mount,
  unmount: unmount
};
(function () { window.MonitorToolsViews = window.MonitorToolsViews || {}; window.MonitorToolsViews.analyzeView = analyzeView; })();

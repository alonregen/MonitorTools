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
      <button class="inline-flex items-center gap-2 rounded-lg bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 text-sm font-medium transition shadow-sm ml-2" type="button" id="clearBtn"><i class="fas fa-trash-alt"></i> Clear</button>
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

var paymentFields = [
  'payment_token', 'payment_original_amount', 'payment_currency_code',
  'payment_failure_code', 'payment_failure_message', 'payment_method_type_type'
];
var payoutFields = [
  'payout_token', 'payout_original_amount', 'payout_currency_code',
  'payout_failure_code', 'payout_failure_message', 'payout_method_type_type'
];
var sharedFields = ['reference_id', 'gateway', 'quarantined_item_id'];
var allDetailFields = paymentFields.concat(payoutFields).concat(sharedFields);

function getVisibleFields(uniqueDetails) {
  var hasPayment = !!uniqueDetails.payment_token;
  var hasPayout = !!uniqueDetails.payout_token;
  if (hasPayment && hasPayout) return allDetailFields;
  if (hasPayout) return payoutFields.concat(sharedFields);
  return paymentFields.concat(sharedFields);
}

function buildFieldRegexes(fieldName) {
  var keys = [];
  if (fieldName === 'gateway') {
    keys.push('gc_type', 'gateway_name');
  } else {
    keys.push(fieldName);
    if (fieldName.startsWith('payment_') && fieldName !== 'payment_token') {
      keys.push(fieldName.replace('payment_', ''));
    }
    if (fieldName.startsWith('payout_') && fieldName !== 'payout_token') {
      keys.push(fieldName.replace('payout_', ''));
    }
    if (fieldName === 'payment_method_type_type') {
      keys.push('payment_method_type');
    }
  }
  var regexes = [];
  keys.forEach(function (key) {
    regexes.push(new RegExp(key + ":\\s*'([^']+)'?"));
    regexes.push(new RegExp('"' + key + '"\\s*:\\s*"([^"]+)"'));
    regexes.push(new RegExp(key + "=([^\\s,;&]+)"));
    regexes.push(new RegExp(key + ':\\s*([^\\s,;\\}\\]]+)'));
  });
  return regexes;
}

function extractUniqueDetails(hits) {
  var uniqueDetails = {};
  hits.forEach(function (hit) {
    var source = hit._source;
    var searchTexts = [];
    if (source.params != null) {
      searchTexts.push(typeof source.params === 'string' ? source.params : JSON.stringify(source.params));
    }
    if (source.message) {
      searchTexts.push(source.message);
    }
    if (searchTexts.length === 0) return;
    var combined = searchTexts.join(' ');
    allDetailFields.forEach(function (fieldName) {
      if (uniqueDetails[fieldName]) return;
      var regexes = buildFieldRegexes(fieldName);
      for (var i = 0; i < regexes.length; i++) {
        var match = combined.match(regexes[i]);
        if (match && match[1] && match[1].trim()) {
          var value = match[1].trim();
          if (value === 'undefined' || value === 'null' || value === 'nil') continue;
          if (fieldName === 'reference_id' && value.toLowerCase().startsWith('qm_')) {
            if (!uniqueDetails.quarantined_item_id) {
              uniqueDetails.quarantined_item_id = value;
            }
            return;
          }
          uniqueDetails[fieldName] = value;
          break;
        }
      }
    });
    if (!uniqueDetails.quarantined_item_id) {
      var qmMatch = combined.match(/\bqm_[a-f0-9]{32}\b/);
      if (qmMatch) {
        uniqueDetails.quarantined_item_id = qmMatch[0];
      }
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

function generateOccurrenceHtml(index, details, hit) {
  var isError = (details.level || '').toLowerCase() === 'error';
  var borderCls = isError ? 'border-red-200' : 'border-amber-200';
  var headerBg = isError ? 'bg-red-600' : 'bg-amber-600';
  var headerIcon = isError ? 'fa-times-circle' : 'fa-exclamation-triangle';
  var levelBadgeCls = isError ? 'bg-red-100 text-red-800' : 'bg-amber-200 text-amber-900';
  return '<div class="rounded-xl border-2 ' + borderCls + ' bg-white shadow-sm mb-4 overflow-hidden">' +
    '<div class="' + headerBg + ' text-white px-4 py-2">' +
      '<h5 class="font-semibold text-sm m-0"><i class="fas ' + headerIcon + ' mr-1"></i>Occurrence ' + (index + 1) + ' <i class="fas fa-exclamation-triangle ml-1"></i></h5>' +
    '</div>' +
    '<div class="p-4">' +
      '<div class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 mb-2 text-sm">' +
        '<span class="font-medium text-slate-600">Label:</span>' +
        '<span class="rounded-full bg-slate-200 text-slate-800 px-2 py-0.5 text-xs">' + dom.escapeHtml(details.label) + '</span>' +
      '</div>' +
      '<div class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 mb-2 text-sm">' +
        '<span class="font-medium text-slate-600">Level:</span>' +
        '<span class="rounded-full ' + levelBadgeCls + ' px-2 py-0.5 text-xs">' + dom.escapeHtml(details.level) + '</span>' +
      '</div>' +
      '<div class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 mb-2 text-sm">' +
        '<span class="font-medium text-slate-600">Message:</span>' +
        '<span class="text-slate-800">' + dom.escapeHtml(details.message) + '</span>' +
      '</div>' +
      '<div class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 mb-2 text-sm">' +
        '<span class="font-medium text-slate-600">Time:</span>' +
        '<span class="text-slate-800">' + dom.escapeHtml(details.time) + '</span>' +
      '</div>' +
      '<details class="mt-3">' +
        '<summary class="cursor-pointer inline-flex items-center gap-1 rounded-lg bg-red-100 text-red-800 px-3 py-1.5 text-sm font-medium hover:bg-red-200"><i class="fas fa-cogs"></i> Show Params</summary>' +
        '<pre class="mt-2 p-3 rounded-lg bg-slate-100 text-xs overflow-x-auto"><code>' + dom.escapeHtml(details.params) + '</code></pre>' +
      '</details>' +
    '</div>' +
  '</div>';
}

function generateDetailsTable(uniqueDetails) {
  var fields = getVisibleFields(uniqueDetails);
  var html = '<table class="w-full border-collapse border border-slate-300"><thead><tr class="bg-slate-100"><th class="border border-slate-300 px-3 py-2 text-left text-sm font-semibold">Field</th><th class="border border-slate-300 px-3 py-2 text-left text-sm font-semibold">Value</th></tr></thead><tbody>';
  fields.forEach(function (field) {
    var icon = fieldIcons[field] || 'fas fa-question-circle';
    var value = uniqueDetails[field] || '-----';
    var valueCls = uniqueDetails[field] ? '' : ' text-slate-400 italic';
    var isFailureMessage = field.includes('failure_message');
    var wrapCls = isFailureMessage ? ' break-words whitespace-normal max-w-md' : '';
    html += '<tr class="odd:bg-slate-50"><td class="border border-slate-300 px-3 py-2 text-sm"><i class="' + icon + ' mr-1"></i>' + field.replace(/_/g, ' ').toUpperCase() + '</td><td class="border border-slate-300 px-3 py-2 text-sm' + valueCls + wrapCls + '">' + dom.escapeHtml(value) + '</td></tr>';
  });
  html += '</tbody></table>';
  return html;
}

/** Build timeline events: ALL logs sorted by time, with type flags for coloring */
function buildTimelineEvents(hits) {
  var byTime = [].concat(hits).sort(function (a, b) { return (a._source.timestamp || 0) - (b._source.timestamp || 0); });
  var errorWarnIndices = new Set();
  var contextIndices = new Set();
  byTime.forEach(function (hit, i) {
    var level = (hit._source.level || '').toLowerCase();
    if (level === 'error' || level === 'warning') errorWarnIndices.add(i);
  });
  errorWarnIndices.forEach(function (i) {
    if (i > 0) contextIndices.add(i - 1);
    if (i < byTime.length - 1) contextIndices.add(i + 1);
  });
  return byTime.map(function (hit, i) {
    var level = (hit._source.level || '').toLowerCase();
    var type;
    if (level === 'error' || level === 'warning') type = level;
    else if (contextIndices.has(i) && !errorWarnIndices.has(i)) type = 'context';
    else type = 'info';
    return { hit: hit, type: type };
  });
}

/** Build searchable text from log source for fast client-side filtering */
function buildSearchableText(s) {
  var parts = [
    s.time || '',
    s.label || '',
    s.level || '',
    s.message || ''
  ];
  if (s.params != null) {
    var p = typeof s.params === 'string' ? s.params : JSON.stringify(s.params);
    parts.push(p.length > 2000 ? p.slice(0, 2000) : p);
  }
  return parts.join(' ').toLowerCase();
}

/** Escape string for safe use in HTML attribute */
function escapeAttr(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function generateTimelineHtml(hits) {
  const events = buildTimelineEvents(hits);
  if (events.length === 0) return '<p class="text-slate-600 text-sm">No timeline events.</p>';
  let html = '<div class="log-timeline relative pl-6 border-l-2 border-slate-200 border-solid">';
  events.forEach((ev) => {
    const s = ev.hit._source;
    const searchable = escapeAttr(buildSearchableText(s));
    const time = s.time || 'N/A';
    const label = dom.escapeHtml(s.label || 'N/A');
    const msg = dom.escapeHtml((s.message || '').slice(0, 120)) + ((s.message || '').length > 120 ? '…' : '');
    const isError = ev.type === 'error';
    const isWarn = ev.type === 'warning';
    const isContext = ev.type === 'context';
    const dotClass = isError ? 'bg-red-500 ring-red-200' : isWarn ? 'bg-amber-500 ring-amber-200' : isContext ? 'bg-sky-400 ring-sky-200' : 'bg-slate-400 ring-slate-200';
    const cardClass = isError ? 'border-red-200 bg-red-50' : isWarn ? 'border-amber-200 bg-amber-50' : isContext ? 'border-sky-200 bg-sky-50' : 'border-slate-200 bg-white';
    html += '<div class="log-timeline-item relative mb-2" data-searchable="' + searchable + '">';
    html += '<span class="absolute -left-6 top-1.5 w-2.5 h-2.5 rounded-full ring-2 ' + dotClass + '" title="' + ev.type + '"></span>';
    html += '<details class="log-timeline-details rounded border shadow-sm ' + cardClass + '">';
    html += '<summary class="cursor-pointer p-2 list-none flex flex-wrap items-center gap-2 [&::-webkit-details-marker]:hidden">';
    html += '<span class="text-xs font-mono text-slate-500">' + dom.escapeHtml(time) + '</span>';
    html += '<span class="rounded-full bg-slate-200 text-slate-800 px-2 py-0.5 text-xs font-medium">' + label + '</span>';
    if (isError) html += '<span class="rounded-full bg-red-600 text-white px-2 py-0.5 text-xs font-medium"><i class="fas fa-times-circle mr-1"></i>Error</span>';
    else if (isWarn) html += '<span class="rounded-full bg-amber-600 text-white px-2 py-0.5 text-xs font-medium"><i class="fas fa-exclamation-triangle mr-1"></i>Warning</span>';
    else if (isContext) html += '<span class="rounded-full bg-sky-200 text-sky-800 px-2 py-0.5 text-xs font-medium">Context</span>';
    html += '<span class="text-sm text-slate-700 break-words flex-1 min-w-0">' + msg + '</span>';
    html += '<span class="text-slate-400 text-xs">Click to expand</span>';
    html += '</summary>';
    html += '<div class="px-2 pb-2">' + fullLogHtml(ev.hit) + '</div>';
    html += '</details></div>';
  });
  html += '</div>';
  return html;
}

/** Debounce helper for efficient real-time search */
function debounce(fn, ms) {
  var t;
  return function () {
    clearTimeout(t);
    t = setTimeout(fn, ms);
  };
}

/** Setup smart real-time search for Log flow timeline */
function setupTimelineSearch() {
  var input = document.getElementById('timelineSearchInput');
  var wrapper = document.getElementById('logTimelineWrapper');
  var countEl = document.getElementById('timelineSearchCount');
  if (!input || !wrapper) return;

  var items = wrapper.querySelectorAll('.log-timeline-item');
  var total = items.length;

  function filterTimeline() {
    var q = (input.value || '').trim().toLowerCase();
    var terms = q ? q.split(/\s+/).filter(Boolean) : [];
    var visible = 0;

    items.forEach(function (item) {
      var searchable = (item.getAttribute('data-searchable') || '').toLowerCase();
      var match = terms.length === 0 || terms.every(function (t) { return searchable.indexOf(t) !== -1; });
      item.classList.toggle('timeline-search-hidden', !match);
      if (match) visible++;
    });

    if (q && countEl) {
      countEl.classList.remove('hidden');
      countEl.textContent = 'Showing ' + visible + ' of ' + total + ' logs';
    } else if (countEl) {
      countEl.classList.add('hidden');
    }
  }

  input.addEventListener('input', debounce(filterTimeline, 80));
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      input.value = '';
      filterTimeline();
      input.blur();
    }
  });
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
  var fields = getVisibleFields(uniqueDetails);
  let emailBody = 'Dear Team,\n\nPlease provide help regarding the following details:\n';
  if (uniqueDetails.gateway) emailBody += '- Gateway: ' + uniqueDetails.gateway + '\n';
  fields.forEach(function (field) {
    if (field === 'gateway' || field === 'quarantined_item_id') return;
    if (uniqueDetails[field]) {
      emailBody += '- ' + field.replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }) + ': ' + uniqueDetails[field] + '\n';
    }
  });
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
  results += '<span class="text-xs text-slate-500">All logs in chronological order. <span class="text-red-500 font-medium">Red</span> = error, <span class="text-amber-500 font-medium">Amber</span> = warning, <span class="text-sky-500 font-medium">Blue</span> = adjacent to error/warning. Click any entry for full log.</span>';
  results += '</div>';
  results += '<div class="timeline-search-bar mb-2">';
  results += '<input type="text" id="timelineSearchInput" placeholder="Search all logs (time, label, message, level, params)…" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" autocomplete="off" />';
  results += '<span id="timelineSearchCount" class="hidden text-xs text-slate-500 mt-1"></span>';
  results += '</div>';
  results += '<div class="log-timeline-wrapper overflow-y-auto" id="logTimelineWrapper">' + generateTimelineHtml(hits) + '</div>';
  results += '</div></details>';

  results += '<details class="analyze-section mb-3 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden" open>';
  results += '<summary class="analyze-section-summary cursor-pointer px-4 py-2.5 bg-slate-50 hover:bg-slate-100 font-semibold text-slate-800 flex items-center gap-2"><i class="fas fa-chart-bar"></i> Charts</summary>';
  results += '<div class="p-3 border-t border-slate-200 bg-slate-50/30"><div class="grid grid-cols-1 md:grid-cols-2 gap-3" id="canvasPlaceholder"></div></div>';
  results += '</details>';

  let occurrencesHtml = '';
  let occurrenceIndex = 0;
  hits.forEach(hit => {
    const source = hit._source;
    if (source.level === 'error' || source.level === 'warning') {
      occurrencesHtml += generateOccurrenceHtml(occurrenceIndex++, extractDetails(hit), hit);
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
  results += '<details class="analyze-section mb-3 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden" open>';
  results += '<summary class="analyze-section-summary cursor-pointer px-4 py-2.5 bg-slate-50 hover:bg-slate-100 font-semibold text-slate-800 flex items-center gap-2"><i class="fas fa-info-circle mr-1"></i>Important Details</summary>';
  results += '<div class="p-3 border-t border-slate-200 bg-slate-50/30"><div class="flex justify-end mb-2"><button type="button" id="copyDetailsBtn" class="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 text-xs font-medium transition shadow-sm"><i class="fas fa-copy"></i> Copy Details</button></div>' + generateDetailsTable(uniqueDetails) + '</div></details>';
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

  setupTimelineSearch();

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
  
  // Attach copy button handler for details table
  const copyDetailsBtn = document.getElementById('copyDetailsBtn');
  if (copyDetailsBtn) {
    copyDetailsBtn.addEventListener('click', function() {
      const detailsSection = copyDetailsBtn.closest('.analyze-section');
      const detailsTable = detailsSection ? detailsSection.querySelector('table') : null;
      if (!detailsTable) return;
      
      // Extract table data as text
      let text = '';
      const rows = detailsTable.querySelectorAll('tr');
      rows.forEach(function(row) {
        const cells = row.querySelectorAll('td, th');
        const rowData = Array.from(cells).map(function(cell) {
          return (cell.textContent || '').trim();
        });
        if (rowData.length > 0) {
          text += rowData.join('\t') + '\n';
        }
      });
      
      if (text && dom.copyToClipboard) {
        dom.copyToClipboard(text.trim()).then(function(success) {
          if (success && copyDetailsBtn) {
            const originalHtml = copyDetailsBtn.innerHTML;
            copyDetailsBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
            copyDetailsBtn.classList.add('bg-indigo-700');
            setTimeout(function() {
              copyDetailsBtn.innerHTML = originalHtml;
              copyDetailsBtn.classList.remove('bg-indigo-700');
            }, 2000);
          }
        });
      }
    });
  }
}

function clearAll(container) {
  var r = root(container);
  var logsEl = byId('logInput', r);
  var resultsEl = byId('analysisResults', r);
  var emailOutputEl = document.getElementById('emailOutput');
  if (logsEl) logsEl.value = '';
  if (resultsEl) resultsEl.innerHTML = '<span class="text-sm text-slate-600">Results will appear here...</span>';
  if (emailOutputEl) { emailOutputEl.classList.add('hidden'); emailOutputEl.innerHTML = '<h4 class="text-lg font-semibold text-slate-800 mb-2">Generated Email:</h4><pre id="generatedEmail"></pre>'; }
  destroyCharts();
}

function mount(container) {
  const r = root(container);
  const btn = byId('analyzeBtn', r);
  const clearBtnEl = byId('clearBtn', r);
  if (btn) btn.addEventListener('click', function () { runAnalysis(container); });
  if (clearBtnEl) clearBtnEl.addEventListener('click', function () { clearAll(container); });
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

/**
 * Statistics data – Slack alerts monitoring channel analysis.
 * Paste Slack content or future CSV upload → KPI cards, search, charts, table.
 */
var dom = window.App && window.App.dom;
var parser = window.App && window.App.slackAlertParser;

function root(container) {
  return container || document;
}

function byId(id, container) {
  var r = root(container);
  return r.getElementById ? r.getElementById(id) : r.querySelector('[id="' + id + '"]');
}

function escapeAttr(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

var DEMO_SLACK_TEXT = [
  '________________________________________________________________________________________',
  '- :label: Operation ID: ff01316b-76b8-4930-af7a-615ee3bd0a81',
  '   * time: 2026-02-11T08:07:10.316Z',
  '   * message:   NOC_SHVA_ALERT - Daily POS record with uid=26021013501408826147534 for operation = create domestic payment failed - Payment was not found',
  '   * label:   shva_file_service',
  '   * params:   [ [] ]',
  '________________________________________________________________________________________',
  '- :label: Operation ID: 33d9b276-c11b-4b18-84e5-724c29f2c86b',
  '   * time: 2026-02-11T08:07:10.328Z',
  '   * message:   NOC_SHVA_ALERT - Daily POS record with uid=26021014501908826140633 for operation = create domestic payment failed - Payment was not found',
  '   * label:   shva_file_service',
  '   * params:   [ [] ]',
  '________________________________________________________________________________________',
  '- :label: Operation ID: 2ef362aa-92b2-4ecf-a2a7-947bc6bab2dc',
  '   * time: 2026-02-11T08:07:11.358Z',
  '   * message:   NOC_SHVA_ALERT - Daily POS record with uid=26021015501408826143698 for operation = create domestic payment failed - Payment was not found',
  '   * label:   shva_file_service',
  '   * params:   [ [] ]',
  '________________________________________________________________________________________',
  'NOC_SHVA_ALERT - shva_collect_service',
  ':rotating_light: Alert: NOC_SHVA_ALERT - shva_collect_service entered, Please investigate the issue:',
  '  - Severity: 1',
  ':clock3: Period Start: 2026-02-11T11:03:55.687Z',
  ':clock3: Period End: 2026-02-11T11:04:55.687Z',
  ':exclamation: Number of Hits: 1',
  '________________________________________________________________________________________',
  '- :label: Operation ID: 9c7bb287-826d-46d6-b52d-edfec11f938f',
  '   * time: 2026-02-11T11:04:00.036Z',
  '   * message:   RapydProxyProvider/createPayment - NOC_SHVA_ALERT Shva: Invalid Advice - failed processing Advice from Shva',
  '   * label:   shva_collect_service',
  '   * params:   [ [ { response_code: \'ERROR_CREATE_PAYMENT\' } ] ]'
].join('\n');

var chartInstances = [];
var alertsState = [];
var filteredAlerts = [];

function filterAlerts(alerts, searchTerm, dateFrom, dateTo) {
  var term = (searchTerm || '').trim().toLowerCase();
  var from = dateFrom ? new Date(dateFrom).getTime() : null;
  var to = dateTo ? new Date(dateTo).getTime() : null;
  return alerts.filter(function (a) {
    if (term) {
      var msg = (a.message || '').toLowerCase();
      var opId = (a.operationId || '').toLowerCase();
      var lbl = (a.label || '').toLowerCase();
      var at = (a.alertType || '').toLowerCase();
      if (msg.indexOf(term) === -1 && opId.indexOf(term) === -1 && lbl.indexOf(term) === -1 && at.indexOf(term) === -1) {
        return false;
      }
    }
    if (from || to) {
      var t = a.time ? new Date(a.time).getTime() : 0;
      if (from && t < from) return false;
      if (to && t > to) return false;
    }
    return true;
  });
}

function getDateRange(alerts) {
  var times = alerts.map(function (a) { return a.time ? new Date(a.time).getTime() : 0; }).filter(Boolean);
  if (times.length === 0) return '—';
  var min = new Date(Math.min.apply(null, times));
  var max = new Date(Math.max.apply(null, times));
  return min.toLocaleDateString() + ' – ' + max.toLocaleDateString();
}

function groupByTime(alerts, groupBy) {
  var buckets = {};
  alerts.forEach(function (a) {
    var t = a.time ? new Date(a.time) : null;
    if (!t) return;
    var key;
    if (groupBy === 'hour') {
      key = t.toISOString().slice(0, 13);
    } else {
      key = t.toISOString().slice(0, 10);
    }
    buckets[key] = (buckets[key] || 0) + 1;
  });
  var keys = Object.keys(buckets).sort();
  return { labels: keys, values: keys.map(function (k) { return buckets[k]; }) };
}

function groupByField(alerts, field) {
  var buckets = {};
  alerts.forEach(function (a) {
    var v = a[field] || '(unknown)';
    buckets[v] = (buckets[v] || 0) + 1;
  });
  var entries = Object.entries(buckets).sort(function (a, b) { return b[1] - a[1]; });
  return { labels: entries.map(function (e) { return e[0]; }), values: entries.map(function (e) { return e[1]; }) };
}

var CHART_COLORS = [
  'rgba(99, 102, 241, 0.8)',
  'rgba(139, 92, 246, 0.8)',
  'rgba(236, 72, 153, 0.8)',
  'rgba(14, 165, 233, 0.8)',
  'rgba(34, 197, 94, 0.8)',
  'rgba(234, 179, 8, 0.8)',
  'rgba(239, 68, 68, 0.8)',
  'rgba(168, 85, 247, 0.8)'
];

function destroyCharts() {
  chartInstances.forEach(function (c) {
    if (c && typeof c.destroy === 'function') c.destroy();
  });
  chartInstances = [];
}

function renderCharts(container, alerts) {
  destroyCharts();
  var r = root(container);
  var timeCtx = r.querySelector('#statsChartTime');
  var typeCtx = r.querySelector('#statsChartType');
  var labelCtx = r.querySelector('#statsChartLabel');
  if (!window.Chart || alerts.length === 0) return;

  var timeData = groupByTime(alerts, 'day');
  if (timeData.labels.length > 0) {
    var timeChart = new Chart(timeCtx, {
      type: 'bar',
      data: {
        labels: timeData.labels,
        datasets: [{ label: 'Alerts', data: timeData.values, backgroundColor: CHART_COLORS[0] }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true },
          x: { ticks: { maxRotation: 45 } }
        }
      }
    });
    chartInstances.push(timeChart);
  }

  var typeData = groupByField(alerts, 'alertType');
  if (typeData.labels.length > 0) {
    var typeChart = new Chart(typeCtx, {
      type: 'doughnut',
      data: {
        labels: typeData.labels,
        datasets: [{ data: typeData.values, backgroundColor: CHART_COLORS }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } }
      }
    });
    chartInstances.push(typeChart);
  }

  var labelData = groupByField(alerts, 'label');
  if (labelData.labels.length > 0) {
    var labelChart = new Chart(labelCtx, {
      type: 'bar',
      data: {
        labels: labelData.labels,
        datasets: [{ label: 'Alerts', data: labelData.values, backgroundColor: CHART_COLORS[2] }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { beginAtZero: true },
          y: { ticks: { maxRotation: 0 } }
        }
      }
    });
    chartInstances.push(labelChart);
  }
}

function updateDashboard(container, alerts) {
  filteredAlerts = alerts;
  var r = root(container);
  var kpiTotal = r.querySelector('#statsKpiTotal');
  var kpiTypes = r.querySelector('#statsKpiTypes');
  var kpiServices = r.querySelector('#statsKpiServices');
  var kpiRange = r.querySelector('#statsKpiRange');
  var tableBody = r.querySelector('#statsTableBody');
  var dashboardEl = r.querySelector('#statsDashboard');
  var emptyEl = r.querySelector('#statsEmpty');

  if (alerts.length === 0) {
    if (dashboardEl) dashboardEl.classList.add('hidden');
    if (emptyEl) emptyEl.classList.remove('hidden');
    return;
  }
  if (dashboardEl) dashboardEl.classList.remove('hidden');
  if (emptyEl) emptyEl.classList.add('hidden');

  var types = {};
  var services = {};
  alerts.forEach(function (a) {
    types[a.alertType || '(unknown)'] = true;
    services[a.label || '(unknown)'] = true;
  });

  if (kpiTotal) kpiTotal.textContent = alerts.length;
  if (kpiTypes) kpiTypes.textContent = Object.keys(types).length;
  if (kpiServices) kpiServices.textContent = Object.keys(services).length;
  if (kpiRange) kpiRange.textContent = getDateRange(alerts);

  renderCharts(container, alerts);

  if (tableBody) {
    var displayAlerts = alerts.slice(0, 100);
    var rows = displayAlerts.map(function (a, idx) {
      var msg = (a.message || '').slice(0, 80);
      if (a.message && a.message.length > 80) msg += '…';
      var opId = dom && dom.escapeHtml ? dom.escapeHtml(a.operationId || '') : escapeAttr(a.operationId || '');
      var time = dom && dom.escapeHtml ? dom.escapeHtml(a.time || '') : escapeAttr(a.time || '');
      var at = dom && dom.escapeHtml ? dom.escapeHtml(a.alertType || '') : escapeAttr(a.alertType || '');
      var lbl = dom && dom.escapeHtml ? dom.escapeHtml(a.label || '') : escapeAttr(a.label || '');
      var m = dom && dom.escapeHtml ? dom.escapeHtml(msg) : escapeAttr(msg);
      return '<tr class="border-b border-slate-200 hover:bg-slate-50">' +
        '<td class="px-3 py-2 text-sm font-mono">' + opId + '</td>' +
        '<td class="px-3 py-2 text-sm">' + time + '</td>' +
        '<td class="px-3 py-2 text-sm">' + at + '</td>' +
        '<td class="px-3 py-2 text-sm">' + lbl + '</td>' +
        '<td class="px-3 py-2 text-sm text-slate-600 max-w-xs truncate" title="' + escapeAttr(a.message || '') + '">' + m + '</td>' +
        '<td class="px-3 py-2"><button type="button" class="stats-copy-btn inline-flex items-center gap-1 rounded bg-indigo-100 hover:bg-indigo-200 text-indigo-800 px-2 py-1 text-xs font-medium transition" data-idx="' + idx + '" title="Copy full alert"><i class="fas fa-copy"></i> Copy</button></td>' +
        '</tr>';
    });
    tableBody.innerHTML = rows.join('');
  }

  var copyBtns = r.querySelectorAll('.stats-copy-btn');
  copyBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var idx = parseInt(btn.getAttribute('data-idx'), 10);
      var a = filteredAlerts[idx];
      if (a && dom && dom.copyToClipboard) {
        dom.copyToClipboard(JSON.stringify(a, null, 2)).then(function (ok) {
          if (ok) {
            var orig = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
            setTimeout(function () { btn.innerHTML = orig; }, 1500);
          }
        });
      }
    });
  });
}

function runAnalyze(container) {
  var r = root(container);
  var textarea = byId('statsInput', r);
  var result = parser ? parser.parseSlackAlerts(textarea ? textarea.value : '') : { alerts: [], errors: [] };
  alertsState = result.alerts || [];
  runDashboardFromAlerts(container);
}

function runDashboardFromAlerts(container) {
  var r = root(container);
  var searchInput = byId('statsSearch', r);
  var dateFrom = byId('statsDateFrom', r);
  var dateTo = byId('statsDateTo', r);
  var term = searchInput ? searchInput.value : '';
  var from = dateFrom ? dateFrom.value : '';
  var to = dateTo ? dateTo.value : '';
  var filtered = filterAlerts(alertsState, term, from, to);
  updateDashboard(container, filtered);
}

function applySearch(container) {
  var r = root(container);
  var searchInput = byId('statsSearch', r);
  var dateFrom = byId('statsDateFrom', r);
  var dateTo = byId('statsDateTo', r);
  var term = searchInput ? searchInput.value : '';
  var from = dateFrom ? dateFrom.value : '';
  var to = dateTo ? dateTo.value : '';
  var filtered = filterAlerts(alertsState, term, from, to);
  updateDashboard(container, filtered);
}

function render() {
  return `
    <div class="relative">
      <button type="button" id="statsRefreshBtn" class="absolute top-0 right-0 p-2.5 rounded-lg text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 transition font-medium" title="Reset all"><i class="fas fa-sync-alt text-base"></i></button>
      <h2 class="text-xl font-bold text-slate-800 mb-2 pr-10">Statistics data</h2>
      <p class="text-slate-600 text-sm mb-4">Paste Slack alerts monitoring channel content below, or load from CSV export.</p>
      <textarea id="statsInput" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:ring-2 focus:ring-primary focus:border-primary font-mono text-sm resize-none" rows="10" placeholder="Paste Slack channel messages here..."></textarea>
      <div class="mt-4 pt-4 border-t border-slate-200 flex flex-wrap gap-2 items-center">
        <button type="button" id="statsAnalyzeBtn" class="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 text-sm font-medium transition shadow-sm"><i class="fas fa-chart-bar"></i> Analyze</button>
        <button type="button" id="statsDemoBtn" class="inline-flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 px-5 py-2.5 text-sm font-medium transition shadow-sm" title="Load sample Slack alerts"><i class="fas fa-magic"></i> Load Demo</button>
        <button type="button" id="statsCsvBtn" class="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 px-5 py-2.5 text-sm font-medium transition shadow-sm" title="Load alerts from CSV file"><i class="fas fa-file-csv"></i> Load from CSV</button>
        <input type="file" id="statsCsvInput" accept=".csv,text/csv" class="hidden" />
        <button type="button" id="statsClearBtn" class="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-5 py-2.5 text-sm font-medium transition shadow-sm"><i class="fas fa-trash-alt"></i> Clear</button>
      </div>

      <div id="statsEmpty" class="mt-6 p-6 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 text-center">
        <i class="fas fa-chart-pie text-4xl mb-2 text-slate-400"></i>
        <p class="m-0">Paste Slack content and click Analyze to see the dashboard.</p>
      </div>

      <div id="statsDashboard" class="mt-6 hidden">
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div class="text-2xl font-bold text-indigo-600" id="statsKpiTotal">0</div>
            <div class="text-sm text-slate-600">Total Alerts</div>
          </div>
          <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div class="text-2xl font-bold text-indigo-600" id="statsKpiTypes">0</div>
            <div class="text-sm text-slate-600">Alert Types</div>
          </div>
          <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div class="text-2xl font-bold text-indigo-600" id="statsKpiServices">0</div>
            <div class="text-sm text-slate-600">Services</div>
          </div>
          <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div class="text-sm font-bold text-slate-800 truncate" id="statsKpiRange" title="">—</div>
            <div class="text-sm text-slate-600">Date Range</div>
          </div>
        </div>

        <div class="mb-6 p-4 rounded-xl border border-slate-200 bg-slate-50">
          <label class="block text-sm font-semibold text-slate-700 mb-2"><i class="fas fa-search mr-1"></i> Search</label>
          <div class="flex flex-wrap gap-2">
            <input type="text" id="statsSearch" placeholder="Search message, operation ID, label, alert type…" class="flex-1 min-w-[200px] rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-primary focus:border-primary" autocomplete="off" />
            <input type="date" id="statsDateFrom" class="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-primary focus:border-primary" title="From date" />
            <input type="date" id="statsDateTo" class="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-primary focus:border-primary" title="To date" />
            <button type="button" id="statsSearchBtn" class="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 text-sm font-medium transition"><i class="fas fa-filter"></i> Filter</button>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div class="rounded-xl border border-slate-200 bg-white p-4">
            <h4 class="text-sm font-semibold text-slate-800 mb-3">Alerts over time</h4>
            <div class="chart-container" style="height: 220px;"><canvas id="statsChartTime"></canvas></div>
          </div>
          <div class="rounded-xl border border-slate-200 bg-white p-4">
            <h4 class="text-sm font-semibold text-slate-800 mb-3">Alerts by type</h4>
            <div class="chart-container" style="height: 220px;"><canvas id="statsChartType"></canvas></div>
          </div>
          <div class="rounded-xl border border-slate-200 bg-white p-4">
            <h4 class="text-sm font-semibold text-slate-800 mb-3">Alerts by service</h4>
            <div class="chart-container" style="height: 220px;"><canvas id="statsChartLabel"></canvas></div>
          </div>
        </div>

        <div class="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <h4 class="text-sm font-semibold text-slate-800 px-4 py-3 border-b border-slate-200">Alerts table (top 100)</h4>
          <div class="overflow-x-auto">
            <table class="w-full text-left">
              <thead class="bg-slate-100 border-b border-slate-200">
                <tr>
                  <th class="px-3 py-2 text-sm font-semibold text-slate-700">Operation ID</th>
                  <th class="px-3 py-2 text-sm font-semibold text-slate-700">Time</th>
                  <th class="px-3 py-2 text-sm font-semibold text-slate-700">Alert Type</th>
                  <th class="px-3 py-2 text-sm font-semibold text-slate-700">Label</th>
                  <th class="px-3 py-2 text-sm font-semibold text-slate-700">Message</th>
                  <th class="px-3 py-2 text-sm font-semibold text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody id="statsTableBody"></tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;
}

function mount(container, context) {
  var r = root(container);
  var refreshBtn = byId('statsRefreshBtn', r);
  var analyzeBtn = byId('statsAnalyzeBtn', r);
  var demoBtn = byId('statsDemoBtn', r);
  var clearBtn = byId('statsClearBtn', r);
  var searchBtn = byId('statsSearchBtn', r);
  var textarea = byId('statsInput', r);
  var searchInput = byId('statsSearch', r);

  function doRefresh() {
    if (textarea) textarea.value = '';
    alertsState = [];
    var dashboard = r.querySelector('#statsDashboard');
    var empty = r.querySelector('#statsEmpty');
    if (dashboard) dashboard.classList.add('hidden');
    if (empty) empty.classList.remove('hidden');
    destroyCharts();
  }

  function doAnalyze() {
    runAnalyze(container);
  }

  function doDemo() {
    if (textarea) textarea.value = DEMO_SLACK_TEXT;
  }

  function doClear() {
    if (textarea) textarea.value = '';
    doRefresh();
  }

  function doSearch() {
    applySearch(container);
  }

  function doLoadCsv() {
    var csvInput = byId('statsCsvInput', r);
    if (csvInput) csvInput.click();
  }

  function doCsvFileChange(e) {
    var file = e.target && e.target.files && e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (ev) {
      var csvText = ev.target && ev.target.result;
      if (!csvText || !parser) return;
      var result = parser.parseSlackCsv(csvText);
      alertsState = result.alerts || [];
      if (result.errors && result.errors.length > 0) {
        console.warn('CSV parse warnings:', result.errors);
      }
      runDashboardFromAlerts(container);
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  }

  if (refreshBtn) refreshBtn.addEventListener('click', doRefresh);
  if (analyzeBtn) analyzeBtn.addEventListener('click', doAnalyze);
  if (demoBtn) demoBtn.addEventListener('click', doDemo);
  if (clearBtn) clearBtn.addEventListener('click', doClear);
  if (searchBtn) searchBtn.addEventListener('click', doSearch);
  var csvBtn = byId('statsCsvBtn', r);
  var csvInput = byId('statsCsvInput', r);
  if (csvBtn) csvBtn.addEventListener('click', doLoadCsv);
  if (csvInput) csvInput.addEventListener('change', doCsvFileChange);

  if (searchInput) {
    searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') doSearch();
    });
  }
}

function unmount() {
  destroyCharts();
  alertsState = [];
  filteredAlerts = [];
}

var statisticsView = {
  route: 'statistics',
  navLabel: 'Statistics data',
  render: render,
  mount: mount,
  unmount: unmount
};

(function () {
  window.MonitorToolsViews = window.MonitorToolsViews || {};
  window.MonitorToolsViews.statisticsView = statisticsView;
})();

/**
 * Statistics - Hubspot – HubSpot tickets CSV analysis dashboard.
 * Paste or load CSV → KPI cards, search, charts, table.
 */
(function () {
  'use strict';
  var dom = window.App && window.App.dom;
  var parser = window.App && window.App.hubspotTicketParser;

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

var DEMO_HUBSPOT_CSV = [
  '"Ticket ID","Ticket name","Pipeline","Ticket status","Create date","Ticket owner","Source","Last activity date"',
  '"10000000001","10000000001 - No New Request Received from Scheduler In The Past Hour","Monitor","New","2026-03-01 15:17","","Email","2026-03-01 15:17"',
  '"10000000002","10000000002 - No New Request Received from Scheduler In The Past Hour","Monitor","New","2026-03-01 14:47","","Email","2026-03-01 14:47"',
  '"10000000003","10000000003 - PaymentProvider Incident - Service Restored: Payout Delays (Region A)","Monitor","Closed Resolved","2026-03-01 11:48","","Email","2026-03-01 11:48"',
  '"10000000004","10000000004 - PaymentProvider Incident - Service Restored: Payout Delays (Region A)","Monitor","Closed Resolved","2026-03-01 11:48","","Email","2026-03-01 11:48"',
  '"10000000005","10000000005 - PaymentProvider Incident - Service Restored: Payout (Region B)","Monitor","Closed Resolved","2026-03-01 11:29","","Email","2026-03-01 11:29"',
  '"10000000006","10000000006 - PaymentProvider Incident - Service Restored: Payouts (Region C)","Monitor","Closed Resolved","2026-03-01 11:28","","Email","2026-03-01 11:28"',
  '"10000000007","10000000007 - Active Payouts Alert > 30 Days","Monitor","Pending","2026-03-01 09:31","","Email","2026-03-01 13:25"',
  '"10000000008","10000000008 - Check for updates in the >3 Days Active Payouts Queue","Monitor","Closed Resolved","2026-03-01 09:00","","Email","2026-03-01 09:00"',
  '"10000000009","10000000009 - [P1] Recovered: reconciliation_db: daily recon report failed to send on environment:prod","Monitor","Resolved","2026-03-01 07:11","","Email","2026-03-01 07:11"',
  '"10000000010","10000000010 - [P1] Triggered: reconciliation_db: daily recon report failed to send on environment:prod","Monitor","Closed Resolved","2026-03-01 06:41","","Email","2026-03-01 06:41"',
  '"10000000011","10000000011 - CUSTOMER SERVICE UPDATE: DEMO-METRIC-001 drop [#INC-DEMO-001]","Monitor","Closed Resolved","2026-03-01 10:45","alon","Email","2026-03-01 13:19"',
  '"10000000012","10000000012 - Check for updates in the >3 Days Active Payouts Queue","Monitor","Closed Resolved","2026-03-01 01:00","","Email","2026-03-01 01:00"',
  '"10000000013","10000000013 - No New Request Received from Scheduler In The Past Hour","Monitor","New","2026-03-01 10:32","","Email","2026-03-01 10:32"',
  '"10000000014","10000000014 - No New Request Received from Scheduler In The Past Hour","Monitor","New","2026-03-01 10:17","","Email","2026-03-01 10:17"',
  '"10000000015","10000000015 - No New Request Received from Scheduler In The Past Hour","Monitor","New","2026-03-01 10:02","","Email","2026-03-01 10:02"',
  '"10000000016","10000000016 - No New Request Received from Scheduler In The Past Hour","Monitor","New","2026-03-01 09:47","","Email","2026-03-01 09:47"',
  '"10000000017","10000000017 - No New Request Received from Scheduler In The Past Hour","Monitor","New","2026-03-01 09:32","","Email","2026-03-01 09:32"',
  '"10000000018","10000000018 - No New Request Received from Scheduler In The Past Hour","Monitor","New","2026-03-01 09:02","","Email","2026-03-01 09:02"'
].join('\n');

var chartInstances = [];
var chartModalInstance = null;
var ticketsState = [];
var filteredTickets = [];

function filterTickets(tickets, searchTerm, dateFrom, dateTo) {
  var term = (searchTerm || '').trim().toLowerCase();
  var from = dateFrom ? new Date(dateFrom).getTime() : null;
  var to = dateTo ? new Date(dateTo).getTime() : null;
  return tickets.filter(function (t) {
    if (term) {
      var name = (t.ticketName || '').toLowerCase();
      var id = (t.ticketId || '').toLowerCase();
      var status = (t.status || '').toLowerCase();
      var owner = (t.owner || '').toLowerCase();
      var type = (t.ticketType || '').toLowerCase();
      var pipeline = (t.pipeline || '').toLowerCase();
      if (name.indexOf(term) === -1 && id.indexOf(term) === -1 && status.indexOf(term) === -1 && owner.indexOf(term) === -1 && type.indexOf(term) === -1 && pipeline.indexOf(term) === -1) {
        return false;
      }
    }
    if (from || to) {
      var d = t.createDate ? parseHubspotDate(t.createDate) : 0;
      if (from && d < from) return false;
      if (to && d > to) return false;
    }
    return true;
  });
}

function parseHubspotDate(s) {
  if (!s) return 0;
  var d = new Date(s.replace(' ', 'T'));
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

function getDateRange(tickets) {
  var times = tickets.map(function (t) { return parseHubspotDate(t.createDate); }).filter(Boolean);
  if (times.length === 0) return '—';
  var min = new Date(Math.min.apply(null, times));
  var max = new Date(Math.max.apply(null, times));
  return min.toLocaleDateString() + ' – ' + max.toLocaleDateString();
}

function groupByTime(tickets, groupBy) {
  var buckets = {};
  tickets.forEach(function (t) {
    var d = t.createDate ? new Date(t.createDate.replace(' ', 'T')) : null;
    if (!d || isNaN(d.getTime())) return;
    var key = groupBy === 'hour' ? d.toISOString().slice(0, 13) : d.toISOString().slice(0, 10);
    buckets[key] = (buckets[key] || 0) + 1;
  });
  var keys = Object.keys(buckets).sort();
  return { labels: keys, values: keys.map(function (k) { return buckets[k]; }) };
}

function groupByField(tickets, field) {
  var buckets = {};
  tickets.forEach(function (t) {
    var v = t[field];
    if (field === 'owner' && (!v || String(v).trim() === '')) v = 'Unassigned';
    else v = v || '(unknown)';
    if (v.length > 50) v = v.slice(0, 47) + '…';
    buckets[v] = (buckets[v] || 0) + 1;
  });
  var entries = Object.entries(buckets).sort(function (a, b) { return b[1] - a[1]; });
  return { labels: entries.map(function (e) { return e[0]; }), values: entries.map(function (e) { return e[1]; }) };
}

function groupByDayOfWeek(tickets) {
  var dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var buckets = [0, 0, 0, 0, 0, 0, 0];
  tickets.forEach(function (t) {
    var d = t.createDate ? new Date(t.createDate.replace(' ', 'T')) : null;
    if (!d || isNaN(d.getTime())) return;
    var day = d.getDay();
    buckets[day] = (buckets[day] || 0) + 1;
  });
  return { labels: dayNames, values: buckets };
}

function groupByShift(tickets) {
  var labels = ['Morning', 'Evening', 'Night'];
  var buckets = { Morning: 0, Evening: 0, Night: 0 };
  tickets.forEach(function (t) {
    var d = t.createDate ? new Date(t.createDate.replace(' ', 'T')) : null;
    if (!d || isNaN(d.getTime())) return;
    var hour = d.getHours();
    var shift = (hour >= 7 && hour < 15) ? 'Morning' : (hour >= 15 && hour < 23) ? 'Evening' : 'Night';
    buckets[shift] = (buckets[shift] || 0) + 1;
  });
  return { labels: labels, values: [buckets.Morning, buckets.Evening, buckets.Night] };
}

function groupByDayAndShift(tickets) {
  var dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var buckets = {};
  dayNames.forEach(function (d) {
    buckets[d] = { Morning: 0, Evening: 0, Night: 0 };
  });
  tickets.forEach(function (t) {
    var d = t.createDate ? new Date(t.createDate.replace(' ', 'T')) : null;
    if (!d || isNaN(d.getTime())) return;
    var day = dayNames[d.getDay()];
    var hour = d.getHours();
    var shift = (hour >= 7 && hour < 15) ? 'Morning' : (hour >= 15 && hour < 23) ? 'Evening' : 'Night';
    buckets[day][shift] = (buckets[day][shift] || 0) + 1;
  });
  return {
    labels: dayNames,
    morning: dayNames.map(function (d) { return buckets[d].Morning; }),
    evening: dayNames.map(function (d) { return buckets[d].Evening; }),
    night: dayNames.map(function (d) { return buckets[d].Night; })
  };
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

function renderCharts(container, tickets) {
  destroyCharts();
  var r = root(container);
  var timeCtx = r.querySelector('#hubspotChartTime');
  var statusCtx = r.querySelector('#hubspotChartStatus');
  var typeCtx = r.querySelector('#hubspotChartType');
  if (!window.Chart || tickets.length === 0) return;

  var timeData = groupByTime(tickets, 'day');
  if (timeData.labels.length > 0) {
    var timeChart = new Chart(timeCtx, {
      type: 'bar',
      data: {
        labels: timeData.labels,
        datasets: [{ label: 'Tickets', data: timeData.values, backgroundColor: CHART_COLORS[0] }]
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

  var statusData = groupByField(tickets, 'status');
  if (statusData.labels.length > 0) {
    var statusChart = new Chart(statusCtx, {
      type: 'doughnut',
      data: {
        labels: statusData.labels,
        datasets: [{ data: statusData.values, backgroundColor: CHART_COLORS }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } }
      }
    });
    chartInstances.push(statusChart);
  }

  var typeData = groupByField(tickets, 'ticketType');
  if (typeData.labels.length > 0) {
    var typeChart = new Chart(typeCtx, {
      type: 'bar',
      data: {
        labels: typeData.labels,
        datasets: [{ label: 'Tickets', data: typeData.values, backgroundColor: CHART_COLORS[2] }]
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
    chartInstances.push(typeChart);
  }

  var ownerCtx = r.querySelector('#hubspotChartOwner');
  var ownerData = groupByField(tickets, 'owner');
  if (ownerCtx && ownerData.labels.length > 0) {
    var ownerChart = new Chart(ownerCtx, {
      type: 'bar',
      data: {
        labels: ownerData.labels,
        datasets: [{ label: 'Tickets', data: ownerData.values, backgroundColor: CHART_COLORS[3] }]
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
    chartInstances.push(ownerChart);
  }

  var dayCtx = r.querySelector('#hubspotChartDayOfWeek');
  var dayData = groupByDayOfWeek(tickets);
  if (dayCtx) {
    var dayChart = new Chart(dayCtx, {
      type: 'bar',
      data: {
        labels: dayData.labels,
        datasets: [{ label: 'Tickets', data: dayData.values, backgroundColor: CHART_COLORS[4] }]
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
    chartInstances.push(dayChart);
  }

  var shiftCtx = r.querySelector('#hubspotChartShift');
  var shiftData = groupByShift(tickets);
  if (shiftCtx) {
    var shiftChart = new Chart(shiftCtx, {
      type: 'doughnut',
      data: {
        labels: shiftData.labels,
        datasets: [{ data: shiftData.values, backgroundColor: [CHART_COLORS[0], CHART_COLORS[2], CHART_COLORS[5]] }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } }
      }
    });
    chartInstances.push(shiftChart);
  }

  var dayShiftCtx = r.querySelector('#hubspotChartDayShift');
  var dayShiftData = groupByDayAndShift(tickets);
  if (dayShiftCtx) {
    var dayShiftChart = new Chart(dayShiftCtx, {
      type: 'bar',
      data: {
        labels: dayShiftData.labels,
        datasets: [
          { label: 'Morning (07:00–15:00)', data: dayShiftData.morning, backgroundColor: CHART_COLORS[0] },
          { label: 'Evening (15:00–23:00)', data: dayShiftData.evening, backgroundColor: CHART_COLORS[2] },
          { label: 'Night (23:00–07:00)', data: dayShiftData.night, backgroundColor: CHART_COLORS[5] }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: {
          x: { stacked: true, ticks: { maxRotation: 45 } },
          y: { stacked: true, beginAtZero: true }
        }
      }
    });
    chartInstances.push(dayShiftChart);
  }
}

function updateDashboard(container, tickets) {
  filteredTickets = tickets;
  var r = root(container);
  var kpiTotal = r.querySelector('#hubspotKpiTotal');
  var kpiStatuses = r.querySelector('#hubspotKpiStatuses');
  var kpiPipelines = r.querySelector('#hubspotKpiPipelines');
  var kpiRange = r.querySelector('#hubspotKpiRange');
  var tableBody = r.querySelector('#hubspotTableBody') || document.getElementById('hubspotTableBody');
  var dashboardEl = r.querySelector('#hubspotDashboard') || document.getElementById('hubspotDashboard');
  var emptyEl = r.querySelector('#hubspotEmpty') || document.getElementById('hubspotEmpty');

  if (tickets.length === 0) {
    if (dashboardEl) dashboardEl.classList.add('hidden');
    if (emptyEl) emptyEl.classList.remove('hidden');
    return;
  }
  if (dashboardEl) dashboardEl.classList.remove('hidden');
  if (emptyEl) emptyEl.classList.add('hidden');

  var statuses = {};
  var pipelines = {};
  tickets.forEach(function (t) {
    statuses[t.status || '(unknown)'] = true;
    pipelines[t.pipeline || '(unknown)'] = true;
  });

  if (kpiTotal) kpiTotal.textContent = tickets.length;
  if (kpiStatuses) kpiStatuses.textContent = Object.keys(statuses).length;
  if (kpiPipelines) kpiPipelines.textContent = Object.keys(pipelines).length;
  if (kpiRange) kpiRange.textContent = getDateRange(tickets);

  renderCharts(container, tickets);

  if (tableBody) {
    var displayTickets = tickets.slice(0, 100);
    var rows = displayTickets.map(function (t, idx) {
      var name = (t.ticketName || '').slice(0, 60);
      if (t.ticketName && t.ticketName.length > 60) name += '…';
      var type = (t.ticketType || '').slice(0, 40);
      if (t.ticketType && t.ticketType.length > 40) type += '…';
      return '<tr class="hubspot-ticket-row border-b border-slate-200 hover:bg-slate-50 cursor-pointer" data-idx="' + idx + '" role="button" tabindex="0">' +
        '<td class="px-3 py-2 text-sm font-mono">' + (dom && dom.escapeHtml ? dom.escapeHtml(t.ticketId || '') : escapeAttr(t.ticketId || '')) + '</td>' +
        '<td class="px-3 py-2 text-sm">' + (dom && dom.escapeHtml ? dom.escapeHtml(t.createDate || '') : escapeAttr(t.createDate || '')) + '</td>' +
        '<td class="px-3 py-2 text-sm">' + (dom && dom.escapeHtml ? dom.escapeHtml(t.status || '') : escapeAttr(t.status || '')) + '</td>' +
        '<td class="px-3 py-2 text-sm">' + (dom && dom.escapeHtml ? dom.escapeHtml(t.pipeline || '') : escapeAttr(t.pipeline || '')) + '</td>' +
        '<td class="px-3 py-2 text-sm text-slate-600 max-w-[200px] truncate" title="' + escapeAttr(t.ticketType || '') + '">' + (dom && dom.escapeHtml ? dom.escapeHtml(type) : escapeAttr(type)) + '</td>' +
        '<td class="px-3 py-2 text-sm text-slate-600 max-w-xs truncate" title="' + escapeAttr(t.ticketName || '') + '">' + (dom && dom.escapeHtml ? dom.escapeHtml(name) : escapeAttr(name)) + '</td>' +
        '<td class="px-3 py-2 text-sm">' + (dom && dom.escapeHtml ? dom.escapeHtml(t.owner || '') : escapeAttr(t.owner || '')) + '</td>' +
        '<td class="px-3 py-2"><button type="button" class="hubspot-copy-btn inline-flex items-center gap-1 rounded bg-indigo-100 hover:bg-indigo-200 text-indigo-800 px-2 py-1 text-xs font-medium transition" data-idx="' + idx + '" title="Copy full ticket"><i class="fas fa-copy"></i> Copy</button></td>' +
        '</tr>';
    });
    tableBody.innerHTML = rows.join('');
  }

  var copyBtns = r.querySelectorAll('.hubspot-copy-btn');
  copyBtns.forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var idx = parseInt(btn.getAttribute('data-idx'), 10);
      var t = filteredTickets[idx];
      if (t && dom && dom.copyToClipboard) {
        dom.copyToClipboard(JSON.stringify(t, null, 2)).then(function (ok) {
          if (ok) {
            var orig = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
            setTimeout(function () { btn.innerHTML = orig; }, 1500);
          }
        });
      }
    });
  });

  var ticketRows = r.querySelectorAll('.hubspot-ticket-row');
  ticketRows.forEach(function (row) {
    row.addEventListener('click', function () {
      var idx = parseInt(row.getAttribute('data-idx'), 10);
      var t = filteredTickets[idx];
      if (t) showTicketModal(r, t);
    });
    row.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        row.click();
      }
    });
  });
}

function getStatusBadgeClass(status) {
  if (!status) return 'bg-slate-100 text-slate-700';
  var s = String(status).toLowerCase();
  if (s.indexOf('closed') >= 0 || s.indexOf('resolved') >= 0) return 'bg-emerald-100 text-emerald-700';
  if (s.indexOf('new') >= 0) return 'bg-blue-100 text-blue-700';
  if (s.indexOf('pending') >= 0) return 'bg-amber-100 text-amber-800';
  if (s.indexOf('resolved') >= 0) return 'bg-emerald-100 text-emerald-700';
  return 'bg-slate-100 text-slate-700';
}

function fieldVal(ticket, key) {
  var v = ticket[key];
  if (v == null || String(v).trim() === '') return '—';
  return dom && dom.escapeHtml ? dom.escapeHtml(String(v)) : escapeAttr(String(v));
}

function showTicketModal(container, ticket) {
  var r = root(container);
  var modal = r.querySelector('#hubspotTicketModal');
  var body = r.querySelector('#hubspotTicketModalBody');
  var titleEl = r.querySelector('#hubspotTicketModalTitle');
  var statusEl = r.querySelector('#hubspotTicketModalStatus');
  var closeBtn = r.querySelector('#hubspotTicketModalClose');
  if (!modal || !body) return;

  if (titleEl) titleEl.textContent = 'Ticket #' + (ticket.ticketId || '—');
  if (statusEl) {
    var status = ticket.status || '—';
    statusEl.textContent = status;
    statusEl.className = 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ' + getStatusBadgeClass(status);
  }

  var overview = [
    { key: 'ticketId', label: 'Ticket ID' },
    { key: 'status', label: 'Status' },
    { key: 'pipeline', label: 'Pipeline' },
    { key: 'owner', label: 'Owner' }
  ];
  var details = [
    { key: 'ticketName', label: 'Ticket name' },
    { key: 'ticketType', label: 'Ticket type' }
  ];
  var timeline = [
    { key: 'createDate', label: 'Create date' },
    { key: 'lastActivityDate', label: 'Last activity date' },
    { key: 'source', label: 'Source' }
  ];

  function renderSection(title, fields, fullWidth) {
    var rows = fields.map(function (f) {
      var val = fieldVal(ticket, f.key);
      var label = dom && dom.escapeHtml ? dom.escapeHtml(f.label) : escapeAttr(f.label);
      if (fullWidth) {
        return '<div class="flex flex-col gap-1"><span class="text-slate-500 font-medium text-xs">' + label + '</span><span class="text-slate-800 break-words">' + val + '</span></div>';
      }
      return '<div class="flex justify-between gap-4 py-1.5"><span class="text-slate-500 font-medium text-xs shrink-0">' + label + '</span><span class="text-slate-800 break-words text-right">' + val + '</span></div>';
    }).join('');
    var titleSafe = dom && dom.escapeHtml ? dom.escapeHtml(title) : escapeAttr(title);
    return '<div class="rounded-lg border border-slate-100 bg-slate-50/50 p-3"><h4 class="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">' + titleSafe + '</h4><div class="space-y-0">' + rows + '</div></div>';
  }

  body.innerHTML = renderSection('Overview', overview, false) + renderSection('Details', details, true) + renderSection('Timeline', timeline, false);

  modal.classList.remove('hidden');
  modal.classList.add('flex');
  modal.setAttribute('aria-hidden', 'false');
  function closeModal() {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    modal.setAttribute('aria-hidden', 'true');
  }
  if (closeBtn) closeBtn.onclick = closeModal;
  modal.onclick = function (e) { if (e.target === modal) closeModal(); };
  modal.onkeydown = function (e) { if (e.key === 'Escape') closeModal(); };
}

function destroyChartModalChart() {
  if (chartModalInstance && typeof chartModalInstance.destroy === 'function') {
    chartModalInstance.destroy();
    chartModalInstance = null;
  }
}

var CHART_MODAL_TITLES = {
  time: 'Tickets over time',
  status: 'By status',
  type: 'By ticket type',
  owner: 'By owner',
  dayOfWeek: 'By day of week',
  shift: 'By shift',
  dayShift: 'Manager view: tickets by day and shift'
};

function getTicketSortKey(ticket, chartKey) {
  if (chartKey === 'time') {
    var d = ticket.createDate ? new Date(ticket.createDate.replace(' ', 'T')) : null;
    return d && !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : '';
  }
  if (chartKey === 'status') return ticket.status || '(unknown)';
  if (chartKey === 'type') return ticket.ticketType || '(unknown)';
  if (chartKey === 'owner') return (ticket.owner && String(ticket.owner).trim()) ? ticket.owner : 'Unassigned';
  if (chartKey === 'dayOfWeek') {
    var dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var d = ticket.createDate ? new Date(ticket.createDate.replace(' ', 'T')) : null;
    return d && !isNaN(d.getTime()) ? dayNames[d.getDay()] : '';
  }
  if (chartKey === 'shift') {
    var d = ticket.createDate ? new Date(ticket.createDate.replace(' ', 'T')) : null;
    if (!d || isNaN(d.getTime())) return '';
    var hour = d.getHours();
    return (hour >= 7 && hour < 15) ? 'Morning' : (hour >= 15 && hour < 23) ? 'Evening' : 'Night';
  }
  if (chartKey === 'dayShift') {
    var dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var d = ticket.createDate ? new Date(ticket.createDate.replace(' ', 'T')) : null;
    if (!d || isNaN(d.getTime())) return '';
    var day = dayNames[d.getDay()];
    var hour = d.getHours();
    var shift = (hour >= 7 && hour < 15) ? 'Morning' : (hour >= 15 && hour < 23) ? 'Evening' : 'Night';
    return day + ' / ' + shift;
  }
  return '';
}

function showChartModal(container, chartKey, tickets) {
  if (!tickets || tickets.length === 0) return;
  if (!window.Chart) return;

  var r = root(container);
  var modal = r.querySelector('#hubspotChartModal');
  var body = r.querySelector('#hubspotChartModalBody');
  var titleEl = r.querySelector('#hubspotChartModalTitle');
  var closeBtn = r.querySelector('#hubspotChartModalClose');
  if (!modal || !body) return;

  destroyChartModalChart();

  var title = CHART_MODAL_TITLES[chartKey] || 'Chart details';
  if (titleEl) titleEl.textContent = title;

  var chartData = null;
  var chartConfig = null;

  if (chartKey === 'time') {
    chartData = groupByTime(tickets, 'day');
    if (chartData.labels.length > 0) {
      chartConfig = {
        type: 'bar',
        data: {
          labels: chartData.labels,
          datasets: [{ label: 'Tickets', data: chartData.values, backgroundColor: CHART_COLORS[0] }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true }, x: { ticks: { maxRotation: 45 } } }
        }
      };
    }
  } else if (chartKey === 'status') {
    chartData = groupByField(tickets, 'status');
    if (chartData.labels.length > 0) {
      chartConfig = {
        type: 'doughnut',
        data: {
          labels: chartData.labels,
          datasets: [{ data: chartData.values, backgroundColor: CHART_COLORS }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom' } }
        }
      };
    }
  } else if (chartKey === 'type') {
    chartData = groupByField(tickets, 'ticketType');
    if (chartData.labels.length > 0) {
      chartConfig = {
        type: 'bar',
        data: {
          labels: chartData.labels,
          datasets: [{ label: 'Tickets', data: chartData.values, backgroundColor: CHART_COLORS[2] }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { x: { beginAtZero: true }, y: { ticks: { maxRotation: 0 } } }
        }
      };
    }
  } else if (chartKey === 'owner') {
    chartData = groupByField(tickets, 'owner');
    if (chartData.labels.length > 0) {
      chartConfig = {
        type: 'bar',
        data: {
          labels: chartData.labels,
          datasets: [{ label: 'Tickets', data: chartData.values, backgroundColor: CHART_COLORS[3] }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { x: { beginAtZero: true }, y: { ticks: { maxRotation: 0 } } }
        }
      };
    }
  } else if (chartKey === 'dayOfWeek') {
    chartData = groupByDayOfWeek(tickets);
    chartConfig = {
      type: 'bar',
      data: {
        labels: chartData.labels,
        datasets: [{ label: 'Tickets', data: chartData.values, backgroundColor: CHART_COLORS[4] }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true }, x: { ticks: { maxRotation: 45 } } }
      }
    };
  } else if (chartKey === 'shift') {
    chartData = groupByShift(tickets);
    chartConfig = {
      type: 'doughnut',
      data: {
        labels: chartData.labels,
        datasets: [{ data: chartData.values, backgroundColor: [CHART_COLORS[0], CHART_COLORS[2], CHART_COLORS[5]] }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } }
      }
    };
  } else if (chartKey === 'dayShift') {
    chartData = groupByDayAndShift(tickets);
    chartConfig = {
      type: 'bar',
      data: {
        labels: chartData.labels,
        datasets: [
          { label: 'Morning (07:00–15:00)', data: chartData.morning, backgroundColor: CHART_COLORS[0] },
          { label: 'Evening (15:00–23:00)', data: chartData.evening, backgroundColor: CHART_COLORS[2] },
          { label: 'Night (23:00–07:00)', data: chartData.night, backgroundColor: CHART_COLORS[5] }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: { x: { stacked: true, ticks: { maxRotation: 45 } }, y: { stacked: true, beginAtZero: true } }
      }
    };
  }

  var total = tickets.length;
  var breakdownRows = [];
  if (chartData && chartData.labels) {
    chartData.labels.forEach(function (label, i) {
      var count = chartData.values ? chartData.values[i] : 0;
      var pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0';
      breakdownRows.push('<tr class="border-b border-slate-100"><td class="px-3 py-2 text-sm text-slate-800">' + (dom && dom.escapeHtml ? dom.escapeHtml(String(label)) : escapeAttr(String(label))) + '</td><td class="px-3 py-2 text-sm font-medium text-slate-700">' + count + '</td><td class="px-3 py-2 text-sm text-slate-500">' + pct + '%</td></tr>');
    });
  } else if (chartData && chartData.morning) {
    chartData.labels.forEach(function (day, i) {
      var m = chartData.morning[i] || 0;
      var e = chartData.evening[i] || 0;
      var n = chartData.night[i] || 0;
      var count = m + e + n;
      var pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0';
      breakdownRows.push('<tr class="border-b border-slate-100"><td class="px-3 py-2 text-sm font-medium text-slate-800">' + (dom && dom.escapeHtml ? dom.escapeHtml(String(day)) : escapeAttr(String(day))) + '</td><td class="px-3 py-2 text-sm text-center text-slate-700">' + m + '</td><td class="px-3 py-2 text-sm text-center text-slate-700">' + e + '</td><td class="px-3 py-2 text-sm text-center text-slate-700">' + n + '</td><td class="px-3 py-2 text-sm font-medium text-slate-800">' + count + '</td><td class="px-3 py-2 text-sm text-slate-500">' + pct + '%</td></tr>');
    });
  }

  var sortedTickets = tickets.slice().sort(function (a, b) {
    var ka = getTicketSortKey(a, chartKey);
    var kb = getTicketSortKey(b, chartKey);
    if (ka < kb) return -1;
    if (ka > kb) return 1;
    return 0;
  });

  var ticketRows = sortedTickets.slice(0, 200).map(function (t, idx) {
    var name = (t.ticketName || '').slice(0, 50);
    if (t.ticketName && t.ticketName.length > 50) name += '…';
    var sortKey = getTicketSortKey(t, chartKey);
    return '<tr class="hubspot-chart-modal-ticket-row border-b border-slate-100 hover:bg-slate-50 cursor-pointer" data-idx="' + (tickets.indexOf(t)) + '">' +
      '<td class="px-3 py-2 text-sm font-mono">' + (dom && dom.escapeHtml ? dom.escapeHtml(t.ticketId || '') : escapeAttr(t.ticketId || '')) + '</td>' +
      '<td class="px-3 py-2 text-sm text-slate-600">' + (dom && dom.escapeHtml ? dom.escapeHtml(sortKey) : escapeAttr(sortKey)) + '</td>' +
      '<td class="px-3 py-2 text-sm">' + (dom && dom.escapeHtml ? dom.escapeHtml(t.status || '') : escapeAttr(t.status || '')) + '</td>' +
      '<td class="px-3 py-2 text-sm text-slate-600 max-w-[200px] truncate" title="' + escapeAttr(t.ticketName || '') + '">' + (dom && dom.escapeHtml ? dom.escapeHtml(name) : escapeAttr(name)) + '</td>' +
      '</tr>';
  });

  var breakdownHeader = chartKey === 'dayShift'
    ? '<thead class="bg-slate-100"><tr><th class="px-3 py-2 text-left text-sm font-semibold text-slate-700">Day</th><th class="px-3 py-2 text-center text-sm font-semibold text-slate-700" title="07:00–15:00">Morning</th><th class="px-3 py-2 text-center text-sm font-semibold text-slate-700" title="15:00–23:00">Evening</th><th class="px-3 py-2 text-center text-sm font-semibold text-slate-700" title="23:00–07:00">Night</th><th class="px-3 py-2 text-sm font-semibold text-slate-700">Total</th><th class="px-3 py-2 text-sm font-semibold text-slate-700">%</th></tr></thead>'
    : '<thead class="bg-slate-100"><tr><th class="px-3 py-2 text-left text-sm font-semibold text-slate-700">Label</th><th class="px-3 py-2 text-sm font-semibold text-slate-700">Count</th><th class="px-3 py-2 text-sm font-semibold text-slate-700">%</th></tr></thead>';

  body.innerHTML =
    '<div class="mb-4" style="height: 400px;"><canvas id="hubspotChartModalCanvas"></canvas></div>' +
    '<h4 class="text-sm font-semibold text-slate-700 mb-2">Data breakdown</h4>' +
    '<div class="overflow-x-auto mb-6"><table class="w-full text-left">' + breakdownHeader + '<tbody>' + (breakdownRows.length > 0 ? breakdownRows.join('') : '<tr><td class="px-3 py-2 text-sm text-slate-500" colspan="' + (chartKey === 'dayShift' ? '6' : '3') + '">No data</td></tr>') + '</tbody></table></div>' +
    '<h4 class="text-sm font-semibold text-slate-700 mb-2">Tickets (sorted by ' + (dom && dom.escapeHtml ? dom.escapeHtml(title) : escapeAttr(title)) + ', top 200)</h4>' +
    '<div class="overflow-x-auto"><table class="w-full text-left"><thead class="bg-slate-100"><tr><th class="px-3 py-2 text-left text-sm font-semibold text-slate-700">Ticket ID</th><th class="px-3 py-2 text-left text-sm font-semibold text-slate-700">' + (chartKey === 'dayShift' ? 'Day / Shift' : 'Category') + '</th><th class="px-3 py-2 text-sm font-semibold text-slate-700">Status</th><th class="px-3 py-2 text-left text-sm font-semibold text-slate-700">Name</th></tr></thead><tbody>' + ticketRows.join('') + '</tbody></table></div>';

  if (chartConfig) {
    var canvas = body.querySelector('#hubspotChartModalCanvas');
    if (canvas) {
      chartModalInstance = new Chart(canvas, chartConfig);
    }
  }

  modal.classList.remove('hidden');
  modal.classList.add('flex');
  modal.setAttribute('aria-hidden', 'false');

  function closeModal() {
    destroyChartModalChart();
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    modal.setAttribute('aria-hidden', 'true');
  }
  if (closeBtn) closeBtn.onclick = closeModal;
  modal.onclick = function (e) { if (e.target === modal) closeModal(); };
  modal.onkeydown = function (e) { if (e.key === 'Escape') closeModal(); };

  var modalTicketRows = body.querySelectorAll('.hubspot-chart-modal-ticket-row');
  modalTicketRows.forEach(function (row) {
    row.addEventListener('click', function () {
      var idx = parseInt(row.getAttribute('data-idx'), 10);
      var t = filteredTickets[idx];
      if (t) {
        closeModal();
        showTicketModal(container, t);
      }
    });
  });
}

function runAnalyze(container) {
  var r = root(container);
  var textarea = byId('hubspotInput', r);
  var result = parser ? parser.parseHubspotCsv(textarea ? textarea.value : '') : { tickets: [], errors: [] };
  ticketsState = result.tickets || [];
  runDashboardFromTickets(container);
}

function runDashboardFromTickets(container) {
  var r = root(container);
  var searchInput = byId('hubspotSearch', r);
  var dateFrom = byId('hubspotDateFrom', r);
  var dateTo = byId('hubspotDateTo', r);
  var term = searchInput ? searchInput.value : '';
  var from = dateFrom ? dateFrom.value : '';
  var to = dateTo ? dateTo.value : '';
  var filtered = filterTickets(ticketsState, term, from, to);
  updateDashboard(container, filtered);
}

function applySearch(container) {
  var r = root(container);
  var searchInput = byId('hubspotSearch', r);
  var dateFrom = byId('hubspotDateFrom', r);
  var dateTo = byId('hubspotDateTo', r);
  var term = searchInput ? searchInput.value : '';
  var from = dateFrom ? dateFrom.value : '';
  var to = dateTo ? dateTo.value : '';
  var filtered = filterTickets(ticketsState, term, from, to);
  updateDashboard(container, filtered);
}

function render() {
  return `
    <div class="relative">
      <button type="button" id="hubspotRefreshBtn" class="absolute top-0 right-0 p-2.5 rounded-lg text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 transition font-medium" title="Reset all"><i class="fas fa-sync-alt text-base"></i></button>
      <h2 class="text-xl font-bold text-slate-800 mb-2 pr-10">Statistics - Hubspot</h2>
      <p class="text-slate-600 text-sm mb-4">Paste HubSpot tickets CSV below, or load from file export.</p>
      <textarea id="hubspotInput" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:ring-2 focus:ring-primary focus:border-primary font-mono text-sm resize-none" rows="10" placeholder="Paste HubSpot tickets CSV here..."></textarea>
      <div class="mt-4 pt-4 border-t border-slate-200 flex flex-wrap gap-2 items-center">
        <button type="button" id="hubspotAnalyzeBtn" class="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 text-sm font-medium transition shadow-sm"><i class="fas fa-chart-bar"></i> Analyze</button>
        <button type="button" id="hubspotDemoBtn" class="inline-flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 px-5 py-2.5 text-sm font-medium transition shadow-sm" title="Load sample HubSpot tickets"><i class="fas fa-magic"></i> Load Demo</button>
        <button type="button" id="hubspotCsvBtn" class="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 px-5 py-2.5 text-sm font-medium transition shadow-sm" title="Load from CSV file"><i class="fas fa-file-csv"></i> Load from CSV</button>
        <input type="file" id="hubspotCsvInput" accept=".csv,text/csv" class="hidden" />
        <button type="button" id="hubspotClearBtn" class="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-5 py-2.5 text-sm font-medium transition shadow-sm"><i class="fas fa-trash-alt"></i> Clear</button>
      </div>

      <div id="hubspotEmpty" class="mt-6 p-6 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 text-center">
        <i class="fas fa-chart-pie text-4xl mb-2 text-slate-400"></i>
        <p class="m-0">Paste HubSpot CSV and click Analyze to see the dashboard.</p>
      </div>

      <div id="hubspotDashboard" class="mt-6 hidden">
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div class="text-2xl font-bold text-indigo-600" id="hubspotKpiTotal">0</div>
            <div class="text-sm text-slate-600">Total Tickets</div>
          </div>
          <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div class="text-2xl font-bold text-indigo-600" id="hubspotKpiStatuses">0</div>
            <div class="text-sm text-slate-600">Statuses</div>
          </div>
          <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div class="text-2xl font-bold text-indigo-600" id="hubspotKpiPipelines">0</div>
            <div class="text-sm text-slate-600">Pipelines</div>
          </div>
          <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div class="text-sm font-bold text-slate-800 truncate" id="hubspotKpiRange" title="">—</div>
            <div class="text-sm text-slate-600">Date Range</div>
          </div>
        </div>

        <div class="mb-6 p-4 rounded-xl border border-slate-200 bg-slate-50">
          <label class="block text-sm font-semibold text-slate-700 mb-2"><i class="fas fa-search mr-1"></i> Search</label>
          <div class="flex flex-wrap gap-2">
            <input type="text" id="hubspotSearch" placeholder="Search ticket name, ID, status, owner, type…" class="flex-1 min-w-[200px] rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-primary focus:border-primary" autocomplete="off" />
            <input type="date" id="hubspotDateFrom" class="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-primary focus:border-primary" title="From date" />
            <input type="date" id="hubspotDateTo" class="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-primary focus:border-primary" title="To date" />
            <button type="button" id="hubspotSearchBtn" class="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 text-sm font-medium transition"><i class="fas fa-filter"></i> Filter</button>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div class="rounded-xl border border-slate-200 bg-white p-4 cursor-pointer hover:ring-2 hover:ring-indigo-200 transition" data-chart="time">
            <h4 class="text-sm font-semibold text-slate-800 mb-3">Tickets over time</h4>
            <div class="chart-container" style="height: 220px;"><canvas id="hubspotChartTime"></canvas></div>
          </div>
          <div class="rounded-xl border border-slate-200 bg-white p-4 cursor-pointer hover:ring-2 hover:ring-indigo-200 transition" data-chart="status">
            <h4 class="text-sm font-semibold text-slate-800 mb-3">By status</h4>
            <div class="chart-container" style="height: 220px;"><canvas id="hubspotChartStatus"></canvas></div>
          </div>
          <div class="rounded-xl border border-slate-200 bg-white p-4 cursor-pointer hover:ring-2 hover:ring-indigo-200 transition" data-chart="type">
            <h4 class="text-sm font-semibold text-slate-800 mb-3">By ticket type</h4>
            <div class="chart-container" style="height: 220px;"><canvas id="hubspotChartType"></canvas></div>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div class="rounded-xl border border-slate-200 bg-white p-4 cursor-pointer hover:ring-2 hover:ring-indigo-200 transition" data-chart="owner">
            <h4 class="text-sm font-semibold text-slate-800 mb-3">By owner</h4>
            <div class="chart-container" style="height: 220px;"><canvas id="hubspotChartOwner"></canvas></div>
          </div>
          <div class="rounded-xl border border-slate-200 bg-white p-4 cursor-pointer hover:ring-2 hover:ring-indigo-200 transition" data-chart="dayOfWeek">
            <h4 class="text-sm font-semibold text-slate-800 mb-3">By day of week</h4>
            <div class="chart-container" style="height: 220px;"><canvas id="hubspotChartDayOfWeek"></canvas></div>
          </div>
          <div class="rounded-xl border border-slate-200 bg-white p-4 cursor-pointer hover:ring-2 hover:ring-indigo-200 transition" data-chart="shift">
            <h4 class="text-sm font-semibold text-slate-800 mb-3">By shift</h4>
            <div class="chart-container" style="height: 220px;"><canvas id="hubspotChartShift"></canvas></div>
          </div>
        </div>

        <div class="rounded-xl border border-slate-200 bg-white p-4 mb-6 cursor-pointer hover:ring-2 hover:ring-indigo-200 transition" data-chart="dayShift">
          <h4 class="text-sm font-semibold text-slate-800 mb-3">Manager view: tickets by day and shift</h4>
          <p class="text-xs text-slate-500 mb-2">See which day and shift combinations are busiest (Morning 07:00–15:00, Evening 15:00–23:00, Night 23:00–07:00)</p>
          <div class="chart-container" style="height: 280px;"><canvas id="hubspotChartDayShift"></canvas></div>
        </div>

        <div class="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <h4 class="text-sm font-semibold text-slate-800 px-4 py-3 border-b border-slate-200">Tickets table (top 100)</h4>
          <p class="text-xs text-slate-500 px-4 pb-2">Click a row to view full ticket details</p>
          <div class="overflow-x-auto">
            <table class="w-full text-left">
              <thead class="bg-slate-100 border-b border-slate-200">
                <tr>
                  <th class="px-3 py-2 text-sm font-semibold text-slate-700">Ticket ID</th>
                  <th class="px-3 py-2 text-sm font-semibold text-slate-700">Create date</th>
                  <th class="px-3 py-2 text-sm font-semibold text-slate-700">Status</th>
                  <th class="px-3 py-2 text-sm font-semibold text-slate-700">Pipeline</th>
                  <th class="px-3 py-2 text-sm font-semibold text-slate-700">Ticket type</th>
                  <th class="px-3 py-2 text-sm font-semibold text-slate-700">Name</th>
                  <th class="px-3 py-2 text-sm font-semibold text-slate-700">Owner</th>
                  <th class="px-3 py-2 text-sm font-semibold text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody id="hubspotTableBody"></tbody>
            </table>
          </div>
        </div>
      </div>

      <div id="hubspotTicketModal" class="fixed inset-0 z-50 hidden items-center justify-center bg-black/50 backdrop-blur-sm p-4 transition duration-200" aria-hidden="true">
        <div class="bg-white rounded-xl shadow-2xl ring-2 ring-slate-200/50 max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col" role="dialog" aria-modal="true" aria-labelledby="hubspotTicketModalTitle">
          <div class="flex items-center justify-between px-4 py-3 border-b border-slate-200 border-l-4 border-l-indigo-500">
            <div class="flex items-center gap-3 flex-wrap">
              <h3 id="hubspotTicketModalTitle" class="text-lg font-semibold text-slate-800">Ticket details</h3>
              <span id="hubspotTicketModalStatus" class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"></span>
            </div>
            <button type="button" id="hubspotTicketModalClose" class="p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition" aria-label="Close"><i class="fas fa-times"></i></button>
          </div>
          <div id="hubspotTicketModalBody" class="flex-1 overflow-y-auto p-4 space-y-4"></div>
        </div>
      </div>

      <div id="hubspotChartModal" class="fixed inset-0 z-50 hidden items-center justify-center bg-black/50 backdrop-blur-sm p-4 transition duration-200" aria-hidden="true">
        <div class="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[95vh] overflow-hidden flex flex-col">
          <div class="flex items-center justify-between px-4 py-3 border-b border-slate-200">
            <h3 id="hubspotChartModalTitle" class="text-lg font-semibold text-slate-800">Chart details</h3>
            <button type="button" id="hubspotChartModalClose" class="p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition" aria-label="Close"><i class="fas fa-times"></i></button>
          </div>
          <div id="hubspotChartModalBody" class="flex-1 overflow-y-auto p-4"></div>
        </div>
      </div>
    </div>
  `;
}

function mount(container, context) {
  var r = root(container);
  var refreshBtn = byId('hubspotRefreshBtn', r);
  var analyzeBtn = byId('hubspotAnalyzeBtn', r);
  var demoBtn = byId('hubspotDemoBtn', r);
  var clearBtn = byId('hubspotClearBtn', r);
  var searchBtn = byId('hubspotSearchBtn', r);
  var textarea = byId('hubspotInput', r);
  var searchInput = byId('hubspotSearch', r);

  function doRefresh() {
    if (textarea) textarea.value = '';
    ticketsState = [];
    var dashboard = r.querySelector('#hubspotDashboard');
    var empty = r.querySelector('#hubspotEmpty');
    if (dashboard) dashboard.classList.add('hidden');
    if (empty) empty.classList.remove('hidden');
    destroyCharts();
  }

  function doAnalyze() {
    runAnalyze(container);
  }

  function doDemo() {
    if (textarea) textarea.value = DEMO_HUBSPOT_CSV;
  }

  function doClear() {
    if (textarea) textarea.value = '';
    doRefresh();
  }

  function doSearch() {
    applySearch(container);
  }

  function doLoadCsv() {
    var csvInput = byId('hubspotCsvInput', r);
    if (csvInput) csvInput.click();
  }

  function doCsvFileChange(e) {
    var file = e.target && e.target.files && e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (ev) {
      var csvText = ev.target && ev.target.result;
      if (!csvText || !parser) return;
      var result = parser.parseHubspotCsv(csvText);
      ticketsState = result.tickets || [];
      if (result.errors && result.errors.length > 0) {
        console.warn('HubSpot CSV parse warnings:', result.errors);
      }
      runDashboardFromTickets(container);
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  }

  if (refreshBtn) refreshBtn.addEventListener('click', doRefresh);
  if (analyzeBtn) analyzeBtn.addEventListener('click', doAnalyze);
  if (demoBtn) demoBtn.addEventListener('click', doDemo);
  if (clearBtn) clearBtn.addEventListener('click', doClear);
  if (searchBtn) searchBtn.addEventListener('click', doSearch);
  var csvBtn = byId('hubspotCsvBtn', r);
  var csvInput = byId('hubspotCsvInput', r);
  if (csvBtn) csvBtn.addEventListener('click', doLoadCsv);
  if (csvInput) csvInput.addEventListener('change', doCsvFileChange);

  if (searchInput) {
    searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') doSearch();
    });
  }

  r.addEventListener('click', function (e) {
    var card = e.target && e.target.closest ? e.target.closest('[data-chart]') : null;
    if (!card) return;
    var key = card.getAttribute('data-chart');
    if (!key || filteredTickets.length === 0) return;
    showChartModal(container, key, filteredTickets);
  });
}

function unmount() {
  destroyCharts();
  destroyChartModalChart();
  ticketsState = [];
  filteredTickets = [];
}

  var statisticsHubspotView = {
    route: 'statistics-hubspot',
    navLabel: 'Statistics - Hubspot',
    render: render,
    mount: mount,
    unmount: unmount
  };

  window.MonitorToolsViews = window.MonitorToolsViews || {};
  window.MonitorToolsViews.statisticsHubspotView = statisticsHubspotView;
})();

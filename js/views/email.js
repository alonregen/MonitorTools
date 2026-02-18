/**
 * Email Generator – from Nested_Search. TSV payout data → emails by gateway (alert blocks + table).
 * IDs: #payoutData, #payoutsForm, #output. showAlert inserts into #payoutsForm.
 */
var dom = window.App.dom;

function root(container) {
  return container || document;
}

function byId(id, container) {
  const r = root(container);
  return r.getElementById ? r.getElementById(id) : r.querySelector('[id="' + id + '"]');
}

function render() {
  return `
    <h2 class="text-xl font-bold text-slate-800 mb-4">Payouts Email Generator</h2>
    <form id="payoutsForm">
      <label for="payoutData" class="block text-sm font-medium text-slate-700 mb-1">Paste Payout Data:</label>
      <textarea id="payoutData" rows="10" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:ring-2 focus:ring-primary focus:border-primary font-mono text-sm resize-none" placeholder="Paste your payout data here..."></textarea>
      <div class="mt-4 pt-4 border-t border-slate-200">
        <button type="button" class="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 text-sm font-medium transition shadow-sm" id="generateEmailsBtn"><i class="fas fa-envelope"></i> Generate Email Content</button>
      </div>
    </form>
    <div id="output" class="mt-6 email-output space-y-4"></div>
  `;
}

function parsePayoutData(data) {
  const lines = data.split('\n');
  const payouts = [];
  for (let i = 1; i < lines.length; i++) {
    const columns = lines[i].split('\t');
    if (columns.length >= 11) {
      payouts.push({
        gatewayName: columns[3],
        payoutToken: columns[1],
        externalId: columns[2],
        createdDate: columns[6],
        amount: columns[10]
      });
    }
  }
  return payouts;
}

function generateEmailsByGateway(payouts) {
  const emails = {};
  payouts.forEach(payout => {
    if (!emails[payout.gatewayName]) {
      emails[payout.gatewayName] = '<div class="rounded-xl border border-slate-200 bg-indigo-50/50 p-4 shadow-sm" role="alert"><h4 class="text-lg font-semibold text-slate-800 mb-2">' + dom.escapeHtml(payout.gatewayName) + '</h4><p class="text-slate-600 text-sm mb-3">Dear Team,<br>I hope this email finds you well.<br>May you please assist us and clarify for us what is the status of the following payouts for ' + dom.escapeHtml(payout.gatewayName) + '?<br>In case it failed, please let us know what was the failure reason.<br>In case the payout is closed may you please provide us proof of deposit?</p><table class="w-full border-collapse border border-slate-300"><thead><tr class="bg-slate-100"><th class="border border-slate-300 px-3 py-2 text-left text-sm font-semibold">Payout Token</th><th class="border border-slate-300 px-3 py-2 text-left text-sm font-semibold">External Id</th><th class="border border-slate-300 px-3 py-2 text-left text-sm font-semibold">Created Date</th><th class="border border-slate-300 px-3 py-2 text-left text-sm font-semibold">Amount</th></tr></thead><tbody>';
    }
    emails[payout.gatewayName] += '<tr><td class="border border-slate-300 px-3 py-2 text-sm">' + dom.escapeHtml(payout.payoutToken) + '</td><td class="border border-slate-300 px-3 py-2 text-sm">' + dom.escapeHtml(payout.externalId) + '</td><td class="border border-slate-300 px-3 py-2 text-sm">' + dom.escapeHtml(payout.createdDate) + '</td><td class="border border-slate-300 px-3 py-2 text-sm">' + dom.escapeHtml(payout.amount) + '</td></tr>';
  });
  const result = [];
  for (const gatewayName in emails) {
    emails[gatewayName] += '</tbody></table><p class="text-slate-600 text-sm mt-3">Looking forward to your response.<br>Best Regards,</p></div>';
    result.push(emails[gatewayName]);
  }
  return result;
}

function showAlert(container, message) {
  const r = root(container);
  const form = byId('payoutsForm', r);
  const btn = form ? form.querySelector('#generateEmailsBtn') : null;
  if (!form) return;
  const alertDiv = document.createElement('div');
  alertDiv.className = 'mt-3 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm';
  alertDiv.setAttribute('role', 'alert');
  alertDiv.textContent = message;
  if (btn) form.insertBefore(alertDiv, btn);
  else form.appendChild(alertDiv);
  setTimeout(function () { alertDiv.remove(); }, 3000);
}

function generateEmails(container) {
  const r = root(container);
  const payoutDataEl = byId('payoutData', r);
  const outputDiv = byId('output', r);
  if (!payoutDataEl || !outputDiv) return;
  const payoutData = payoutDataEl.value.trim();
  if (!payoutData) {
    showAlert(container, 'Please paste payout data.');
    return;
  }
  const payouts = parsePayoutData(payoutData);
  if (payouts.length === 0) {
    showAlert(container, 'No valid payout data found.');
    return;
  }
  outputDiv.innerHTML = '';
  const emails = generateEmailsByGateway(payouts);
  emails.forEach(html => {
    outputDiv.innerHTML += html;
  });
}

function mount(container) {
  const r = root(container);
  const btn = byId('generateEmailsBtn', r);
  if (btn) btn.addEventListener('click', function () { generateEmails(container); });
}

var emailView = {
  route: 'email',
  navLabel: 'Email Generator',
  render: render,
  mount: mount
};
(function () { window.MonitorToolsViews = window.MonitorToolsViews || {}; window.MonitorToolsViews.emailView = emailView; })();

/**
 * Analyze Logs – from Nested_Search analyze.js.
 * #logInput → parseLogs (hits.hits), totalHits, occurrences, label counts, details table,
 * connectors service, generated email with copy/clear.
 */
var dom = window.App.dom;

function root(container) {
  return container || document;
}

function byId(id, container) {
  const r = root(container);
  return r.getElementById ? r.getElementById(id) : r.querySelector('[id="' + id + '"]');
}

var EXPLAINED_IMAGE_PATH = 'img/explained-opensearch-inspect.png';

function render() {
  return `
    <div class="relative">
    <button type="button" id="analyzeRefreshBtn" class="absolute top-0 right-0 p-2.5 rounded-lg text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 transition font-medium" title="Reset all"><i class="fas fa-sync-alt text-base"></i></button>
    <h2 class="text-xl font-bold text-slate-800 mb-2 pr-10">Log Analysis</h2>
    <div class="flex flex-wrap items-center gap-2 mb-2">
      <p class="text-slate-600 text-sm m-0">Paste your logs below:</p>
      <button type="button" id="logExplainBtn" class="inline-flex items-center justify-center w-7 h-7 rounded-full border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-indigo-600 transition" title="How to get logs from OpenSearch"><i class="fas fa-info-circle text-sm"></i></button>
      <div id="logExplainThumbnail" class="flex items-center gap-1.5">
        <img src="${EXPLAINED_IMAGE_PATH}" alt="OpenSearch Inspect guide" class="w-12 h-8 object-cover rounded border border-slate-200 cursor-pointer hover:ring-2 hover:ring-indigo-400 transition" id="logExplainThumbImg" title="Click to view full image">
      </div>
    </div>
    <textarea id="logInput" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:ring-2 focus:ring-primary focus:border-primary font-mono text-sm resize-none" rows="15" placeholder="OpenSearch -> Get all the hits for the operation ID -> Inspect > Response -> Copy button -> Paste your logs here..."></textarea>
    <div class="mt-4 pt-4 border-t border-slate-200">
      <button class="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 text-sm font-medium transition shadow-sm" type="button" id="analyzeBtn"><i class="fas fa-chart-line"></i> Analyze Logs</button>
      <button class="inline-flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 px-5 py-2.5 text-sm font-medium transition shadow-sm ml-2" type="button" id="demoBtn" title="Paste sample logs with anonymized data"><i class="fas fa-magic"></i> Demo</button>
      <button class="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-5 py-2.5 text-sm font-medium transition shadow-sm ml-2" type="button" id="clearBtn"><i class="fas fa-trash-alt"></i> Clear</button>
    </div>
    <div id="logExplainModal" class="hidden fixed inset-0 z-[999] flex items-center justify-center p-4" style="background:rgba(0,0,0,0.6)">
      <div class="relative max-w-4xl max-h-[90vh] w-full">
        <button type="button" id="logExplainModalClose" class="absolute -top-10 right-0 p-2 rounded-lg text-white hover:bg-white/20 transition" aria-label="Close"><i class="fas fa-times"></i></button>
        <img src="${EXPLAINED_IMAGE_PATH}" alt="How to get logs from OpenSearch Dashboards" class="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl">
      </div>
    </div>
    <div id="logOutput" class="mt-6">
      <pre id="analysisResults" class="text-sm text-slate-600">Results will appear here...</pre>
    </div>
    <div id="emailOutput" class="mt-6 hidden">
      <h4 class="text-lg font-semibold text-slate-800 mb-2">Generated Email:</h4>
      <pre id="generatedEmail"></pre>
    </div>
    </div>
  `;
}

/** Generate random UUID v4 */
function randomUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = Math.random() * 16 | 0;
    var v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/** Generate random hex string (e.g. for qm_ IDs) */
function randomHex(len) {
  var s = '';
  for (var i = 0; i < len; i++) s += '0123456789abcdef'[Math.floor(Math.random() * 16)];
  return s;
}

/** Pick random from array */
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Generate mock logs with anonymized PII for demo */
function generateDemoLogs() {
  var opId = randomUuid();
  var payId = randomUuid();
  var payToken = 'pay_' + randomHex(24);
  var orgId = 'org_' + randomHex(16);
  var pmId = 'pm_' + randomHex(24);
  var pmToken = 'pmt_' + randomHex(24);
  var refId = 'ref_' + randomHex(12);
  var ewalletId = 'ew_' + randomHex(24);
  var ewalletToken = 'ewt_' + randomHex(24);
  var custToken = 'cust_' + randomHex(24);
  var gateway = pick(['stripe_demo', 'braintree_sandbox', 'adyen_test', 'paypal_sandbox', 'checkout_demo']);
  var ip = '10.' + (Math.floor(Math.random() * 255) + 1) + '.' + (Math.floor(Math.random() * 255) + 1) + '.' + (Math.floor(Math.random() * 254) + 1);
  var email = 'demo_' + randomHex(8) + '@example.com';
  var phone = '+1' + (5000000000 + Math.floor(Math.random() * 999999999));
  var hostedUrl = 'https://demo.example.com/checkout/' + randomHex(16);
  var accessKey = 'ak_demo_' + randomHex(20);
  var secretKey = 'sk_demo_' + randomHex(32);
  var statementDesc = 'DEMO CHARGE ' + randomHex(6).toUpperCase();
  var pgpPlaceholder = '-----BEGIN PGP MESSAGE-----\nVersion: Demo\n\n' + randomHex(64) + '\n-----END PGP MESSAGE-----';

  var baseTs = Date.now() - 120000;
  var entries = [
    {
      time: new Date(baseTs).toISOString(),
      timestamp: baseTs,
      timestamp_ns: baseTs * 1e6,
      label: 'payment_service',
      level: 'verbose',
      message: 'Payment initiated',
      operation_id: opId,
      payment_id: payId,
      payment_token: payToken,
      payment_organization_id: orgId,
      payment_payment_method_id: pmId,
      payment_payment_method_token: pmToken,
      payment_reference_id: refId,
      payment_description: 'Demo payment',
      payment_statement_descriptor: statementDesc,
      payment_ewallet_id: ewalletId,
      ewallet_token: ewalletToken,
      customer_token: custToken,
      gateway_name: gateway,
      source_ip_address: ip,
      params: { payment_token: payToken, gateway_name: gateway, operation_id: opId }
    },
    {
      time: new Date(baseTs + 200).toISOString(),
      timestamp: baseTs + 200,
      label: gateway + '_connectors_service',
      level: 'verbose',
      message: 'RapydGatewayUtilitiesVault/makeRawRequest - options_data:',
      operation_id: opId,
      params: {
        method: 'POST',
        url: 'https://api.demo-gateway.com/v1/charge',
        json: true,
        body: { amount: 4999, currency: 'USD', payment_token: payToken }
      }
    },
    {
      time: new Date(baseTs + 450).toISOString(),
      timestamp: baseTs + 450,
      label: gateway + '_connectors_service',
      level: 'error',
      message: 'RapydGatewayUtilitiesVault/makeRawRequest - response=',
      operation_id: opId,
      payment_token: payToken,
      payment_status: 'failed',
      payment_failure_code: 'card_declined',
      payment_failure_message: 'Your card was declined. Please try a different payment method.',
      gateway_name: gateway,
      params: {
        statusCode: 402,
        body: {
          success: false,
          error: { code: 'card_declined', message: 'Card declined' },
          payment_token: payToken,
          gateway_name: gateway
        }
      }
    },
    {
      time: new Date(baseTs + 500).toISOString(),
      timestamp: baseTs + 500,
      label: 'payment_service',
      level: 'error',
      message: 'PAYMENT_FAILED',
      operation_id: opId,
      payment_token: payToken,
      payment_status: 'failed',
      payment_original_amount: 49.99,
      payment_currency_code: 'USD',
      payment_failure_code: 'card_declined',
      payment_failure_message: 'Your card was declined.',
      gateway_name: gateway,
      reference_id: refId,
      source_ip_address: ip,
      email: email,
      phone_number: phone,
      hosted_page_url: hostedUrl,
      params: {
        payment_token: payToken,
        gateway_name: gateway,
        access_key: accessKey,
        secret_key: '[REDACTED]',
        encrypted_data: pgpPlaceholder
      }
    }
  ];

  return JSON.stringify({
    hits: {
      total: entries.length,
      hits: entries.map(function (e) {
        return { _id: randomUuid(), _source: e };
      })
    }
  }, null, 2);
}

function collectAggregationBuckets(obj, out) {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj.buckets)) {
    obj.buckets.forEach(function (b) {
      if (b && typeof b === 'object') out.push(b);
    });
  }
  Object.keys(obj || {}).forEach(function (k) {
    if (k !== 'buckets' && obj[k] && typeof obj[k] === 'object') {
      collectAggregationBuckets(obj[k], out);
    }
  });
}

function parseLogs(logs) {
  if (!logs || typeof logs !== 'string' || !logs.trim()) {
    return { hits: [], error: 'No logs provided. Paste your OpenSearch response (Get all hits for operation ID).' };
  }
  try {
    const logData = JSON.parse(logs);
    const hits = logData.hits ? (logData.hits.hits || []) : [];
    const aggBuckets = [];
    if (logData.aggregations) collectAggregationBuckets(logData.aggregations, aggBuckets);
    return { hits: hits, aggregationBuckets: aggBuckets, error: null };
  } catch (e) {
    var msg = (e && e.message) ? e.message : String(e);
    if (msg.indexOf('position') !== -1) {
      var posMatch = msg.match(/position\s+(\d+)/);
      var pos = posMatch ? parseInt(posMatch[1], 10) : 0;
      var line = logs.slice(0, pos).split('\n').length;
      msg = 'Invalid JSON at around line ' + line + '. Check for missing commas, extra commas, unclosed brackets, or invalid characters.';
    } else {
      msg = 'Invalid JSON: ' + msg;
    }
    return { hits: [], aggregationBuckets: [], error: msg };
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
  operation_id: 'fas fa-fingerprint',
  instance_id: 'fas fa-server',
  payment_token: 'fas fa-credit-card',
  payment_status: 'fas fa-info-circle',
  payment_original_amount: 'fas fa-dollar-sign',
  payment_currency_code: 'fas fa-money-bill',
  payment_failure_code: 'fas fa-exclamation-triangle',
  payment_failure_message: 'fas fa-comment-dots',
  payment_method_type_type: 'fas fa-credit-card',
  payment_method: 'fas fa-credit-card',
  reference_id: 'fas fa-id-badge',
  gateway: 'fas fa-network-wired',
  payout_token: 'fas fa-credit-card',
  payout_status: 'fas fa-info-circle',
  payout_original_amount: 'fas fa-dollar-sign',
  payout_currency_code: 'fas fa-money-bill',
  payout_failure_code: 'fas fa-exclamation-triangle',
  payout_failure_message: 'fas fa-comment-dots',
  payout_method_type_type: 'fas fa-credit-card',
  quarantined_item_id: 'fas fa-shield-alt',
  refund_token: 'fas fa-credit-card'
};

var paymentFields = [
  'payment_token', 'payment_status', 'payment_original_amount', 'payment_currency_code',
  'payment_failure_code', 'payment_failure_message', 'payment_method_type_type'
];
var payoutFields = [
  'payout_token', 'payout_status', 'payout_original_amount', 'payout_currency_code',
  'payout_failure_code', 'payout_failure_message', 'payout_method_type_type'
];
var cardPaymentFields = [
  'payment_method', 'payment_status', 'payment_original_amount', 'payment_currency_code',
  'payment_failure_code', 'payment_failure_message'
];
var refundFields = ['refund_token'];
var sharedFields = ['reference_id', 'gateway', 'quarantined_item_id'];
var coreLogFields = ['operation_id', 'instance_id'];
var allDetailFields = coreLogFields.concat(paymentFields).concat(payoutFields).concat(['payment_method']).concat(refundFields).concat(sharedFields);

/** Fields to show last in the details table (operation_id, instance_id) */
var fieldsLastInTable = ['operation_id', 'instance_id'];

function hasCardPayment(uniqueDetails) {
  var pm = uniqueDetails.payment_method;
  return pm && String(pm).trim().toLowerCase().startsWith('card_');
}

function getVisibleFields(uniqueDetails) {
  var hasPayment = !!uniqueDetails.payment_token;
  var hasPayout = !!uniqueDetails.payout_token;
  var hasRefund = !!uniqueDetails.refund_token;
  var hasCard = hasCardPayment(uniqueDetails);
  var base = [];
  var rest;
  if (hasPayment && hasPayout && hasRefund && hasCard) rest = base.concat(paymentFields, payoutFields, cardPaymentFields, refundFields, sharedFields);
  else if (hasPayment && hasPayout && hasCard) rest = base.concat(paymentFields, payoutFields, cardPaymentFields, sharedFields);
  else if (hasPayout && hasRefund && hasCard) rest = base.concat(payoutFields, cardPaymentFields, refundFields, sharedFields);
  else if (hasPayment && hasRefund && hasCard) rest = base.concat(paymentFields, cardPaymentFields, refundFields, sharedFields);
  else if (hasPayment && hasPayout && hasRefund) rest = base.concat(paymentFields, payoutFields, refundFields, sharedFields);
  else if (hasPayment && hasPayout) rest = base.concat(paymentFields, payoutFields, sharedFields);
  else if (hasPayout && hasRefund) rest = base.concat(payoutFields, refundFields, sharedFields);
  else if (hasPayment && hasRefund) rest = base.concat(paymentFields, refundFields, sharedFields);
  else if (hasRefund && hasCard) rest = base.concat(cardPaymentFields, refundFields, sharedFields);
  else if (hasRefund) rest = base.concat(refundFields, sharedFields);
  else if (hasPayout && hasCard) rest = base.concat(payoutFields, cardPaymentFields, sharedFields);
  else if (hasPayout) rest = base.concat(payoutFields, sharedFields);
  else if (hasPayment && hasCard) rest = base.concat(paymentFields, cardPaymentFields, sharedFields);
  else if (hasCard) rest = base.concat(cardPaymentFields, sharedFields);
  else rest = base.concat(paymentFields, sharedFields);
  return rest.concat(fieldsLastInTable);
}

/** Params-structure keys used in Support/ParsedPayoutData and similar logs */
var PARAMS_PAYOUT_KEY_MAP = {
  payout_original_amount: ['amount'],
  payout_currency_code: ['currency'],
  payout_failure_code: ['gc_error'],
  payout_failure_message: ['gc_error'],
  payout_method_type_type: ['pomt', 'payment_method_type']
};

/** Params-structure keys used in Support/ParsedPaymentData and similar logs */
var PARAMS_PAYMENT_KEY_MAP = {
  payment_original_amount: ['amount'],
  payment_currency_code: ['currency'],
  payment_failure_code: ['gc_error'],
  payment_failure_message: ['failure_message', 'gc_error'],
  payment_method_type_type: ['pmt', 'payment_method_type']
};

function buildFieldRegexes(fieldName) {
  var keys = [];
  if (fieldName === 'gateway') {
    keys.push('gc_type', 'gateway_name');
  } else {
    keys.push(fieldName);
    var stripped = fieldName.replace(/^(payment_|payout_)/, '');
    if (fieldName.startsWith('payment_') && fieldName !== 'payment_token' && fieldName !== 'payment_method' && stripped !== 'status') {
      keys.push(stripped);
    }
    if (fieldName.startsWith('payout_') && fieldName !== 'payout_token' && stripped !== 'status') {
      keys.push(stripped);
    }
    if (fieldName.startsWith('refund_') && fieldName !== 'refund_token') {
      keys.push(fieldName.replace('refund_', ''));
    }
    if (fieldName === 'payment_method_type_type') {
      keys.push('payment_method_type');
    }
    if (PARAMS_PAYOUT_KEY_MAP[fieldName]) {
      keys = keys.concat(PARAMS_PAYOUT_KEY_MAP[fieldName]);
    }
    if (PARAMS_PAYMENT_KEY_MAP[fieldName]) {
      keys = keys.concat(PARAMS_PAYMENT_KEY_MAP[fieldName]);
    }
  }
  var regexes = [];
  keys.forEach(function (key) {
    regexes.push(new RegExp(key + ":\\s*'([^']+)'?"));
    regexes.push(new RegExp('"' + key + '"\\s*:\\s*"([^"]+)"'));
    regexes.push(new RegExp('"' + key + '"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)'));  // JSON numeric: "amount":15
    regexes.push(new RegExp(key + "=([^\\s,;&]+)"));
    regexes.push(new RegExp(key + ':\\s*([^\\s,;\\}\\]]+)'));
  });
  return regexes;
}

/** Parse item to object if it's a JSON string. */
function tryParseJsonItem(item) {
  if (typeof item === 'string') {
    try {
      return JSON.parse(item);
    } catch (e) { return null; }
  }
  return item && typeof item === 'object' ? item : null;
}

/** Extract first payout-like object from params (e.g. [[{amount,currency,pomt,gc_error,...}]] or [['{"pomt":...}' ]]). */
function extractFirstPayoutFromParams(params) {
  if (!params || typeof params !== 'object') return null;
  var arr = Array.isArray(params) ? params : [params];
  for (var i = 0; i < arr.length; i++) {
    var item = arr[i];
    var obj = tryParseJsonItem(item);
    if (obj && !Array.isArray(obj) && (obj.payout_token || obj.amount != null || obj.currency)) {
      return obj;
    }
    if (Array.isArray(item)) {
      var nested = extractFirstPayoutFromParams(item);
      if (nested) return nested;
    }
  }
  return null;
}

/** Extract first payment-like object from params (e.g. [[{"pmt","amount","currency",...}]] or [['{"pmt":...}' ]]). */
function extractFirstPaymentFromParams(params) {
  if (!params || typeof params !== 'object') return null;
  var arr = Array.isArray(params) ? params : [params];
  for (var i = 0; i < arr.length; i++) {
    var item = arr[i];
    var obj = tryParseJsonItem(item);
    if (obj && !Array.isArray(obj) && (obj.payment_token || obj.amount != null || obj.currency)) {
      return obj;
    }
    if (Array.isArray(item)) {
      var nested = extractFirstPaymentFromParams(item);
      if (nested) return nested;
    }
  }
  return null;
}

function extractUniqueDetails(hits) {
  var uniqueDetails = {};
  hits.forEach(function (hit) {
    var source = hit._source || hit;
    if (!source || typeof source !== 'object') return;

    allDetailFields.forEach(function (fieldName) {
      if (uniqueDetails[fieldName]) return;
      var val = source[fieldName];
      if (val != null && val !== '' && String(val).trim()) {
        var s = String(val).trim();
        if (s !== 'undefined' && s !== 'null' && s !== 'nil') {
          uniqueDetails[fieldName] = s;
        }
      }
    });

    var payoutFromParams = extractFirstPayoutFromParams(source.params);
    if (payoutFromParams) {
      if (payoutFromParams.amount != null) {
        var amt = String(payoutFromParams.amount);
        if (!uniqueDetails.payout_original_amount || uniqueDetails.payout_original_amount === '0') {
          uniqueDetails.payout_original_amount = amt;
        }
      }
      if (payoutFromParams.currency) {
        uniqueDetails.payout_currency_code = String(payoutFromParams.currency);
      }
      if (payoutFromParams.gc_error != null && payoutFromParams.gc_error !== '') {
        var err = String(payoutFromParams.gc_error);
        if (err !== 'null' && err !== 'undefined') {
          uniqueDetails.payout_failure_code = err;
          uniqueDetails.payout_failure_message = err;
        }
      }
      if (payoutFromParams.pomt) {
        uniqueDetails.payout_method_type_type = String(payoutFromParams.pomt);
      } else if (payoutFromParams.payment_method_type) {
        uniqueDetails.payout_method_type_type = String(payoutFromParams.payment_method_type);
      }
    }

    var paymentFromParams = extractFirstPaymentFromParams(source.params);
    if (paymentFromParams) {
      if (paymentFromParams.payment_token) {
        uniqueDetails.payment_token = String(paymentFromParams.payment_token);
      }
      if (paymentFromParams.amount != null) {
        var amt = String(paymentFromParams.amount);
        if (!uniqueDetails.payment_original_amount || uniqueDetails.payment_original_amount === '0') {
          uniqueDetails.payment_original_amount = amt;
        }
      }
      if (paymentFromParams.currency) {
        uniqueDetails.payment_currency_code = String(paymentFromParams.currency);
      }
      if (paymentFromParams.payment_status) {
        uniqueDetails.payment_status = String(paymentFromParams.payment_status);
      }
      if (paymentFromParams.gc_error != null && paymentFromParams.gc_error !== '' && String(paymentFromParams.gc_error) !== 'null') {
        var err = String(paymentFromParams.gc_error);
        if (err !== 'undefined') {
          uniqueDetails.payment_failure_code = err;
          uniqueDetails.payment_failure_message = err;
        }
      }
      if (paymentFromParams.failure_message != null && paymentFromParams.failure_message !== '' && String(paymentFromParams.failure_message) !== 'null') {
        var fm = String(paymentFromParams.failure_message);
        if (fm !== 'undefined') {
          uniqueDetails.payment_failure_message = fm;
          if (!uniqueDetails.payment_failure_code) uniqueDetails.payment_failure_code = fm;
        }
      }
      if (paymentFromParams.pmt) {
        uniqueDetails.payment_method_type_type = String(paymentFromParams.pmt);
      } else if (paymentFromParams.payment_method_type) {
        uniqueDetails.payment_method_type_type = String(paymentFromParams.payment_method_type);
      }
      if (paymentFromParams.gateway_name && String(paymentFromParams.gateway_name) !== 'null') {
        uniqueDetails.gateway = String(paymentFromParams.gateway_name);
      }
    }

    var searchTexts = [];
    if (source.params != null) {
      searchTexts.push(typeof source.params === 'string' ? source.params : JSON.stringify(source.params));
    }
    if (source.message) {
      searchTexts.push(source.message);
    }
    searchTexts.push(JSON.stringify(hit));
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

function buildOccurrenceDsl(details) {
  var compiler = window.App && window.App.queryCompiler;
  if (!compiler) return null;
  var conditions = [];
  if (details.label && details.label !== 'N/A') {
    conditions.push({ clause: 'must', field: 'label', operator: 'phrase', value: details.label });
  }
  if (details.level && details.level !== 'N/A') {
    conditions.push({ clause: 'must', field: 'level', operator: 'exact', value: details.level });
  }
  if (details.message && details.message !== 'N/A') {
    var msg = details.message.length > 500 ? details.message.slice(0, 500) : details.message;
    conditions.push({ clause: 'must', field: 'message', operator: 'phrase', value: msg });
  }
  if (conditions.length === 0) return null;
  return compiler.compile(conditions, 'now-1h');
}

function generateOccurrenceHtml(index, details, hit) {
  var isError = (details.level || '').toLowerCase() === 'error';
  var borderCls = isError ? 'border-red-200' : 'border-amber-200';
  var headerBg = isError ? 'bg-red-600' : 'bg-amber-600';
  var headerIcon = isError ? 'fa-times-circle' : 'fa-exclamation-triangle';
  var levelBadgeCls = isError ? 'bg-red-100 text-red-800' : 'bg-amber-200 text-amber-900';
  var dsl = buildOccurrenceDsl(details);
  var dslJson = dsl ? JSON.stringify(dsl, null, 2) : '';
  var copyText = 'Label: ' + (details.label || '') + '\nLevel: ' + (details.level || '') + '\nMessage: ' + (details.message || '') + '\nTime: ' + (details.time || '') + '\nParams: ' + (details.params || '');
  var html = '<div class="rounded-xl border-2 ' + borderCls + ' bg-white shadow-sm mb-4 overflow-hidden occurrence-card">' +
    '<div class="' + headerBg + ' text-white px-4 py-2 flex items-center justify-between">' +
      '<h5 class="font-semibold text-sm m-0"><i class="fas ' + headerIcon + ' mr-1"></i>Occurrence ' + (index + 1) + ' <i class="fas fa-exclamation-triangle ml-1"></i></h5>' +
      '<button type="button" class="occurrence-copy-btn inline-flex items-center gap-1 rounded-lg bg-white/20 hover:bg-white/30 px-2 py-1 text-xs font-medium transition" data-copy-text="' + escapeAttr(copyText) + '" title="Copy error details"><i class="fas fa-copy"></i> Copy</button>' +
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
      '</details>';
  if (dslJson) {
    html += '<details class="mt-3">' +
      '<summary class="cursor-pointer inline-flex items-center gap-1 rounded-lg bg-indigo-100 text-indigo-800 px-3 py-1.5 text-sm font-medium hover:bg-indigo-200"><i class="fas fa-code mr-1"></i> DSL query to filter</summary>' +
      '<div class="mt-2 flex gap-2 items-start">' +
        '<pre class="flex-1 p-3 rounded-lg bg-slate-900 text-slate-100 text-xs overflow-x-auto font-mono max-h-40 overflow-y-auto">' + dom.escapeHtml(dslJson) + '</pre>' +
        '<button type="button" class="occurrence-dsl-copy-btn shrink-0 inline-flex items-center gap-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-2 py-1.5 text-xs font-medium transition" data-copy-text="' + escapeAttr(dslJson) + '" title="Copy DSL"><i class="fas fa-copy"></i> Copy DSL</button>' +
      '</div>' +
    '</details>';
  }
  html += '</div></div>';
  return html;
}

function generateDetailsTable(uniqueDetails) {
  var fields = getVisibleFields(uniqueDetails);
  var seen = {};
  fields = fields.filter(function (f) { if (seen[f]) return false; seen[f] = true; return true; });
  var html = '<table class="w-full border-collapse border border-slate-300"><thead><tr class="bg-slate-100"><th class="border border-slate-300 px-3 py-2 text-left text-sm font-semibold">Field</th><th class="border border-slate-300 px-3 py-2 text-left text-sm font-semibold">Value</th></tr></thead><tbody>';
  fields.forEach(function (field) {
    var icon = fieldIcons[field] || 'fas fa-question-circle';
    var value = uniqueDetails[field] || 'N/A';
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

/** Extract log prefix from message (e.g. "RapydGatewayUtilitiesVault/makeRawRequest" from "RapydGatewayUtilitiesVault/makeRawRequest - options_data:") */
function extractLogPrefix(message) {
  if (!message || typeof message !== 'string') return null;
  var m = message.match(/^(.+?)\s+-\s+/);
  return m ? m[1].trim() : null;
}

/** Check if message is a response-type log */
function isResponseLog(message) {
  return message && / - response\b/.test(message);
}

/** Build map: logIndex -> responseIndex for each log that has a matching response (same prefix). */
function buildLogToResponseMap(events) {
  var map = {};
  var responses = [];
  var allWithPrefix = [];
  events.forEach(function (ev, i) {
    var msg = (ev.hit._source && ev.hit._source.message) || '';
    var prefix = extractLogPrefix(msg);
    var ts = ev.hit._source.timestamp || 0;
    if (prefix) {
      allWithPrefix.push({ index: i, prefix: prefix, timestamp: ts, isResponse: isResponseLog(msg) });
      if (isResponseLog(msg)) responses.push({ index: i, prefix: prefix, timestamp: ts });
    }
  });
  allWithPrefix.forEach(function (entry) {
    if (entry.isResponse) return;
    var candidates = responses.filter(function (r) { return r.prefix === entry.prefix; });
    var after = candidates.filter(function (r) { return r.timestamp >= entry.timestamp; });
    var chosen = after.length > 0
      ? after.reduce(function (a, b) { return a.timestamp <= b.timestamp ? a : b; })
      : (candidates.length > 0 ? candidates.reduce(function (a, b) { return Math.abs(a.timestamp - entry.timestamp) <= Math.abs(b.timestamp - entry.timestamp) ? a : b; }) : null);
    if (chosen) map[entry.index] = chosen.index;
  });
  return map;
}

function generateTimelineHtml(hits) {
  const events = buildTimelineEvents(hits);
  if (events.length === 0) return '<p class="text-slate-600 text-sm">No timeline events.</p>';
  const logToResponse = buildLogToResponseMap(events);
  let html = '<div class="log-timeline relative pl-6 border-l-2 border-slate-200 border-solid">';
  events.forEach((ev, idx) => {
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
    var labelVal = (s.label || 'N/A');
    var responseIndex = logToResponse[idx];
    html += '<div class="log-timeline-item relative mb-2" data-searchable="' + searchable + '" data-label="' + escapeAttr(labelVal) + '" data-log-index="' + idx + '">';
    html += '<span class="absolute -left-6 top-1.5 w-2.5 h-2.5 rounded-full ring-2 ' + dotClass + '" title="' + ev.type + '"></span>';
    html += '<details class="log-timeline-details rounded border shadow-sm ' + cardClass + '">';
    html += '<summary class="log-timeline-summary cursor-pointer p-2 list-none [&::-webkit-details-marker]:hidden">';
    html += '<span class="text-xs font-mono text-slate-500 whitespace-nowrap">' + dom.escapeHtml(time) + '</span>';
    html += '<span class="log-timeline-meta flex items-center gap-1.5 flex-wrap">';
    html += '<span class="rounded-full bg-slate-200 text-slate-800 px-2 py-0.5 text-xs font-medium">' + label + '</span>';
    if (isError) html += '<span class="rounded-full bg-red-600 text-white px-2 py-0.5 text-xs font-medium"><i class="fas fa-times-circle mr-1"></i>Error</span>';
    else if (isWarn) html += '<span class="rounded-full bg-amber-600 text-white px-2 py-0.5 text-xs font-medium"><i class="fas fa-exclamation-triangle mr-1"></i>Warning</span>';
    else if (isContext) html += '<span class="rounded-full bg-sky-200 text-sky-800 px-2 py-0.5 text-xs font-medium">Context</span>';
    html += '</span>';
    html += '<span class="log-timeline-msg text-sm text-slate-700 min-w-0" title="' + escapeAttr((s.message || '').slice(0, 200)) + '">' + msg + '</span>';
    html += '<span class="text-slate-400 text-xs whitespace-nowrap shrink-0">Click to expand</span>';
    html += '</summary>';
    html += '<div class="px-2 pb-2">' + fullLogHtml(ev.hit);
    if (responseIndex != null) {
      html += '<div class="mt-2 pt-2 border-t border-slate-200">';
      html += '<button type="button" class="go-to-response-btn inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 text-xs font-medium transition shadow-sm" data-response-index="' + responseIndex + '" title="Scroll to related response log"><i class="fas fa-arrow-right"></i> Go to response</button>';
      html += '</div>';
    }
    html += '</div>';
    html += '</details></div>';
  });
  html += '</div>';
  return html;
}

/** Build richer log context for AI Q&A (includes full messages, params) */
function buildLogContextForQA(hits, uniqueDetails, occurrences, sortedLabels, totalHits) {
  var parts = [];
  parts.push('=== LOG SUMMARY ===');
  parts.push('Total: ' + totalHits + ' entries.');
  var errorCount = 0, warnCount = 0;
  hits.forEach(function (h) {
    var l = (h._source.level || '').toLowerCase();
    if (l === 'error') errorCount++;
    else if (l === 'warning') warnCount++;
  });
  if (errorCount > 0) parts.push('Errors: ' + errorCount);
  if (warnCount > 0) parts.push('Warnings: ' + warnCount);
  if (sortedLabels && sortedLabels.length > 0) {
    parts.push('Labels: ' + sortedLabels.slice(0, 10).map(function (e) { return e[0] + '(' + e[1] + ')'; }).join(', '));
  }
  if (uniqueDetails && Object.keys(uniqueDetails).length > 0) {
    parts.push('Key details: ' + JSON.stringify(uniqueDetails));
  }
  if (occurrences && occurrences.length > 0) {
    parts.push('');
    parts.push('=== ERRORS & WARNINGS ===');
    occurrences.forEach(function (o, i) {
      parts.push('[' + (i + 1) + '] level=' + o.level + ' label=' + o.label + ' time=' + o.time);
      parts.push('message: ' + (o.message || '').slice(0, 300));
      if (o.params && o.params !== 'N/A') parts.push('params: ' + String(o.params).slice(0, 500));
    });
  }
  var ctx = parts.join('\n');
  return ctx.length > 6000 ? ctx.slice(0, 6000) + '\n...[truncated]' : ctx;
}

var FAVORITE_SEARCH_STORAGE_KEY = 'monitor_tools_favorite_searches';
var DEFAULT_FAVORITE_SEARCHES = ['makerawrequest', 'options_data', 'response', 'error'];

function getFavoriteSearches() {
  try {
    var raw = localStorage.getItem(FAVORITE_SEARCH_STORAGE_KEY);
    if (!raw) return [];
    var arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter(function (s) { return typeof s === 'string' && s.trim(); }) : [];
  } catch (e) { return []; }
}

function saveFavoriteSearches(arr) {
  try {
    localStorage.setItem(FAVORITE_SEARCH_STORAGE_KEY, JSON.stringify(arr));
  } catch (e) {}
}

/** Debounce helper for efficient real-time search */
function debounce(fn, ms) {
  var t;
  return function () {
    clearTimeout(t);
    t = setTimeout(fn, ms);
  };
}

/** Escape special regex chars for safe use in RegExp */
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Parse one segment: "quoted" = exact word/phrase, unquoted = substring match. Skips "OR" and "AND" (uppercase). */
function parseSearchSegment(segment) {
  var terms = [];
  var exactPhrases = [];
  var regex = /"([^"]*)"|(\S+)/g;
  var m;
  while ((m = regex.exec(segment)) !== null) {
    if (m[1] !== undefined) {
      var p = m[1].trim().toLowerCase();
      if (p) exactPhrases.push(p);
    } else if (m[2] && m[2] !== 'OR' && m[2] !== 'AND') terms.push(m[2].toLowerCase());
  }
  return { terms: terms, exactPhrases: exactPhrases };
}

/** Expand segment into one segment per term/phrase so "timeout al" -> [timeout], [al] not [timeout, al] */
function expandAndSegments(seg) {
  var out = [];
  seg.terms.forEach(function (t) { out.push({ terms: [t], exactPhrases: [] }); });
  seg.exactPhrases.forEach(function (p) { out.push({ terms: [], exactPhrases: [p] }); });
  return out;
}

/** Parse search query: "quoted" = exact match, unquoted = substring. Uppercase OR = logical OR, AND = all in same log. */
function parseSearchQuery(q) {
  var orParts = q.split(/\s+OR\s+/);
  var useOr = orParts.length > 1;
  var groups = [];
  orParts.forEach(function (orPart) {
    var andParts = orPart.split(/\s+AND\s+/);
    var andSegments = [];
    andParts.forEach(function (p) {
      var seg = parseSearchSegment(p.trim());
      andSegments = andSegments.concat(expandAndSegments(seg));
    });
    andSegments = andSegments.filter(function (g) {
      return g.terms.length > 0 || g.exactPhrases.length > 0;
    });
    if (andSegments.length > 0) groups.push({ andSegments: andSegments });
  });
  if (groups.length === 0 && orParts.length >= 1) {
    var fallback = parseSearchSegment(orParts[0].trim());
    var expanded = expandAndSegments(fallback).filter(function (g) {
      return g.terms.length > 0 || g.exactPhrases.length > 0;
    });
    if (expanded.length > 0) groups.push({ andSegments: expanded });
  }
  return { groups: groups, useOr: useOr };
}

/** Check if searchable text matches an exact phrase (word boundary for single word, exact string for multi-word) */
function matchesExactPhrase(searchable, phrase) {
  if (!phrase) return true;
  if (phrase.indexOf(' ') >= 0) return searchable.indexOf(phrase) !== -1;
  var re = new RegExp('\\b' + escapeRegex(phrase) + '\\b', 'i');
  return re.test(searchable);
}

/** Apply yellow highlight to search terms in timeline item HTML (only in text between tags) */
function highlightTermsInHtml(html, terms) {
  if (!terms || terms.length === 0) return html;
  var sorted = terms.slice().sort(function (a, b) { return b.length - a.length; });
  return html.replace(/>([^<]*)</g, function (full, text) {
    var highlighted = text;
    sorted.forEach(function (term) {
      var re = new RegExp('(' + escapeRegex(term) + ')', 'gi');
      highlighted = highlighted.replace(re, '<mark class="search-highlight">$1</mark>');
    });
    return '>' + highlighted + '<';
  });
}

/** Setup copy buttons for Errors & warnings occurrences */
function setupErrorsSectionCopyButtons() {
  var errorsBody = document.querySelector('.errors-section-body');
  if (!errorsBody || !dom.copyToClipboard) return;

  function handleCopy(btn, text) {
    if (!text) return;
    dom.copyToClipboard(text).then(function (ok) {
      if (ok && btn) {
        var orig = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
        setTimeout(function () { if (btn) btn.innerHTML = orig; }, 2000);
      }
    });
  }

  errorsBody.addEventListener('click', function (e) {
    var btn = e.target.closest('.occurrence-copy-btn, .occurrence-dsl-copy-btn');
    if (!btn) return;
    var text = btn.getAttribute('data-copy-text');
    if (text) handleCopy(btn, text);
  });
}

/** Setup "Go to response" button clicks – scroll to response log and expand it */
function setupGoToResponseButtons() {
  var wrapper = document.getElementById('logTimelineWrapper');
  if (!wrapper) return;
  wrapper.addEventListener('click', function (e) {
    var btn = e.target.closest('.go-to-response-btn');
    if (!btn) return;
    var responseIndex = btn.getAttribute('data-response-index');
    if (responseIndex == null) return;
    var target = wrapper.querySelector('.log-timeline-item[data-log-index="' + responseIndex + '"]');
    if (!target) return;
    target.classList.remove('timeline-search-hidden');
    var details = target.querySelector('.log-timeline-details');
    if (details) details.setAttribute('open', '');
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

/** Setup smart real-time search and label filters for Log flow timeline */
function setupTimelineSearch() {
  var input = document.getElementById('timelineSearchInput');
  var wrapper = document.getElementById('logTimelineWrapper');
  var countEl = document.getElementById('timelineSearchCount');
  if (!input || !wrapper) return;

  var items = wrapper.querySelectorAll('.log-timeline-item');
  var total = items.length;

  window._timelineFilterFn = function filterTimeline() {
    var q = (input.value || '').trim();
    var parsed = parseSearchQuery(q);
    var groups = parsed.groups;
    var useOr = parsed.useOr;
    var allHighlightTerms = [];
    groups.forEach(function (g) {
      g.andSegments.forEach(function (s) { allHighlightTerms = allHighlightTerms.concat(s.terms, s.exactPhrases); });
    });
    var labelsIn = [];
    var labelsOut = [];
    var chips = document.querySelectorAll('.timeline-label-chip');
    chips.forEach(function (chip) {
      var s = chip.getAttribute('data-state');
      var lbl = chip.getAttribute('data-label');
      if (s === 'in') labelsIn.push(lbl);
      else if (s === 'out') labelsOut.push(lbl);
    });

    var visible = 0;
    items.forEach(function (item) {
      var searchable = (item.getAttribute('data-searchable') || '').toLowerCase();
      var itemLabel = item.getAttribute('data-label') || '';
      var groupMatches = groups.map(function (g) {
        return g.andSegments.every(function (seg) {
          var termsMatch = seg.terms.length === 0 || seg.terms.every(function (t) { return searchable.indexOf(t) !== -1; });
          var exactMatch = seg.exactPhrases.length === 0 || seg.exactPhrases.every(function (p) { return matchesExactPhrase(searchable, p); });
          return termsMatch && exactMatch;
        });
      });
      var textMatch = groups.length === 0 || (useOr ? groupMatches.some(Boolean) : groupMatches.every(Boolean));
      var labelMatch = true;
      if (labelsIn.length > 0) labelMatch = labelsIn.indexOf(itemLabel) !== -1;
      if (labelsOut.length > 0 && labelMatch) labelMatch = labelsOut.indexOf(itemLabel) === -1;
      var match = textMatch && labelMatch;
      item.classList.toggle('timeline-search-hidden', !match);
      if (match) visible++;

      if (!item.dataset.originalHtml) item.dataset.originalHtml = item.innerHTML;
      var baseHtml = item.dataset.originalHtml;
      item.innerHTML = allHighlightTerms.length > 0 ? highlightTermsInHtml(baseHtml, allHighlightTerms) : baseHtml;
    });

    var hasFilter = q || labelsIn.length > 0 || labelsOut.length > 0;
    if (hasFilter && countEl) {
      countEl.classList.remove('hidden');
      countEl.textContent = 'Showing ' + visible + ' of ' + total + ' logs';
    } else if (countEl) {
      countEl.classList.add('hidden');
    }
  };

  input.addEventListener('input', debounce(window._timelineFilterFn, 80));
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      input.value = '';
      window._timelineFilterFn();
      input.blur();
    }
  });

  var favContainer = document.getElementById('timelineFavorites');
  if (favContainer) {
    favContainer.addEventListener('click', function (e) {
      var chip = e.target.closest('.timeline-favorite-chip');
      var removeBtn = e.target.closest('.timeline-favorite-remove');
      if (removeBtn) {
        var term = removeBtn.getAttribute('data-remove-term');
        if (term) {
          var user = getFavoriteSearches().filter(function (t) { return t !== term; });
          saveFavoriteSearches(user);
          var wrap = removeBtn.closest('.timeline-favorite-chip-wrap');
          if (wrap) wrap.remove();
        }
        return;
      }
      if (chip) {
        var term = chip.getAttribute('data-search-term');
        if (term) {
          input.value = term;
          input.focus();
          if (window._timelineFilterFn) window._timelineFilterFn();
        }
      }
    });
  }

  var addBtn = document.getElementById('timelineFavoriteAddBtn');
  var addInput = document.getElementById('timelineFavoriteInput');
  if (addBtn && addInput && favContainer) {
    function doAdd() {
      var term = (addInput.value || '').trim().toLowerCase();
      if (!term) return;
      var defaults = DEFAULT_FAVORITE_SEARCHES;
      var user = getFavoriteSearches();
      if (defaults.indexOf(term) !== -1 || user.indexOf(term) !== -1) {
        addInput.value = '';
        return;
      }
      user.push(term);
      saveFavoriteSearches(user);
      var wrap = document.createElement('span');
      wrap.className = 'timeline-favorite-chip-wrap inline-flex items-center rounded-lg bg-indigo-50 border border-indigo-200';
      wrap.innerHTML = '<button type="button" class="timeline-favorite-chip inline-flex items-center px-2.5 py-1 text-xs font-medium text-indigo-800 hover:bg-indigo-100 transition cursor-pointer" data-search-term="' + escapeAttr(term) + '" data-user-favorite="1">' + dom.escapeHtml(term) + '</button><button type="button" class="timeline-favorite-remove px-1.5 py-1 text-indigo-600 hover:text-red-600 hover:bg-red-50 rounded-r transition cursor-pointer" data-remove-term="' + escapeAttr(term) + '" title="Remove favorite"><i class="fas fa-times text-xs"></i></button>';
      favContainer.insertBefore(wrap, addInput.parentElement);
      addInput.value = '';
    }
    addBtn.addEventListener('click', doAdd);
    addInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); doAdd(); }
    });
  }
}

/** Setup label filter chips – click cycles: neutral → in (filter in) → out (filter out) → neutral */
function setupLabelFilters() {
  var chips = document.querySelectorAll('.timeline-label-chip');
  if (!chips.length) return;

  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      var s = chip.getAttribute('data-state') || 'neutral';
      var next = s === 'neutral' ? 'out' : s === 'out' ? 'in' : 'neutral';
      chip.setAttribute('data-state', next);
      chip.classList.remove('bg-slate-100', 'border-slate-300', 'bg-emerald-100', 'border-emerald-400', 'text-emerald-800', 'bg-red-100', 'border-red-400', 'text-red-800', 'timeline-label-chip--out');
      if (next === 'neutral') {
        chip.classList.add('bg-slate-100', 'border-slate-300');
        chip.title = 'Click: filter out → filter in → clear';
      } else if (next === 'in') {
        chip.classList.add('bg-emerald-100', 'border-emerald-400', 'text-emerald-800');
        chip.title = 'Filtering in – click to clear';
      } else {
        chip.classList.add('bg-red-100', 'border-red-400', 'text-red-800', 'timeline-label-chip--out');
        chip.title = 'Filtering out – click to include';
      }
      if (window._timelineFilterFn) window._timelineFilterFn();
    });
  });
}

/** Setup Expand all / Collapse all button for analyze sections */
function setupExpandCollapseAll() {
  var btn = document.getElementById('expandCollapseAllBtn');
  if (!btn) return;

  btn.addEventListener('click', function () {
    var sections = document.querySelectorAll('.analyze-results-wrapper .analyze-section');
    var isExpanded = btn.querySelector('i').classList.contains('fa-chevron-up');

    sections.forEach(function (el) {
      if (isExpanded) {
        el.removeAttribute('open');
      } else {
        el.setAttribute('open', '');
      }
    });

    if (isExpanded) {
      btn.innerHTML = '<i class="fas fa-chevron-down"></i> Expand all';
    } else {
      btn.innerHTML = '<i class="fas fa-chevron-up"></i> Collapse all';
    }
  });
}

/** Setup timeline fullscreen expand/collapse */
function setupTimelineFullscreen() {
  var expandBtn = document.getElementById('timelineExpandBtn');
  var contentEl = document.getElementById('timelineSectionContent');
  var detailsEl = document.querySelector('.analyze-section-timeline');
  if (!expandBtn || !contentEl || !detailsEl) return;

  var overlay = null;

  var escapeHandler = null;

  function createOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'timelineFullscreenOverlay';
    overlay.className = 'hidden';
    overlay.setAttribute('tabindex', '-1');
    overlay.innerHTML = '<div class="timeline-fs-header">' +
      '<h3 class="text-lg font-semibold text-indigo-900"><i class="fas fa-stream mr-2"></i> Log flow timeline</h3>' +
      '<button type="button" id="timelineCloseFsBtn" class="inline-flex items-center gap-2 rounded-lg bg-slate-600 hover:bg-slate-700 text-white px-4 py-2 text-sm font-medium transition" title="Exit full screen"><i class="fas fa-compress"></i> Exit full screen</button>' +
      '</div>' +
      '<div class="timeline-fs-content"></div>';
    document.body.appendChild(overlay);

    var closeBtn = overlay.querySelector('#timelineCloseFsBtn');
    if (closeBtn) {
      closeBtn.addEventListener('click', function (e) {
        e.preventDefault();
        exitFullscreen();
      });
    }
    return overlay;
  }

  function enterFullscreen() {
    createOverlay();
    var contentSlot = overlay.querySelector('.timeline-fs-content');
    if (contentSlot && contentEl && contentEl.parentNode) {
      contentSlot.appendChild(contentEl);
    }
    overlay.classList.remove('hidden');
    overlay.style.display = '';
    overlay.focus();
    expandBtn.innerHTML = '<i class="fas fa-compress"></i>';
    expandBtn.title = 'Currently in full screen (click Exit in overlay)';

    escapeHandler = function (e) {
      if (e.key === 'Escape') {
        exitFullscreen();
        document.removeEventListener('keydown', escapeHandler);
      }
    };
    document.addEventListener('keydown', escapeHandler);
  }

  function exitFullscreen() {
    if (!overlay) return;
    if (escapeHandler) {
      document.removeEventListener('keydown', escapeHandler);
      escapeHandler = null;
    }
    var contentSlot = overlay.querySelector('.timeline-fs-content');
    var targetDetails = document.querySelector('.analyze-section-timeline');
    if (contentSlot && contentEl && targetDetails && document.body.contains(targetDetails)) {
      targetDetails.appendChild(contentEl);
    }
    overlay.classList.add('hidden');
    overlay.style.display = 'none';
    if (expandBtn && document.body.contains(expandBtn)) {
      expandBtn.innerHTML = '<i class="fas fa-expand"></i>';
      expandBtn.title = 'Expand to full screen';
    }
  }

  expandBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    e.preventDefault();
    if (overlay && !overlay.classList.contains('hidden')) {
      exitFullscreen();
    } else {
      enterFullscreen();
    }
  });
}

var AI_LOG_QA_SYSTEM = 'You are a log analysis assistant. The user will provide log data and ask a question. Answer based ONLY on the log content. Be concise and direct. If the logs do not contain enough information, say so.';

/** Set all Load Model buttons on the page to ready (green) state */
function setAllLoadModelButtonsReady() {
  var btns = document.querySelectorAll('.ai-load-model-btn');
  btns.forEach(function (btn) {
    btn.classList.add('ai-load-model-ready');
    btn.innerHTML = '<i class="fas fa-check-circle"></i> Model ready';
    btn.disabled = false;
  });
  var genBtns = ['aiLogQaBtn'];
  genBtns.forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.disabled = false;
  });
}

/** Setup AI Log Q&A (ask questions, get text answers from logs) */
function setupAiLogQaSection(logContext) {
  var aiPlanner = window.App && window.App.aiPlanner;
  var loadBtn = document.getElementById('aiLogQaLoadModelBtn');
  var input = document.getElementById('aiLogQaInput');
  var btn = document.getElementById('aiLogQaBtn');
  var statusEl = document.getElementById('aiLogQaStatus');
  var resultDiv = document.getElementById('aiLogQaResult');
  if (!input || !btn) return;

  function updateStatus(text, showSpinner) {
    if (!statusEl) return;
    if (showSpinner) {
      statusEl.innerHTML = '<span class="ai-thinking-wrap"><span class="ai-thinking-robot"><i class="fas fa-robot"></i></span><span class="ai-thinking-spinner-sm"></span></span><span>' + (text || '') + '</span>';
    } else {
      statusEl.textContent = text || '';
    }
  }

  if (loadBtn && aiPlanner) {
    loadBtn.addEventListener('click', function () {
      if (aiPlanner.getStatus() === 'ready') {
        setAllLoadModelButtonsReady();
        return;
      }
      updateStatus('Loading model...');
      loadBtn.disabled = true;
      aiPlanner.loadModel(function (p) {
        var pct = (p && typeof p.progress === 'number') ? Math.round(p.progress * 100) : null;
        updateStatus('Loading: ' + (pct != null ? pct + '%' : (p && p.text) || '...'));
      }).then(function () {
        setAllLoadModelButtonsReady();
        updateStatus('Model ready');
      }).catch(function (err) {
        updateStatus('Error: ' + (err && err.message ? err.message : 'Failed'));
        loadBtn.disabled = false;
      });
    });
  }

  if (aiPlanner && aiPlanner.getStatus() === 'ready') {
    setAllLoadModelButtonsReady();
  }

  btn.addEventListener('click', function () {
    var q = (input.value || '').trim();
    if (!q) {
      updateStatus('Enter a question');
      return;
    }
    if (aiPlanner.getStatus() !== 'ready') {
      updateStatus('Load model first');
      return;
    }
    updateStatus('Searching in logs…', true);
    btn.disabled = true;
    resultDiv.classList.add('hidden');
    var userMsg = 'Log data:\n\n' + logContext + '\n\n---\n\nUser question: ' + q;
    aiPlanner.generateText(userMsg, AI_LOG_QA_SYSTEM).then(function (answer) {
      var text = (answer || '').trim();
      if (resultDiv) {
        resultDiv.textContent = text || '(No answer generated)';
        resultDiv.classList.remove('hidden');
      }
      updateStatus('Done');
      btn.disabled = false;
    }).catch(function (err) {
      updateStatus('Error: ' + (err && err.message ? err.message : 'Failed'));
      if (resultDiv) {
        resultDiv.textContent = 'Error: ' + (err && err.message ? err.message : 'Failed');
        resultDiv.classList.remove('hidden');
      }
      btn.disabled = false;
    });
  });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      btn.click();
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

function generateEmailContent(container, uniqueDetails, hits, occurrences, connectorsDetails, totalHits) {
  var fields = getVisibleFields(uniqueDetails);
  let emailBody = 'Dear Team,\n\n';
  emailBody += 'Please provide help regarding the following investigation:\n\n';
  
  // Summary section
  emailBody += '=== INVESTIGATION SUMMARY ===\n';
  emailBody += 'Total Log Entries: ' + totalHits + '\n';
  
  // Count errors and warnings
  let errorCount = 0;
  let warningCount = 0;
  hits.forEach(hit => {
    const level = (hit._source.level || '').toLowerCase();
    if (level === 'error') errorCount++;
    else if (level === 'warning') warningCount++;
  });
  if (errorCount > 0) emailBody += 'Errors Found: ' + errorCount + '\n';
  if (warningCount > 0) emailBody += 'Warnings Found: ' + warningCount + '\n';
  emailBody += '\n';
  
  // Important details section
  emailBody += '=== IMPORTANT DETAILS ===\n';
  if (uniqueDetails.gateway) emailBody += '- Gateway: ' + uniqueDetails.gateway + '\n';
  fields.forEach(function (field) {
    if (field === 'gateway' || field === 'quarantined_item_id') return;
    if (uniqueDetails[field]) {
      emailBody += '- ' + field.replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }) + ': ' + uniqueDetails[field] + '\n';
    }
  });
  if (uniqueDetails.quarantined_item_id) emailBody += '- Quarantined Item ID: ' + uniqueDetails.quarantined_item_id + '\n';
  emailBody += '\n';
  
  // Errors and warnings section
  if (occurrences && occurrences.length > 0) {
    emailBody += '=== ERRORS & WARNINGS ===\n';
    occurrences.forEach(function(occ, idx) {
      emailBody += '\nOccurrence ' + (idx + 1) + ':\n';
      emailBody += '- Level: ' + (occ.level || 'N/A') + '\n';
      emailBody += '- Label: ' + (occ.label || 'N/A') + '\n';
      emailBody += '- Time: ' + (occ.time || 'N/A') + '\n';
      emailBody += '- Message: ' + (occ.message || 'N/A') + '\n';
      if (occ.params && occ.params !== 'N/A') {
        emailBody += '- Params: ' + occ.params + '\n';
      }
    });
    emailBody += '\n';
  }
  
  // Connectors service details section
  if (connectorsDetails && connectorsDetails.length > 0) {
    emailBody += '=== CONNECTORS SERVICE DETAILS ===\n';
    connectorsDetails.forEach(function(conn, idx) {
      emailBody += '\n' + conn.type.charAt(0).toUpperCase() + conn.type.slice(1) + ' ' + (idx + 1) + ':\n';
      emailBody += '- Label: ' + (conn.label || 'N/A') + '\n';
      emailBody += '- Level: ' + (conn.level || 'N/A') + '\n';
      emailBody += '- Time: ' + (conn.time || 'N/A') + '\n';
      emailBody += '- Message: ' + (conn.message || 'N/A') + '\n';
      if (conn.params && conn.params !== 'N/A') {
        emailBody += '- ' + conn.params + '\n';
      }
    });
    emailBody += '\n';
  }
  
  // Closing
  emailBody += '=== REQUEST ===\n';
  emailBody += 'Please investigate the above details and provide assistance.\n';
  emailBody += 'If you need any additional information from the logs, please let me know.\n\n';
  emailBody += 'Thank you for your assistance!\n\n';
  emailBody += '---\n';
  emailBody += 'Note: If this email is not relevant to your investigation, please feel free to skip it.\n';

  const emailOutputEl = document.getElementById('emailOutput');
  if (!emailOutputEl) return;
  emailOutputEl.innerHTML = '<details class="analyze-section mb-3 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden"><summary class="analyze-section-summary cursor-pointer px-4 py-2.5 bg-slate-50 hover:bg-slate-100 font-semibold text-slate-800 flex items-center gap-2"><i class="fas fa-envelope mr-1"></i> Email to Team</summary><div class="email-content p-3 border-t border-slate-200 bg-slate-50/30"><textarea id="emailContent" class="w-full border border-slate-300 rounded-lg p-4 bg-slate-50 mt-2 text-sm font-mono resize-y min-h-[300px]" rows="20">' + dom.escapeHtml(emailBody) + '</textarea><div class="mt-3 flex flex-wrap gap-2"><button type="button" id="copyEmailBtn" class="inline-flex items-center gap-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white px-4 py-2 text-sm font-medium transition shadow-sm"><i class="fas fa-copy"></i> Copy to Clipboard</button><button type="button" id="clearEmailBtn" class="inline-flex items-center gap-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white px-4 py-2 text-sm font-medium transition shadow-sm"><i class="fas fa-trash-alt"></i> Clear</button></div><div id="copyFeedback" class="mt-2 text-green-600 text-sm hidden"><i class="fas fa-check-circle mr-1"></i>Email content copied to clipboard!</div></div></details>';
  emailOutputEl.classList.remove('hidden');

  const copyBtn = document.getElementById('copyEmailBtn');
  const clearBtn = document.getElementById('clearEmailBtn');
  const feedback = document.getElementById('copyFeedback');
  if (copyBtn) {
    copyBtn.addEventListener('click', function () {
      const textarea = document.getElementById('emailContent');
      const text = textarea ? textarea.value : '';
      dom.copyToClipboard(text).then(ok => {
        if (feedback) {
          feedback.classList.remove('hidden');
          feedback.style.display = ok ? 'block' : 'none';
          setTimeout(() => { if (feedback) feedback.classList.add('hidden'); }, 3000);
        }
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
  if (!logsEl || !resultsEl) return;
  const logs = logsEl.value;

  setAnalyzeInputLocked(container, true);
  resultsEl.innerHTML = '<div class="text-center py-8"><p class="text-slate-600"><i class="fas fa-spinner fa-spin mr-2"></i>Analyzing logs, please wait...</p></div>';

  const parseResult = parseLogs(logs);
  if (parseResult.error) {
    setAnalyzeInputLocked(container, false);
    resultsEl.innerHTML = '<div class="rounded-xl border-2 border-red-200 bg-red-50 p-6"><h3 class="text-lg font-semibold text-red-800 mb-2"><i class="fas fa-exclamation-triangle mr-2"></i>Could not parse logs</h3><p class="text-red-700 text-sm mb-3">' + dom.escapeHtml(parseResult.error) + '</p><p class="text-slate-600 text-sm">Ensure the input is valid JSON (OpenSearch response format). Avoid editing the structure—if you need to trim logs, remove entire log entries to keep the JSON valid.</p></div>';
    return;
  }

  const hits = parseResult.hits;
  const aggregationBuckets = parseResult.aggregationBuckets || [];
  const totalHitsPattern = /"hits":\s*{[^}]*"total":\s*(\d+)/;
  const totalHitsMatch = logs.match(totalHitsPattern);
  const totalHits = totalHitsMatch ? totalHitsMatch[1] : 'Not found';

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

  let results = '<div class="analyze-results-wrapper rounded-xl bg-slate-100/80 border border-slate-200 p-4">';
  results += '<div class="flex flex-wrap items-center justify-between gap-2 mb-3">';
  results += '<h2 class="text-lg font-bold text-slate-800"><i class="fas fa-chart-line mr-2"></i>Log Analysis Results</h2>';
  results += '<button type="button" id="expandCollapseAllBtn" class="inline-flex items-center gap-1.5 rounded-lg bg-slate-600 hover:bg-slate-700 text-white px-3 py-1.5 text-xs font-medium transition"><i class="fas fa-chevron-down"></i> Expand all</button>';
  results += '</div>';

  results += '<div class="ai-log-qa-bar mb-4 p-4 bg-violet-50 border border-violet-200 rounded-xl">';
  results += '<label class="block text-sm font-semibold text-violet-900 mb-2"><i class="fas fa-robot text-violet-600 mr-1"></i> Ask about these logs</label>';
  results += '<p class="text-xs text-violet-700 mb-2">Ask a question (e.g. What is the reason for failure? What went wrong?). AI analyzes all logs and returns a text answer.</p>';
  results += '<div class="flex flex-wrap items-center gap-2 mb-2">';
  results += '<button type="button" id="aiLogQaLoadModelBtn" class="ai-load-model-btn inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 text-sm font-semibold transition shadow-md whitespace-nowrap"><i class="fas fa-download"></i> Load Model</button>';
  results += '<input type="text" id="aiLogQaInput" placeholder="e.g. What is the reason for the failure? What caused the error?" class="flex-1 min-w-[280px] rounded-lg border border-violet-300 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-violet-500 focus:border-violet-500" autocomplete="off" />';
  results += '<button type="button" id="aiLogQaBtn" class="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 text-sm font-medium transition shadow-sm whitespace-nowrap disabled:opacity-50"><i class="fas fa-search"></i> Ask AI</button>';
  results += '</div>';
  results += '<span id="aiLogQaStatus" class="text-xs text-violet-600"></span>';
  results += '<div id="aiLogQaResult" class="hidden mt-3 p-3 bg-white rounded-lg border border-violet-200 text-sm text-slate-800 whitespace-pre-wrap"></div>';
  results += '</div>';

  const uniqueDetails = extractUniqueDetails(hits.concat(aggregationBuckets));
  results += '<details class="analyze-section mb-3 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden" open>';
  results += '<summary class="analyze-section-summary cursor-pointer px-4 py-2.5 bg-slate-50 hover:bg-slate-100 font-semibold text-slate-800 flex items-center gap-2"><i class="fas fa-info-circle mr-1"></i>Important Details</summary>';
  results += '<div class="p-3 border-t border-slate-200 bg-slate-50/30"><div class="flex justify-end mb-2"><button type="button" id="copyDetailsBtn" class="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 text-xs font-medium transition shadow-sm"><i class="fas fa-copy"></i> Copy Details</button></div>' + generateDetailsTable(uniqueDetails) + '</div></details>';

  results += '<details class="analyze-section analyze-section-timeline mb-3 rounded-xl border border-slate-200 shadow-sm overflow-hidden" open>';
  results += '<summary class="analyze-section-summary cursor-pointer px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 font-semibold text-slate-800 flex items-center gap-2">';
  results += '<i class="fas fa-stream"></i> Log flow timeline';
  results += '<span class="flex-1"></span>';
  results += '<button type="button" id="timelineExpandBtn" class="timeline-expand-btn shrink-0 p-1.5 rounded-lg hover:bg-indigo-200/80 text-indigo-700 transition" title="Expand to full screen"><i class="fas fa-expand"></i></button>';
  results += '</summary>';
  results += '<div id="timelineSectionContent" class="p-2 border-t border-slate-200 bg-slate-50/50">';
  results += '<div class="timeline-header flex flex-wrap items-center gap-x-3 gap-y-1 mb-2">';
  results += '<span class="rounded bg-indigo-100 border border-indigo-200 px-2 py-1 text-slate-800 text-sm font-medium"><i class="fas fa-tachometer-alt mr-1"></i>Total Hits: ' + totalHits + '</span>';
  results += '</div>';
  results += '<div class="timeline-search-bar mb-2">';
  results += '<input type="text" id="timelineSearchInput" placeholder="Search all logs. \"quotes\" = exact word, AND = all in same log, OR = any…" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" autocomplete="off" />';
  results += '<span id="timelineSearchCount" class="hidden text-xs text-slate-500 mt-1"></span>';
  results += '</div>';
  results += '<div id="timelineFavorites" class="flex flex-wrap items-center gap-2 mb-2">';
  results += '<span class="text-xs text-slate-500 font-medium">Favorite:</span>';
  DEFAULT_FAVORITE_SEARCHES.forEach(function (term) {
    results += '<button type="button" class="timeline-favorite-chip inline-flex items-center rounded-lg bg-slate-100 border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200 hover:border-slate-400 transition cursor-pointer" data-search-term="' + escapeAttr(term) + '" title="Search for \'' + escapeAttr(term) + '\'">' + dom.escapeHtml(term) + '</button>';
  });
  getFavoriteSearches().forEach(function (term) {
    results += '<span class="timeline-favorite-chip-wrap inline-flex items-center rounded-lg bg-indigo-50 border border-indigo-200">';
    results += '<button type="button" class="timeline-favorite-chip inline-flex items-center px-2.5 py-1 text-xs font-medium text-indigo-800 hover:bg-indigo-100 transition cursor-pointer" data-search-term="' + escapeAttr(term) + '" data-user-favorite="1">' + dom.escapeHtml(term) + '</button>';
    results += '<button type="button" class="timeline-favorite-remove px-1.5 py-1 text-indigo-600 hover:text-red-600 hover:bg-red-50 rounded-r transition cursor-pointer" data-remove-term="' + escapeAttr(term) + '" title="Remove favorite"><i class="fas fa-times text-xs"></i></button>';
    results += '</span>';
  });
  results += '<span class="inline-flex items-center gap-1 ml-1">';
  results += '<input type="text" id="timelineFavoriteInput" placeholder="Add favorite…" class="w-28 rounded border border-slate-300 px-2 py-1 text-xs text-slate-800 placeholder-slate-400 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500" maxlength="50" autocomplete="off" />';
  results += '<button type="button" id="timelineFavoriteAddBtn" class="inline-flex items-center gap-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-2 py-1 text-xs font-medium transition" title="Add to favorites"><i class="fas fa-plus"></i> Add</button>';
  results += '</span>';
  results += '</div>';
  results += '<div id="timelineLabelFilters" class="flex flex-wrap gap-2 mb-3">';
  sortedLabels.forEach(([label, count]) => {
    results += '<button type="button" class="timeline-label-chip inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition cursor-pointer bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200" data-label="' + escapeAttr(label) + '" data-state="neutral" title="Click: filter out → filter in → clear">' + dom.escapeHtml(label) + ' <span class="text-slate-500">' + count + '</span></button>';
  });
  results += '</div>';
  results += '<div class="log-timeline-wrapper overflow-y-auto" id="logTimelineWrapper">' + generateTimelineHtml(hits) + '</div>';
  results += '</div></details>';

  let occurrencesHtml = '';
  let occurrenceIndex = 0;
  const occurrences = [];
  hits.forEach(hit => {
    const source = hit._source;
    if (source.level === 'error' || source.level === 'warning') {
      occurrences.push(extractDetails(hit));
      occurrencesHtml += generateOccurrenceHtml(occurrenceIndex++, extractDetails(hit), hit);
    }
  });

  const connectorsDetails = extractConnectorsServiceDetails(hits);
  if (connectorsDetails.length > 0) {
    results += '<details class="analyze-section mb-3 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">';
    results += '<summary class="analyze-section-summary cursor-pointer px-4 py-2.5 bg-slate-50 hover:bg-slate-100 font-semibold text-slate-800 flex items-center gap-2">Connectors Service Details <span class="rounded-full bg-indigo-100 text-indigo-800 text-xs px-2 py-0.5">' + connectorsDetails.length + '</span></summary>';
    results += '<div class="p-3 border-t border-slate-200 bg-slate-50/30">' + generateConnectorsServiceHtml(connectorsDetails).replace('<h3 class="mt-6 text-base font-semibold text-slate-800 mb-2">Connectors Service Details</h3>', '') + '</div></details>';
  }

  results += '<details class="analyze-section analyze-section-errors mb-3 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">';
  results += '<summary class="analyze-section-summary cursor-pointer px-4 py-2.5 bg-slate-50 hover:bg-slate-100 font-semibold text-slate-800 flex items-center gap-2"><i class="fas fa-exclamation-triangle text-red-600"></i> Errors &amp; warnings' + (occurrenceIndex > 0 ? ' <span class="rounded-full bg-red-100 text-red-800 text-xs px-2 py-0.5">' + occurrenceIndex + '</span>' : '') + '</summary>';
  results += '<div class="p-3 border-t border-slate-200 bg-slate-50/30 errors-section-body">' + (occurrencesHtml || '<div class="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-slate-800 text-sm"><i class="fas fa-check-circle mr-2 text-green-600"></i>No significant issues detected.</div>') + '</div></details>';

  results += '</div>';
  resultsEl.innerHTML = results;

  setupErrorsSectionCopyButtons();
  setupGoToResponseButtons();
  setupTimelineSearch();
  setupLabelFilters();
  setupTimelineFullscreen();
  setupExpandCollapseAll();

  var logContext = buildLogContextForQA(hits, uniqueDetails, occurrences, sortedLabels, totalHits);
  setupAiLogQaSection(logContext);

  generateEmailContent(container, uniqueDetails, hits, occurrences, connectorsDetails, totalHits);
  
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

function setAnalyzeInputLocked(container, locked) {
  var r = root(container);
  var logsEl = byId('logInput', r);
  var demoBtn = byId('demoBtn', r);
  var clearBtn = byId('clearBtn', r);
  if (logsEl) {
    logsEl.disabled = locked;
    logsEl.classList.toggle('opacity-75', locked);
    logsEl.classList.toggle('cursor-not-allowed', locked);
    logsEl.classList.toggle('bg-slate-50', locked);
  }
  if (demoBtn) {
    demoBtn.disabled = locked;
    demoBtn.classList.toggle('opacity-50', locked);
    demoBtn.classList.toggle('cursor-not-allowed', locked);
  }
  if (clearBtn) {
    clearBtn.disabled = false;
    clearBtn.classList.toggle('font-bold', locked);
    clearBtn.classList.toggle('bg-white', !locked);
    clearBtn.classList.toggle('border-slate-300', !locked);
    clearBtn.classList.toggle('text-slate-700', !locked);
    clearBtn.classList.toggle('bg-red-50', locked);
    clearBtn.classList.toggle('border-red-200', locked);
    clearBtn.classList.toggle('text-red-700', locked);
    clearBtn.classList.toggle('hover:bg-red-100', locked);
    clearBtn.classList.toggle('[&>i]:text-red-600', locked);
  }
}

function clearAll(container) {
  var r = root(container);
  var logsEl = byId('logInput', r);
  var resultsEl = byId('analysisResults', r);
  var emailOutputEl = document.getElementById('emailOutput');
  var thumbWrap = document.getElementById('logExplainThumbnail');
  if (logsEl) logsEl.value = '';
  setAnalyzeInputLocked(container, false);
  if (resultsEl) resultsEl.innerHTML = '<span class="text-sm text-slate-600">Results will appear here...</span>';
  if (emailOutputEl) { emailOutputEl.classList.add('hidden'); emailOutputEl.innerHTML = '<h4 class="text-lg font-semibold text-slate-800 mb-2">Generated Email:</h4><pre id="generatedEmail"></pre>'; }
  if (thumbWrap) thumbWrap.style.display = '';
}

function setupExplainImage(container) {
  const r = root(container);
  const modal = byId('logExplainModal', r) || document.getElementById('logExplainModal');
  const openBtn = byId('logExplainBtn', r) || document.getElementById('logExplainBtn');
  const thumbImg = byId('logExplainThumbImg', r) || document.getElementById('logExplainThumbImg');
  const thumbWrap = byId('logExplainThumbnail', r) || document.getElementById('logExplainThumbnail');
  const closeBtn = byId('logExplainModalClose', r) || document.getElementById('logExplainModalClose');

  var escHandler = null;
  function openModal() {
    if (modal) {
      modal.classList.remove('hidden');
      modal.style.display = 'flex';
      escHandler = function (e) {
        if (e.key === 'Escape') closeModal();
      };
      document.addEventListener('keydown', escHandler);
    }
  }
  function closeModal() {
    if (modal) {
      modal.classList.add('hidden');
      modal.style.display = 'none';
      if (escHandler) {
        document.removeEventListener('keydown', escHandler);
        escHandler = null;
      }
    }
  }

  if (openBtn) openBtn.addEventListener('click', openModal);
  if (thumbImg) thumbImg.addEventListener('click', openModal);
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (modal) modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
}

function hideExplainThumbnail() {
  const thumbWrap = document.getElementById('logExplainThumbnail');
  if (thumbWrap) {
    thumbWrap.style.display = 'none';
  }
}

function mount(container) {
  const r = root(container);
  const btn = byId('analyzeBtn', r);
  const demoBtnEl = byId('demoBtn', r);
  const clearBtnEl = byId('clearBtn', r);
  if (btn) btn.addEventListener('click', function () {
    hideExplainThumbnail();
    runAnalysis(container);
  });
  if (demoBtnEl) demoBtnEl.addEventListener('click', function () {
    var logInput = byId('logInput', r);
    if (logInput) {
      logInput.value = generateDemoLogs();
      logInput.focus();
    }
  });
  if (clearBtnEl) clearBtnEl.addEventListener('click', function () { clearAll(container); });
  var refreshBtnEl = byId('analyzeRefreshBtn', r);
  if (refreshBtnEl) refreshBtnEl.addEventListener('click', function () { clearAll(container); });
  setAnalyzeInputLocked(container, false);
  setupExplainImage(container);
}

function unmount() {
  var overlay = document.getElementById('timelineFullscreenOverlay');
  if (overlay) {
    overlay.style.display = 'none';
    overlay.classList.add('hidden');
  }
}

var analyzeView = {
  route: 'analyze',
  navLabel: 'Analyze Logs',
  render: render,
  mount: mount,
  unmount: unmount
};
(function () { window.MonitorToolsViews = window.MonitorToolsViews || {}; window.MonitorToolsViews.analyzeView = analyzeView; })();

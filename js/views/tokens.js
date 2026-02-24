/**
 * Tokens Extractor – Extract payment_token / payout_token (label-pair),
 * payment_xxx / payout_xxx (prefix-match), and custom-prefix tokens.
 * Advanced settings popup controls extraction behavior.
 * Works from file:// and GitHub Pages (no server). Registers on window.MonitorToolsViews.tokensView.
 */
var dom = (typeof window !== 'undefined' && window.App && window.App.dom) ? window.App.dom : {
  escapeHtml: function (text) {
    if (text == null) return '';
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};

/* ── state ────────────────────────────────────────────────── */
var DEFAULT_MIN_TOKEN_LENGTH = 20;
var DEFAULT_MIN_LENGTH_FOR_PREFIX = 24;
/* Regex patterns (strings) for default exclude – compiled at runtime */
var DEFAULT_EXCLUDE_REGEX_PATTERNS = [
  'payment_method_type_',
  'payment_method_account_name_inquiry',
  'payment_method_card_holder_(first|middle|last)',
  'payment_is_zero_amount_for_tokenization',
  'payment_transaction_link_action'
];

function _getDefaultExcludeRegexes() {
  if (!_getDefaultExcludeRegexes._cache) {
    _getDefaultExcludeRegexes._cache = DEFAULT_EXCLUDE_REGEX_PATTERNS.map(function (p) {
      try { return new RegExp(p, 'i'); } catch (e) { return null; }
    }).filter(Boolean);
  }
  return _getDefaultExcludeRegexes._cache;
}
var lastPaymentTokens = [];
var lastPayoutTokens = [];
var lastCardPaymentTokens = [];
var lastCustomTokens = [];
var loadedFiles = [];  /* [{name, size, content}] – accumulated across picks */

/* Saved advanced settings (persists until page reload) */
var advancedSettings = {
  enabled: false,
  minLength: DEFAULT_MIN_TOKEN_LENGTH,
  extractPaymentPrefix: true,
  extractPayoutPrefix: true,
  extractLabelPairs: true,
  tokenChars: 'any',        /* 'any' = letters+numbers+_-  |  'digits' = digits+_- only */
  excludeList: []
};

/* ── helpers ──────────────────────────────────────────────── */
function _root(c) { return c || document; }

function _byId(id, c) {
  var r = _root(c);
  if (!r) return null;
  var el = null;
  if (r.querySelector) el = r.querySelector('[id="' + id + '"]');
  if (!el && typeof document !== 'undefined' && document.getElementById) el = document.getElementById(id);
  return el || null;
}

/* ── render ───────────────────────────────────────────────── */
function render() {
  return [
    '<div class="relative">',
    '<button type="button" id="tokensRefreshBtn" class="absolute top-0 right-0 p-2.5 rounded-lg text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 transition font-medium" title="Reset all"><i class="fas fa-sync-alt text-base"></i></button>',
    '<h2 class="text-xl font-bold text-slate-800 mb-2 pr-10">Payment / Payout / Card Payment Token Extractor</h2>',
    '<p class="text-slate-600 text-sm mb-4">Paste text or select files, then click <strong>Extract</strong>. Use the Custom field to find tokens with any prefix.</p>',

    /* ── file upload ── */
    '<div class="mb-4">',
    '  <label class="block text-sm font-medium text-slate-700 mb-2"><i class="fas fa-file-upload mr-1"></i>Add from files (optional)</label>',
    '  <div class="flex items-center gap-2">',
    '    <label for="tokenFiles" class="inline-flex items-center gap-2 cursor-pointer rounded-lg border border-slate-300 bg-white hover:bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 transition shadow-sm">',
    '      <i class="fas fa-plus text-xs"></i> Add files',
    '    </label>',
    '    <input type="file" id="tokenFiles" multiple accept=".txt,.csv,.log,text/plain,text/csv,application/csv" class="hidden">',
    '    <span id="tokenFilesCount" class="text-xs text-slate-500"></span>',
    '    <button type="button" id="tokenFilesClearAll" class="hidden text-xs text-red-500 hover:text-red-700 font-medium transition"><i class="fas fa-trash-alt mr-0.5"></i>Clear all</button>',
    '  </div>',
    '  <div id="tokenFilesList" class="mt-2 space-y-1"></div>',
    '  <p id="tokenFilesStatus" class="mt-1 text-xs text-slate-500 hidden"></p>',
    '</div>',

    /* ── paste area ── */
    '<label for="inputData" class="block text-sm font-medium text-slate-700 mb-1">Paste or type input data:</label>',
    '<textarea id="inputData" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:ring-2 focus:ring-primary focus:border-primary font-mono text-sm resize-none" rows="6" placeholder="Paste or type your input data here..."></textarea>',

    /* ── custom pattern ── */
    '<div class="mt-3">',
    '  <label for="tokenCustomPattern" class="block text-sm font-medium text-slate-700 mb-1"><i class="fas fa-filter mr-1"></i>Custom token pattern (optional)</label>',
    '  <input type="text" id="tokenCustomPattern" class="w-full max-w-md border border-slate-300 rounded-lg px-3 py-2 text-slate-800 text-sm placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" placeholder="e.g. ewallet_, inv_, custom_">',
    '  <p class="mt-1 text-xs text-slate-500">Extract tokens that start with this prefix.</p>',
    '</div>',

    /* ── error alert ── */
    '<div id="tokensErrorAlert" class="mt-2"></div>',

    /* ── buttons row: Extract + Demo + Advanced ── */
    '<div class="mt-4 pt-4 border-t border-slate-200 flex flex-wrap items-center gap-3">',
    '  <button class="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 text-sm font-medium transition shadow-sm" type="button" id="extractTokensBtn"><i class="fas fa-bolt"></i> Extract Tokens</button>',
    '  <button class="inline-flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 px-5 py-2.5 text-sm font-medium transition shadow-sm" type="button" id="tokensDemoBtn" title="Paste sample text with mock tokens"><i class="fas fa-magic"></i> Demo</button>',
    '  <button class="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-4 py-2.5 text-sm font-medium transition shadow-sm" type="button" id="tokenAdvancedBtn"><i class="fas fa-sliders-h"></i> Advanced Settings</button>',
    '  <span id="tokenAdvancedBadge" class="hidden inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700"><i class="fas fa-check-circle text-[10px]"></i> Custom settings active</span>',
    '</div>',

    /* ══════ Advanced Settings Modal ══════ */
    '<div id="tokenAdvancedModal" class="hidden fixed inset-0 z-[999] flex items-center justify-center p-4" style="background:rgba(0,0,0,0.4)">',
    '  <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" id="tokenAdvancedModalContent">',

    /* modal header */
    '    <div class="flex items-center justify-between p-5 border-b border-slate-200">',
    '      <h3 class="text-lg font-semibold text-slate-800"><i class="fas fa-sliders-h mr-2 text-indigo-500"></i>Advanced Extraction Settings</h3>',
    '      <button type="button" id="tokenAdvancedClose" class="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition" aria-label="Close"><i class="fas fa-times"></i></button>',
    '    </div>',

    /* modal body */
    '    <div class="p-5 space-y-5">',

    /* ── section: enable toggle ── */
    '      <div class="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">',
    '        <div>',
    '          <div class="text-sm font-medium text-slate-800">Use advanced settings</div>',
    '          <div class="text-xs text-slate-500">When off, only <code>payment_token:</code> / <code>payout_token:</code> label pairs are extracted with defaults.</div>',
    '        </div>',
    '        <label class="relative inline-flex items-center cursor-pointer shrink-0 ml-3">',
    '          <input type="checkbox" id="tokenAdvancedToggle" class="sr-only peer">',
    '          <div class="w-10 h-5 bg-slate-300 peer-focus:ring-2 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[\'\'] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>',
    '        </label>',
    '      </div>',

    /* ── settings (disabled when toggle off) ── */
    '      <div id="tokenAdvancedFields" class="space-y-4 opacity-40 pointer-events-none transition-opacity">',

    /* extraction methods */
    '        <div>',
    '          <div class="text-sm font-semibold text-slate-700 mb-2">Extraction methods</div>',
    '          <div class="space-y-2">',
    '            <label class="flex items-start gap-2 text-sm"><input type="checkbox" id="tokenOptLabelPairs" checked class="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"><span><strong>Label pairs</strong> \u2013 find <code>payment_token: xxx</code> and <code>payout_token: xxx</code></span></label>',
    '            <label class="flex items-start gap-2 text-sm"><input type="checkbox" id="tokenOptPaymentPrefix" checked class="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"><span><strong>payment_*</strong> prefix \u2013 match any <code>payment_</code> followed by token characters</span></label>',
    '            <label class="flex items-start gap-2 text-sm"><input type="checkbox" id="tokenOptPayoutPrefix" checked class="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"><span><strong>payout_*</strong> prefix \u2013 match any <code>payout_</code> followed by token characters</span></label>',
    '          </div>',
    '        </div>',

    /* token character set */
    '        <div>',
    '          <div class="text-sm font-semibold text-slate-700 mb-2">Token characters (after prefix)</div>',
    '          <div class="space-y-2">',
    '            <label class="flex items-center gap-2 text-sm"><input type="radio" name="tokenCharsRadio" id="tokenCharsAny" value="any" checked class="text-indigo-600 focus:ring-indigo-500"><span>Letters + digits + <code>_ -</code> &nbsp;<span class="text-slate-400">(e.g. payment_aBc123_xyz)</span></span></label>',
    '            <label class="flex items-center gap-2 text-sm"><input type="radio" name="tokenCharsRadio" id="tokenCharsDigits" value="digits" class="text-indigo-600 focus:ring-indigo-500"><span>Digits + <code>_ -</code> only &nbsp;<span class="text-slate-400">(e.g. payment_1234567890)</span></span></label>',
    '          </div>',
    '        </div>',

    /* min length */
    '        <div>',
    '          <label for="tokenOptMinLength" class="block text-sm font-semibold text-slate-700 mb-1">Minimum length after prefix</label>',
    '          <div class="flex items-center gap-2">',
    '            <input type="number" id="tokenOptMinLength" min="1" max="200" value="20" class="w-24 border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500">',
    '            <span class="text-xs text-slate-500">characters (applies to <code>payment_*</code>, <code>payout_*</code>, and custom prefix)</span>',
    '          </div>',
    '        </div>',

    /* exclude list */
    '        <div>',
    '          <label for="tokenOptExclude" class="block text-sm font-semibold text-slate-700 mb-1">Exclude tokens containing</label>',
    '          <textarea id="tokenOptExclude" rows="2" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" placeholder="e.g. payment_id, payment_amount, test_"></textarea>',
    '          <p class="mt-1 text-xs text-slate-500">Comma or newline separated. Each entry is a regex pattern (e.g. <code>payment_.*_amount</code>, <code>payment_method_card_holder_(first|middle|last)</code>). Invalid regex falls back to substring match.</p>',
    '        </div>',

    '      </div>',
    '    </div>',

    /* modal footer */
    '    <div class="flex items-center justify-between p-5 border-t border-slate-200 bg-slate-50 rounded-b-2xl">',
    '      <button type="button" id="tokenAdvancedReset" class="text-sm text-slate-500 hover:text-slate-700 transition"><i class="fas fa-undo mr-1"></i>Reset to defaults</button>',
    '      <div class="flex gap-2">',
    '        <button type="button" id="tokenAdvancedCancel" class="px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 transition">Cancel</button>',
    '        <button type="button" id="tokenAdvancedSave" class="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition shadow-sm">Save settings</button>',
    '      </div>',
    '    </div>',

    '  </div>',
    '</div>',

    /* ── results area (Total full-width row, 3-col lists) ── */
    '<div id="output" class="token-container mt-8">',
    '  <div id="tokensResultHeader" class="hidden mb-6 space-y-4">',
    '    <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3" id="tokenCardsGrid">',
    '      <div id="tokenCardPayment" class="rounded-2xl border-2 border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-4 shadow-sm text-center">',
    '        <div id="tokenCountPayment" class="text-2xl font-bold text-indigo-700">0</div>',
    '        <div class="text-xs font-medium text-slate-600 uppercase tracking-wide mt-0.5">Payment</div>',
    '      </div>',
    '      <div id="tokenCardPayout" class="rounded-2xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-sm text-center">',
    '        <div id="tokenCountPayout" class="text-2xl font-bold text-emerald-700">0</div>',
    '        <div class="text-xs font-medium text-slate-600 uppercase tracking-wide mt-0.5">Payout</div>',
    '      </div>',
    '      <div id="tokenCardCardPayment" class="rounded-2xl border-2 border-violet-200 bg-gradient-to-br from-violet-50 to-white p-4 shadow-sm text-center hidden">',
    '        <div id="tokenCountCardPayment" class="text-2xl font-bold text-violet-700">0</div>',
    '        <div class="text-xs font-medium text-slate-600 uppercase tracking-wide mt-0.5">Card Payment</div>',
    '      </div>',
    '      <div id="tokenCardCustom" class="rounded-2xl border-2 border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4 shadow-sm text-center hidden">',
    '        <div id="tokenCountCustom" class="text-2xl font-bold text-amber-700">0</div>',
    '        <div id="tokenCardCustomLabel" class="text-xs font-medium text-slate-600 uppercase tracking-wide mt-0.5">Custom</div>',
    '      </div>',
    '    </div>',
    '    <div id="tokenCardTotal" class="w-full rounded-2xl border-2 border-slate-300 bg-gradient-to-br from-slate-100 to-white p-4 shadow-sm text-center">',
    '      <div id="tokenCountTotal" class="text-2xl font-bold text-slate-800">0</div>',
    '      <div class="text-xs font-medium text-slate-600 uppercase tracking-wide mt-0.5">Total</div>',
    '    </div>',

    /* search bar + compare */
    '    <div class="rounded-xl border border-slate-200 bg-slate-50/80 p-3">',
    '      <div class="flex flex-wrap items-center gap-2">',
    '        <div class="relative flex-1 min-w-[200px]">',
    '          <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>',
    '          <input type="text" id="tokensSearch" placeholder="Search in results..." class="w-full pl-9 pr-9 py-2.5 border border-slate-300 rounded-lg text-slate-800 text-sm placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white">',
    '          <button type="button" id="tokensSearchClear" class="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-200 hidden" aria-label="Clear search"><i class="fas fa-times text-sm"></i></button>',
    '        </div>',
    '        <button type="button" id="tokensCompareBtn" class="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-3 py-2.5 text-sm font-medium transition shadow-sm"><i class="fas fa-code-branch"></i> Compare</button>',
    '        <span id="tokensSearchSummary" class="text-xs text-slate-500 whitespace-nowrap">Type to filter results</span>',
    '      </div>',
    '    </div>',
    '  </div>',

    /* token list columns: 2 when no custom, 3 when custom filled */
    '  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" id="tokenListsGrid">',
    '    <div class="token-box rounded-xl border border-slate-200 bg-slate-50 p-4 min-h-[200px] overflow-y-auto">',
    '      <div class="flex items-center justify-between mb-2">',
    '        <h3 class="text-sm font-semibold text-slate-800">Payment Tokens:</h3>',
    '        <button type="button" id="copyPaymentTokensBtn" class="copy-tokens-btn inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1 text-xs font-medium transition shadow-sm hidden"><i class="fas fa-copy"></i> Copy</button>',
    '      </div>',
    '      <ol id="paymentTokensList" class="list-decimal list-inside text-sm text-slate-700 space-y-1"></ol>',
    '    </div>',
    '    <div class="token-box rounded-xl border border-slate-200 bg-slate-50 p-4 min-h-[200px] overflow-y-auto">',
    '      <div class="flex items-center justify-between mb-2">',
    '        <h3 class="text-sm font-semibold text-slate-800">Payout Tokens:</h3>',
    '        <button type="button" id="copyPayoutTokensBtn" class="copy-tokens-btn inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1 text-xs font-medium transition shadow-sm hidden"><i class="fas fa-copy"></i> Copy</button>',
    '      </div>',
    '      <ol id="payoutTokensList" class="list-decimal list-inside text-sm text-slate-700 space-y-1"></ol>',
    '    </div>',
    '    <div id="cardPaymentTokensCol" class="token-box rounded-xl border border-slate-200 bg-slate-50 p-4 min-h-[200px] overflow-y-auto hidden">',
    '      <div class="flex items-center justify-between mb-2">',
    '        <h3 class="text-sm font-semibold text-slate-800">Card Payment Tokens:</h3>',
    '        <button type="button" id="copyCardPaymentTokensBtn" class="copy-tokens-btn inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1 text-xs font-medium transition shadow-sm hidden"><i class="fas fa-copy"></i> Copy</button>',
    '      </div>',
    '      <ol id="cardPaymentTokensList" class="list-decimal list-inside text-sm text-slate-700 space-y-1"></ol>',
    '    </div>',
    '    <div id="customTokensCol" class="token-box rounded-xl border border-slate-200 bg-slate-50 p-4 min-h-[200px] overflow-y-auto hidden">',
    '      <div class="flex items-center justify-between mb-2">',
    '        <h3 id="customTokensTitle" class="text-sm font-semibold text-slate-800">Custom Tokens:</h3>',
    '        <button type="button" id="copyCustomTokensBtn" class="copy-tokens-btn inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1 text-xs font-medium transition shadow-sm hidden"><i class="fas fa-copy"></i> Copy</button>',
    '      </div>',
    '      <ol id="customTokensList" class="list-decimal list-inside text-sm text-slate-700 space-y-1"></ol>',
    '    </div>',
    '  </div>',
    '</div>',
    '</div>',

    /* ══════ Compare Tokens Modal ══════ */
    '<div id="tokensCompareModal" class="hidden fixed inset-0 z-[999] flex items-center justify-center p-4" style="background:rgba(0,0,0,0.4)">',
    '  <div class="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col" id="tokensCompareModalContent">',
    '    <div class="flex items-center justify-between p-5 border-b border-slate-200 shrink-0">',
    '      <h3 class="text-lg font-semibold text-slate-800"><i class="fas fa-code-branch mr-2 text-indigo-500"></i>Compare Tokens</h3>',
    '      <button type="button" id="tokensCompareClose" class="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition" aria-label="Close"><i class="fas fa-times"></i></button>',
    '    </div>',
    '    <div class="p-5 overflow-y-auto flex-1">',
    '      <p class="text-sm text-slate-600 mb-3">Paste tokens to compare (one per line). Result shows diff between extracted tokens and your pasted list.</p>',
    '      <textarea id="tokensCompareInput" rows="6" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-mono text-sm placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none" placeholder="Paste tokens here, one per line..."></textarea>',
    '      <button type="button" id="tokensCompareRunBtn" class="mt-3 inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 text-sm font-medium transition shadow-sm"><i class="fas fa-sync-alt"></i> Compare</button>',
    '      <div id="tokensCompareResult" class="mt-6 hidden space-y-4"></div>',
    '    </div>',
    '  </div>',
    '</div>'
  ].join('\n');
}

/* ── UI helpers ───────────────────────────────────────────── */
function showError(c, message) {
  var box = _byId('tokensErrorAlert', c);
  if (!box) return;
  box.innerHTML = '<div class="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm" role="alert">' + dom.escapeHtml(message) + '</div>';
}

function clearError(c) {
  var box = _byId('tokensErrorAlert', c);
  if (box) box.innerHTML = '';
}

function randomHex(len) {
  var s = '';
  for (var i = 0; i < len; i++) s += '0123456789abcdef'[Math.floor(Math.random() * 16)];
  return s;
}

function generateDemoTokens() {
  var pay1 = 'pay_' + randomHex(24);
  var pay2 = 'pay_' + randomHex(24);
  var out1 = 'payout_' + randomHex(24);
  var out2 = 'payout_' + randomHex(24);
  var card1 = 'card_' + randomHex(24);
  var ref = 'ref_' + randomHex(12);
  return [
    'Log entry: payment_token: ' + pay1 + ' status=failed',
    '{"payment_token":"' + pay2 + '","gateway":"stripe","amount":49.99}',
    'payout_token: ' + out1 + ' | reference_id: ' + ref,
    '"payout_token":"' + out2 + '"',
    'payment_method: ' + card1 + ' (card payment)',
    '"payment_method":"' + card1 + '"',
    'payment_token=' + pay1 + ' failure_code=card_declined',
    'PAYMENT_FAILED payment_token: ' + pay2 + ' gateway_name: stripe_demo'
  ].join('\n');
}

function readFileAsText(file) {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onload = function () { resolve(reader.result); };
    reader.onerror = function () { reject(new Error('Failed to read ' + file.name)); };
    reader.readAsText(file, 'UTF-8');
  });
}

function setExtractButtonEnabled(c, enabled) {
  var btn = _byId('extractTokensBtn', c);
  if (!btn) return;
  btn.disabled = !enabled;
  btn.classList.toggle('opacity-60', !enabled);
  btn.classList.toggle('cursor-not-allowed', !enabled);
}

/* setFileProgressState removed – replaced by file list UI */

/* ── advanced settings helpers ────────────────────────────── */
function getAdvancedOptions() {
  if (!advancedSettings.enabled) {
    return {
      minLength: DEFAULT_MIN_LENGTH_FOR_PREFIX,
      extractPaymentPrefix: true,
      extractPayoutPrefix: true,
      extractLabelPairs: true,
      tokenChars: 'any',
      useDefaultExcludeRegex: true,
      excludeList: []
    };
  }
  return {
    minLength: advancedSettings.minLength,
    extractPaymentPrefix: advancedSettings.extractPaymentPrefix,
    extractPayoutPrefix: advancedSettings.extractPayoutPrefix,
    extractLabelPairs: advancedSettings.extractLabelPairs,
    tokenChars: advancedSettings.tokenChars,
    useDefaultExcludeRegex: false,
    excludeList: advancedSettings.excludeList
  };
}

function defaultExcludeToken(token) {
  if (!token || String(token).trim() === '') return true;
  var s = String(token);
  return _getDefaultExcludeRegexes().some(function (re) { return re.test(s); });
}

function shouldExcludeToken(token, excludeList) {
  if (!token || !excludeList.length) return false;
  var s = String(token);
  return excludeList.some(function (part) {
    try {
      var re = new RegExp(part, 'i');
      return re.test(s);
    } catch (e) {
      return s.toLowerCase().indexOf(part.toLowerCase()) !== -1;
    }
  });
}

/* character class for token matching based on setting */
function tokenCharClass(chars) {
  if (chars === 'digits') return '0-9_-';
  return 'a-zA-Z0-9_-';
}

/* ── extraction logic ─────────────────────────────────────── */
/**
 * Extract tokens from label pairs like:
 *   payment_token: tok1               (simple)
 *   payment_token:tok1                (no space)
 *   "payment_token": "tok1"           (JSON)
 *   'payment_token': 'tok1'           (JSON single-quote)
 *   payment_token = tok1              (equals sign)
 *   payment_token => tok1             (hash-rocket)
 */
function extractLabelPairTokens(text) {
  var paymentRe = /['"]?payment_token['"]?\s*[:=]+>?\s*['"]?([^\s'",$\n})\]]+)/gi;
  var payoutRe  = /['"]?payout_token['"]?\s*[:=]+>?\s*['"]?([^\s'",$\n})\]]+)/gi;
  var paymentMethodRe = /['"]?payment_method['"]?\s*[:=]+>?\s*['"]?([^\s'",$\n})\]]+)/gi;
  var payment = [];
  var payout = [];
  var cardPayment = [];
  var m;
  while ((m = paymentRe.exec(text)) !== null) {
    var t = m[1].replace(/['",;:]+$/g, '');
    if (t) payment.push(t);
  }
  while ((m = payoutRe.exec(text)) !== null) {
    var t2 = m[1].replace(/['",;:]+$/g, '');
    if (t2) payout.push(t2);
  }
  while ((m = paymentMethodRe.exec(text)) !== null) {
    var t3 = m[1].replace(/['",;:]+$/g, '');
    if (t3 && String(t3).toLowerCase().startsWith('card_')) cardPayment.push(t3);
  }
  return { payment: payment, payout: payout, cardPayment: cardPayment };
}

function extractPrefixTokens(text, minLen, chars) {
  var cc = tokenCharClass(chars);
  var paymentPrefixRe = new RegExp('payment_(?!token\\b)[' + cc + ']{' + minLen + ',}', 'g');
  var payoutPrefixRe  = new RegExp('payout_(?!token\\b)[' + cc + ']{' + minLen + ',}', 'g');
  var payment = [];
  var payout = [];
  var m;
  while ((m = paymentPrefixRe.exec(text)) !== null) payment.push(m[0]);
  while ((m = payoutPrefixRe.exec(text)) !== null) payout.push(m[0]);
  return { payment: payment, payout: payout };
}

function extractCustomTokens(text, pattern, minLength, chars) {
  var len = (minLength != null && minLength >= 1) ? minLength : DEFAULT_MIN_TOKEN_LENGTH;
  var cc = tokenCharClass(chars);
  var escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  var re = new RegExp(escaped + '[' + cc + ']{' + len + ',}', 'g');
  var tokens = [];
  var m;
  while ((m = re.exec(text)) !== null) tokens.push(m[0]);
  return Array.from(new Set(tokens));
}

/* ── run extraction ───────────────────────────────────────── */
function runExtraction(c, text) {
  if (!text || typeof text !== 'string') return;
  var opts = getAdvancedOptions();
  var paymentTokens = [];
  var payoutTokens = [];

  /* 1) label pairs */
  var cardPaymentTokens = [];
  if (opts.extractLabelPairs) {
    var lp = extractLabelPairTokens(text);
    paymentTokens = paymentTokens.concat(lp.payment);
    payoutTokens  = payoutTokens.concat(lp.payout);
    cardPaymentTokens = cardPaymentTokens.concat(lp.cardPayment || []);
  }

  /* 2) prefix match */
  if (opts.extractPaymentPrefix) {
    var pp = extractPrefixTokens(text, opts.minLength, opts.tokenChars);
    paymentTokens = paymentTokens.concat(pp.payment);
  }
  if (opts.extractPayoutPrefix) {
    var pp2 = extractPrefixTokens(text, opts.minLength, opts.tokenChars);
    payoutTokens = payoutTokens.concat(pp2.payout);
  }

  /* 3) dedup and drop null/empty and literal "null"/"undefined" */
  function notEmpty(t) {
    if (t == null) return false;
    var s = String(t).trim();
    return s !== '' && s.toLowerCase() !== 'null' && s.toLowerCase() !== 'undefined';
  }
  lastPaymentTokens = Array.from(new Set(paymentTokens)).filter(notEmpty);
  lastPayoutTokens  = Array.from(new Set(payoutTokens)).filter(notEmpty);
  lastCardPaymentTokens = Array.from(new Set(cardPaymentTokens)).filter(notEmpty);

  /* 4) exclude – default regex rules when Advanced OFF, else user exclude list */
  if (opts.useDefaultExcludeRegex) {
    lastPaymentTokens = lastPaymentTokens.filter(function (t) { return !defaultExcludeToken(t); });
    lastPayoutTokens  = lastPayoutTokens.filter(function (t) { return !defaultExcludeToken(t); });
    lastCardPaymentTokens = lastCardPaymentTokens.filter(function (t) { return !defaultExcludeToken(t); });
  } else if (opts.excludeList.length) {
    lastPaymentTokens = lastPaymentTokens.filter(function (t) { return !shouldExcludeToken(t, opts.excludeList); });
    lastPayoutTokens  = lastPayoutTokens.filter(function (t) { return !shouldExcludeToken(t, opts.excludeList); });
    lastCardPaymentTokens = lastCardPaymentTokens.filter(function (t) { return !shouldExcludeToken(t, opts.excludeList); });
  }

  /* 5) custom pattern */
  var customPatternEl = _byId('tokenCustomPattern', c);
  var customPattern = (customPatternEl && customPatternEl.value) ? customPatternEl.value.trim() : '';
  lastCustomTokens = customPattern ? extractCustomTokens(text, customPattern, opts.minLength, opts.tokenChars).filter(notEmpty) : [];
  if (lastCustomTokens.length) {
    if (opts.useDefaultExcludeRegex) {
      lastCustomTokens = lastCustomTokens.filter(function (t) { return !defaultExcludeToken(t); });
    } else if (opts.excludeList.length) {
      lastCustomTokens = lastCustomTokens.filter(function (t) { return !shouldExcludeToken(t, opts.excludeList); });
    }
  }

  /* 6) show UI – use document so we always find the results block */
  var header = document.getElementById('tokensResultHeader');
  var outputDiv = document.getElementById('output');
  var searchInput = document.getElementById('tokensSearch');
  if (outputDiv) { outputDiv.classList.add('visible'); outputDiv.style.display = 'block'; }
  if (header) {
    header.classList.remove('hidden');
    header.style.display = '';
  }
  if (searchInput) searchInput.value = '';

  var customCard = document.getElementById('tokenCardCustom');
  var customCol  = document.getElementById('customTokensCol');
  var customTitle = document.getElementById('customTokensTitle');
  var customLabel = document.getElementById('tokenCardCustomLabel');
  var hasCustom = customPattern.length > 0;
  if (customCard) customCard.classList.toggle('hidden', !hasCustom);
  if (customCol) customCol.classList.toggle('hidden', !hasCustom);
  if (customTitle) customTitle.textContent = customPattern ? 'Custom Tokens (' + dom.escapeHtml(customPattern) + ')' : 'Custom Tokens';
  if (customLabel) customLabel.textContent = customPattern ? 'Custom (' + dom.escapeHtml(customPattern) + ')' : 'Custom';

  var cardPaymentCard = document.getElementById('tokenCardCardPayment');
  var cardPaymentCol = document.getElementById('cardPaymentTokensCol');
  var hasCardPayment = lastCardPaymentTokens.length > 0;
  if (cardPaymentCard) cardPaymentCard.classList.toggle('hidden', !hasCardPayment);
  if (cardPaymentCol) cardPaymentCol.classList.toggle('hidden', !hasCardPayment);

  var cardsGrid = document.getElementById('tokenCardsGrid');
  var listsGrid = document.getElementById('tokenListsGrid');
  var visibleCols = 2 + (hasCardPayment ? 1 : 0) + (hasCustom ? 1 : 0);
  if (cardsGrid) {
    cardsGrid.classList.remove('sm:grid-cols-2', 'sm:grid-cols-3', 'md:grid-cols-4');
    cardsGrid.classList.add(visibleCols >= 4 ? 'md:grid-cols-4' : visibleCols === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2');
  }
  if (listsGrid) {
    listsGrid.classList.remove('md:grid-cols-2', 'lg:grid-cols-3', 'lg:grid-cols-4');
    listsGrid.classList.add(visibleCols >= 4 ? 'lg:grid-cols-4' : visibleCols === 3 ? 'lg:grid-cols-3' : 'md:grid-cols-2');
  }

  clearError(c);
  applyTokenListFilter(c, '');
}

function isValidToken(t) {
  if (t == null) return false;
  var s = String(t).trim();
  return s !== '' && s.toLowerCase() !== 'null' && s.toLowerCase() !== 'undefined';
}

/* ── search / filter ──────────────────────────────────────── */
function applyTokenListFilter(c, query) {
  var q = (query || '').trim().toLowerCase();
  var filterFn = function (token) { return isValidToken(token) && (!q || String(token).toLowerCase().indexOf(q) !== -1); };
  var pay = (Array.isArray(lastPaymentTokens) ? lastPaymentTokens : []).filter(isValidToken);
  var out = (Array.isArray(lastPayoutTokens) ? lastPayoutTokens : []).filter(isValidToken);
  var card = (Array.isArray(lastCardPaymentTokens) ? lastCardPaymentTokens : []).filter(isValidToken);
  var cust = (Array.isArray(lastCustomTokens) ? lastCustomTokens : []).filter(isValidToken);
  var paymentFiltered = pay.filter(filterFn);
  var payoutFiltered  = out.filter(filterFn);
  var cardPaymentFiltered = card.filter(filterFn);
  var customFiltered  = cust.filter(filterFn);

  function buildList(arr, emptyMsg) {
    var valid = arr.filter(function (t) {
      if (t == null) return false;
      var s = String(t).trim();
      return s !== '' && s.toLowerCase() !== 'null' && s.toLowerCase() !== 'undefined';
    });
    if (valid.length > 0) {
      return valid.map(function (t) { return '<li>' + dom.escapeHtml(String(t)) + '</li>'; }).join('');
    }
    return '<li class="text-slate-400">' + emptyMsg + '</li>';
  }

  var paymentEl = document.getElementById('paymentTokensList');
  var payoutEl  = document.getElementById('payoutTokensList');
  var cardPaymentEl = document.getElementById('cardPaymentTokensList');
  var customEl  = document.getElementById('customTokensList');
  if (paymentEl) paymentEl.innerHTML = buildList(paymentFiltered, 'No payment tokens found.');
  if (payoutEl)  payoutEl.innerHTML  = buildList(payoutFiltered, 'No payout tokens found.');
  if (cardPaymentEl) cardPaymentEl.innerHTML = buildList(cardPaymentFiltered, 'No card payment tokens found.');
  if (customEl)  customEl.innerHTML  = buildList(customFiltered, 'No custom tokens found.');
  
  // Show/hide copy buttons based on whether there are tokens
  var copyPaymentBtn = document.getElementById('copyPaymentTokensBtn');
  var copyPayoutBtn = document.getElementById('copyPayoutTokensBtn');
  var copyCardPaymentBtn = document.getElementById('copyCardPaymentTokensBtn');
  var copyCustomBtn = document.getElementById('copyCustomTokensBtn');
  if (copyPaymentBtn) copyPaymentBtn.classList.toggle('hidden', paymentFiltered.length === 0);
  if (copyPayoutBtn) copyPayoutBtn.classList.toggle('hidden', payoutFiltered.length === 0);
  if (copyCardPaymentBtn) copyCardPaymentBtn.classList.toggle('hidden', cardPaymentFiltered.length === 0);
  if (copyCustomBtn) copyCustomBtn.classList.toggle('hidden', customFiltered.length === 0);

  var totalFiltered = paymentFiltered.length + payoutFiltered.length + cardPaymentFiltered.length + customFiltered.length;
  var totalAll = pay.length + out.length + card.length + cust.length;

  var countPay  = document.getElementById('tokenCountPayment');
  var countOut  = document.getElementById('tokenCountPayout');
  var countCard = document.getElementById('tokenCountCardPayment');
  var countCust = document.getElementById('tokenCountCustom');
  var countTot  = document.getElementById('tokenCountTotal');
  var summary   = document.getElementById('tokensSearchSummary');
  var clearBtn  = document.getElementById('tokensSearchClear');

  if (countPay)  countPay.textContent  = paymentFiltered.length;
  if (countOut)  countOut.textContent  = payoutFiltered.length;
  if (countCard) countCard.textContent = cardPaymentFiltered.length;
  if (countCust) countCust.textContent = customFiltered.length;
  if (countTot)  countTot.textContent  = totalFiltered;
  if (summary) {
    if (q) {
      summary.textContent = 'Showing ' + totalFiltered + ' of ' + totalAll + ' tokens';
      summary.className = 'text-xs text-indigo-600 font-medium whitespace-nowrap';
    } else {
      summary.textContent = totalAll + ' token(s) \u2022 Type to filter';
      summary.className = 'text-xs text-slate-500 whitespace-nowrap';
    }
  }
  if (clearBtn) clearBtn.classList.toggle('hidden', !q);
}

/* ── file handling (multi-file accumulator) ───────────────── */
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function renderFileList(c) {
  var listEl = _byId('tokenFilesList', c);
  var countEl = _byId('tokenFilesCount', c);
  var clearBtn = _byId('tokenFilesClearAll', c);
  if (!listEl) return;
  if (loadedFiles.length === 0) {
    listEl.innerHTML = '';
    if (countEl) countEl.textContent = '';
    if (clearBtn) clearBtn.classList.add('hidden');
    return;
  }
  if (countEl) countEl.textContent = loadedFiles.length + ' file' + (loadedFiles.length > 1 ? 's' : '') + ' loaded';
  if (clearBtn) clearBtn.classList.remove('hidden');
  var html = '';
  for (var i = 0; i < loadedFiles.length; i++) {
    var f = loadedFiles[i];
    html += '<div class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-sm">'
      + '<i class="fas fa-file-alt text-slate-400 text-xs"></i>'
      + '<span class="flex-1 truncate text-slate-700">' + dom.escapeHtml(f.name) + '</span>'
      + '<span class="text-xs text-slate-400 whitespace-nowrap">' + formatFileSize(f.size) + '</span>'
      + '<button type="button" class="tokenFileRemove p-0.5 rounded text-slate-400 hover:text-red-500 transition" data-idx="' + i + '" aria-label="Remove"><i class="fas fa-times text-xs"></i></button>'
      + '</div>';
  }
  listEl.innerHTML = html;
  /* attach remove handlers */
  var btns = listEl.querySelectorAll('.tokenFileRemove');
  for (var j = 0; j < btns.length; j++) {
    btns[j].addEventListener('click', (function (idx) {
      return function () {
        loadedFiles.splice(idx, 1);
        renderFileList(c);
      };
    })(parseInt(btns[j].getAttribute('data-idx'), 10)));
  }
}

function handleFilesSelected(c) {
  var inputEl = _byId('tokenFiles', c);
  if (!inputEl) return;
  var files = inputEl.files;
  if (!files || files.length === 0) return;

  var statusEl = _byId('tokenFilesStatus', c);
  if (statusEl) { statusEl.textContent = 'Reading ' + files.length + ' file(s)\u2026'; statusEl.classList.remove('hidden'); statusEl.className = 'mt-1 text-xs text-slate-600'; }
  setExtractButtonEnabled(c, false);

  var fileArr = Array.from(files);
  Promise.all(fileArr.map(function (file) {
    return readFileAsText(file).then(function (content) {
      return { name: file.name, size: file.size, content: content };
    });
  }))
    .then(function (results) {
      /* accumulate: skip duplicates by name */
      var existing = {};
      for (var k = 0; k < loadedFiles.length; k++) existing[loadedFiles[k].name] = true;
      for (var r = 0; r < results.length; r++) {
        if (!existing[results[r].name]) {
          loadedFiles.push(results[r]);
          existing[results[r].name] = true;
        }
      }
      renderFileList(c);
      if (statusEl) { statusEl.textContent = 'Files ready. Click Extract to use.'; statusEl.className = 'mt-1 text-xs text-green-600 font-medium'; }
      setExtractButtonEnabled(c, true);
      /* reset input so same file can be re-added after removal */
      inputEl.value = '';
    })
    .catch(function (err) {
      if (statusEl) { statusEl.textContent = err.message || 'Error reading file(s).'; statusEl.className = 'mt-1 text-xs text-red-600'; }
      setExtractButtonEnabled(c, true);
      inputEl.value = '';
    });
}

function clearAllFiles(c) {
  loadedFiles = [];
  renderFileList(c);
  var statusEl = _byId('tokenFilesStatus', c);
  if (statusEl) { statusEl.textContent = ''; statusEl.classList.add('hidden'); }
}

function getFilesContent() {
  if (loadedFiles.length === 0) return '';
  var parts = [];
  for (var i = 0; i < loadedFiles.length; i++) parts.push(loadedFiles[i].content);
  return parts.join('\n');
}

/* ── reset all (refresh) ──────────────────────────────────── */
function resetAllTokens(c) {
  var input = _byId('inputData', c);
  var customPattern = _byId('tokenCustomPattern', c);
  var searchInput = document.getElementById('tokensSearch');
  var fileInput = _byId('tokenFiles', c);
  var compareModal = _byId('tokensCompareModal', c);
  var compareInput = _byId('tokensCompareInput', c);
  if (input) input.value = '';
  if (customPattern) customPattern.value = '';
  if (searchInput) searchInput.value = '';
  if (fileInput) fileInput.value = '';
  if (compareInput) compareInput.value = '';
  if (compareModal) compareModal.classList.add('hidden');
  clearAllFiles(c);
  resetResults(c);
}

/* ── reset results ────────────────────────────────────────── */
function resetResults(c) {
  lastPaymentTokens = [];
  lastPayoutTokens = [];
  lastCardPaymentTokens = [];
  lastCustomTokens = [];
  var header = document.getElementById('tokensResultHeader');
  if (header) header.classList.add('hidden');
  var outputDiv = document.getElementById('output');
  if (outputDiv) { outputDiv.classList.remove('visible'); outputDiv.style.display = ''; }
  var paymentEl = document.getElementById('paymentTokensList');
  var payoutEl = document.getElementById('payoutTokensList');
  var cardPaymentEl = document.getElementById('cardPaymentTokensList');
  var customEl = document.getElementById('customTokensList');
  if (paymentEl) paymentEl.innerHTML = '';
  if (payoutEl) payoutEl.innerHTML = '';
  if (cardPaymentEl) cardPaymentEl.innerHTML = '';
  if (customEl) customEl.innerHTML = '';
  clearError(c);
}

/* ── main extract trigger ─────────────────────────────────── */
function extractPaymentAndPayoutTokens(c) {
  try {
    var inputEl = _byId('inputData', c);
    if (!inputEl) {
      showError(c, 'Input field not found. Try refreshing the page.');
      return;
    }
    var pasted = (inputEl.value && inputEl.value.trim) ? inputEl.value.trim() : '';
    var fromFiles = typeof getFilesContent === 'function' ? getFilesContent() : '';
    if (typeof fromFiles !== 'string') fromFiles = '';
    var combined = '';
    if (pasted && fromFiles) {
      combined = pasted + '\n' + fromFiles;
    } else if (pasted) {
      combined = pasted;
    } else if (fromFiles) {
      combined = fromFiles;
    }
    if (!combined || !combined.trim()) {
      showError(c, 'Input data is empty. Paste text or select files.');
      return;
    }
    runExtraction(c, combined.trim());
    var outputEl = _byId('output', c);
    if (outputEl && outputEl.scrollIntoView) outputEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (err) {
    showError(c, 'Extract failed: ' + (err && err.message ? err.message : String(err)));
  }
}

/* ── modal helpers ────────────────────────────────────────── */
function openModal(c) {
  var modal = _byId('tokenAdvancedModal', c);
  if (!modal) return;

  /* populate form from saved settings */
  var toggle = _byId('tokenAdvancedToggle', c);
  if (toggle) toggle.checked = advancedSettings.enabled;

  var lp = _byId('tokenOptLabelPairs', c);
  if (lp) lp.checked = advancedSettings.extractLabelPairs;
  var pp = _byId('tokenOptPaymentPrefix', c);
  if (pp) pp.checked = advancedSettings.extractPaymentPrefix;
  var po = _byId('tokenOptPayoutPrefix', c);
  if (po) po.checked = advancedSettings.extractPayoutPrefix;

  var ml = _byId('tokenOptMinLength', c);
  if (ml) ml.value = advancedSettings.minLength;

  var anyRadio = _byId('tokenCharsAny', c);
  var digRadio = _byId('tokenCharsDigits', c);
  if (anyRadio) anyRadio.checked = (advancedSettings.tokenChars === 'any');
  if (digRadio) digRadio.checked = (advancedSettings.tokenChars === 'digits');

  var exc = _byId('tokenOptExclude', c);
  if (exc) exc.value = advancedSettings.excludeList.join(', ');

  syncFieldsState(c);
  modal.classList.remove('hidden');
}

function closeModal(c) {
  var modal = _byId('tokenAdvancedModal', c);
  if (modal) modal.classList.add('hidden');
}

function syncFieldsState(c) {
  var toggle = _byId('tokenAdvancedToggle', c);
  var fields = _byId('tokenAdvancedFields', c);
  if (!toggle || !fields) return;
  if (toggle.checked) {
    fields.classList.remove('opacity-40');
    fields.classList.remove('pointer-events-none');
  } else {
    fields.classList.add('opacity-40');
    fields.classList.add('pointer-events-none');
  }
}

function saveModalSettings(c) {
  var toggle = _byId('tokenAdvancedToggle', c);
  advancedSettings.enabled = toggle ? toggle.checked : false;

  if (advancedSettings.enabled) {
    var lp = _byId('tokenOptLabelPairs', c);
    advancedSettings.extractLabelPairs = lp ? lp.checked : true;
    var pp = _byId('tokenOptPaymentPrefix', c);
    advancedSettings.extractPaymentPrefix = pp ? pp.checked : false;
    var po = _byId('tokenOptPayoutPrefix', c);
    advancedSettings.extractPayoutPrefix = po ? po.checked : false;

    var ml = _byId('tokenOptMinLength', c);
    var raw = ml ? parseInt(ml.value, 10) : DEFAULT_MIN_TOKEN_LENGTH;
    advancedSettings.minLength = (isNaN(raw) || raw < 1) ? DEFAULT_MIN_TOKEN_LENGTH : raw;

    var digRadio = _byId('tokenCharsDigits', c);
    advancedSettings.tokenChars = (digRadio && digRadio.checked) ? 'digits' : 'any';

    var exc = _byId('tokenOptExclude', c);
    var excStr = exc ? exc.value : '';
    advancedSettings.excludeList = excStr
      ? excStr.split(/[\n,]+/).map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean)
      : [];
  }

  /* update badge */
  var badge = _byId('tokenAdvancedBadge', c);
  if (badge) badge.classList.toggle('hidden', !advancedSettings.enabled);

  closeModal(c);
  resetResults(c);
}

/* ── compare tokens ───────────────────────────────────────── */
function parseTokensFromText(text) {
  if (!text || typeof text !== 'string') return [];
  return text.split(/[\r\n]+/).map(function (s) { return s.trim(); }).filter(function (s) { return s && isValidToken(s); });
}

function openCompareModal(c) {
  var modal = _byId('tokensCompareModal', c);
  if (!modal) return;
  var input = _byId('tokensCompareInput', c);
  var result = _byId('tokensCompareResult', c);
  if (input) input.value = '';
  if (result) { result.innerHTML = ''; result.classList.add('hidden'); }
  modal.classList.remove('hidden');
  if (input) input.focus();
}

function closeCompareModal(c) {
  var modal = _byId('tokensCompareModal', c);
  if (modal) modal.classList.add('hidden');
}

function runCompare(c) {
  var input = _byId('tokensCompareInput', c);
  var resultEl = _byId('tokensCompareResult', c);
  if (!input || !resultEl) return;

  var extracted = [].concat(
    (lastPaymentTokens || []).filter(isValidToken),
    (lastPayoutTokens || []).filter(isValidToken),
    (lastCardPaymentTokens || []).filter(isValidToken),
    (lastCustomTokens || []).filter(isValidToken)
  );
  extracted = Array.from(new Set(extracted));

  var pasted = parseTokensFromText(input.value);

  if (extracted.length === 0 && pasted.length === 0) {
    resultEl.innerHTML = '<p class="text-slate-500 text-sm">No tokens to compare. Extract tokens first, then paste tokens to compare.</p>';
    resultEl.classList.remove('hidden');
    return;
  }

  var extractedSet = new Set(extracted.map(function (t) { return String(t).toLowerCase(); }));
  var pastedSet = new Set(pasted.map(function (t) { return String(t).toLowerCase(); }));

  var inBoth = [];
  var onlyExtracted = [];
  var onlyPasted = [];

  extracted.forEach(function (t) {
    var key = String(t).toLowerCase();
    if (pastedSet.has(key)) inBoth.push(t);
    else onlyExtracted.push(t);
  });
  pasted.forEach(function (t) {
    var key = String(t).toLowerCase();
    if (!extractedSet.has(key)) onlyPasted.push(t);
  });

  function renderSection(title, tokens, icon, bgCls, borderCls) {
    if (tokens.length === 0) return '';
    var list = tokens.map(function (t) { return '<li class="py-1 px-2 rounded font-mono text-sm">' + dom.escapeHtml(String(t)) + '</li>'; }).join('');
    var copyText = tokens.join('\n');
    var copyBtn = '<button type="button" class="compare-copy-btn inline-flex items-center gap-1 rounded-lg bg-slate-600 hover:bg-slate-700 text-white px-2 py-1 text-xs font-medium transition" data-copy-text="' + dom.escapeHtml(JSON.stringify(copyText)) + '" title="Copy"><i class="fas fa-copy"></i></button>';
    return '<div class="rounded-xl border-2 ' + borderCls + ' ' + bgCls + ' p-4">' +
      '<div class="flex items-center justify-between mb-2">' +
      '<h4 class="text-sm font-semibold text-slate-800"><i class="fas ' + icon + ' mr-1.5"></i>' + dom.escapeHtml(title) + ' <span class="font-normal text-slate-500">(' + tokens.length + ')</span></h4>' +
      copyBtn +
      '</div>' +
      '<ul class="space-y-0.5 max-h-48 overflow-y-auto">' + list + '</ul>' +
      '</div>';
  }

  var html = '<div class="grid grid-cols-1 md:grid-cols-3 gap-4">' +
    renderSection('In both', inBoth, 'fa-check-circle', 'bg-emerald-50', 'border-emerald-200') +
    renderSection('Only in extracted', onlyExtracted, 'fa-minus-circle', 'bg-amber-50', 'border-amber-200') +
    renderSection('Only in pasted', onlyPasted, 'fa-plus-circle', 'bg-blue-50', 'border-blue-200') +
    '</div>';

  resultEl.innerHTML = html;
  resultEl.classList.remove('hidden');
}

function resetToDefaults(c) {
  advancedSettings.enabled = false;
  advancedSettings.minLength = DEFAULT_MIN_TOKEN_LENGTH;
  advancedSettings.extractPaymentPrefix = true;
  advancedSettings.extractPayoutPrefix = true;
  advancedSettings.extractLabelPairs = true;
  advancedSettings.tokenChars = 'any';
  advancedSettings.excludeList = [];

  /* repopulate the form */
  var toggle = _byId('tokenAdvancedToggle', c);
  if (toggle) toggle.checked = false;
  var lp = _byId('tokenOptLabelPairs', c);
  if (lp) lp.checked = true;
  var pp = _byId('tokenOptPaymentPrefix', c);
  if (pp) pp.checked = true;
  var po = _byId('tokenOptPayoutPrefix', c);
  if (po) po.checked = true;
  var ml = _byId('tokenOptMinLength', c);
  if (ml) ml.value = DEFAULT_MIN_TOKEN_LENGTH;
  var anyRadio = _byId('tokenCharsAny', c);
  if (anyRadio) anyRadio.checked = true;
  var digRadio = _byId('tokenCharsDigits', c);
  if (digRadio) digRadio.checked = false;
  var exc = _byId('tokenOptExclude', c);
  if (exc) exc.value = '';

  syncFieldsState(c);
}

/* ── mount ────────────────────────────────────────────────── */
function mount(c) {
  /* Extract button */
  var btn = _byId('extractTokensBtn', c);
  if (btn) btn.addEventListener('click', function () { extractPaymentAndPayoutTokens(c); });

  var refreshBtn = _byId('tokensRefreshBtn', c);
  if (refreshBtn) refreshBtn.addEventListener('click', function () { resetAllTokens(c); });

  var demoBtn = _byId('tokensDemoBtn', c);
  if (demoBtn) demoBtn.addEventListener('click', function () {
    var input = _byId('inputData', c);
    if (input) {
      input.value = generateDemoTokens();
      input.focus();
    }
  });

  /* File input + clear all */
  var fileInput = _byId('tokenFiles', c);
  if (fileInput) fileInput.addEventListener('change', function () { handleFilesSelected(c); });
  var clearAllBtn = _byId('tokenFilesClearAll', c);
  if (clearAllBtn) clearAllBtn.addEventListener('click', function () { clearAllFiles(c); });
  /* render existing files (if navigating back to this view) */
  renderFileList(c);

  /* Search filter */
  var searchInput = _byId('tokensSearch', c);
  if (searchInput) {
    searchInput.addEventListener('input', function () { applyTokenListFilter(c, this.value); });
    searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { this.value = ''; applyTokenListFilter(c, ''); this.blur(); }
    });
  }
  var searchClear = _byId('tokensSearchClear', c);
  if (searchClear) searchClear.addEventListener('click', function () {
    var input = _byId('tokensSearch', c);
    if (input) { input.value = ''; applyTokenListFilter(c, ''); input.focus(); }
  });

  /* Compare modal */
  var compareBtn = _byId('tokensCompareBtn', c);
  if (compareBtn) compareBtn.addEventListener('click', function () { openCompareModal(c); });
  var compareClose = _byId('tokensCompareClose', c);
  if (compareClose) compareClose.addEventListener('click', function () { closeCompareModal(c); });
  var compareRun = _byId('tokensCompareRunBtn', c);
  if (compareRun) compareRun.addEventListener('click', function () { runCompare(c); });
  var compareModal = _byId('tokensCompareModal', c);
  if (compareModal) {
    compareModal.addEventListener('click', function (e) {
      if (e.target === compareModal) closeCompareModal(c);
      var btn = e.target && e.target.closest ? e.target.closest('.compare-copy-btn') : null;
      if (btn) {
        var raw = btn.getAttribute('data-copy-text');
        var text = raw;
        try { text = raw ? JSON.parse(raw) : ''; } catch (_) {}
        if (text && dom.copyToClipboard) {
          dom.copyToClipboard(text).then(function (ok) {
            if (ok) {
              var orig = btn.innerHTML;
              btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
              setTimeout(function () { btn.innerHTML = orig; }, 1500);
            }
          });
        }
      }
    });
  }

  /* Reset when custom pattern changes (not on textarea – user may edit and re-extract) */
  var customPatternEl = _byId('tokenCustomPattern', c);
  if (customPatternEl) customPatternEl.addEventListener('input', function () { resetResults(c); });

  /* Advanced Settings modal */
  var advBtn = _byId('tokenAdvancedBtn', c);
  if (advBtn) advBtn.addEventListener('click', function () { openModal(c); });

  var advClose = _byId('tokenAdvancedClose', c);
  if (advClose) advClose.addEventListener('click', function () { closeModal(c); });

  var advCancel = _byId('tokenAdvancedCancel', c);
  if (advCancel) advCancel.addEventListener('click', function () { closeModal(c); });

  var advSave = _byId('tokenAdvancedSave', c);
  if (advSave) advSave.addEventListener('click', function () { saveModalSettings(c); });

  var advReset = _byId('tokenAdvancedReset', c);
  if (advReset) advReset.addEventListener('click', function () { resetToDefaults(c); });

  /* toggle enable/disable inside modal */
  var advToggle = _byId('tokenAdvancedToggle', c);
  if (advToggle) advToggle.addEventListener('change', function () { syncFieldsState(c); });

  /* close modal on backdrop click */
  var modal = _byId('tokenAdvancedModal', c);
  if (modal) modal.addEventListener('click', function (e) {
    if (e.target === modal) closeModal(c);
  });

  /* close modal on Escape */
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var compareModalEl = _byId('tokensCompareModal', c);
    if (compareModalEl && !compareModalEl.classList.contains('hidden')) {
      closeCompareModal(c);
      return;
    }
    if (modal && !modal.classList.contains('hidden')) {
      closeModal(c);
    }
  });

  /* set initial badge state */
  var badge = _byId('tokenAdvancedBadge', c);
  if (badge) badge.classList.toggle('hidden', !advancedSettings.enabled);

  /* Copy buttons for token lists */
  var copyPaymentBtn = _byId('copyPaymentTokensBtn', c);
  if (copyPaymentBtn) {
    copyPaymentBtn.addEventListener('click', function() {
      var tokens = lastPaymentTokens.filter(isValidToken);
      var text = tokens.join('\n');
      if (text && dom.copyToClipboard) {
        dom.copyToClipboard(text).then(function(success) {
          if (success) {
            var originalHtml = copyPaymentBtn.innerHTML;
            copyPaymentBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
            copyPaymentBtn.classList.add('bg-indigo-700');
            setTimeout(function() {
              copyPaymentBtn.innerHTML = originalHtml;
              copyPaymentBtn.classList.remove('bg-indigo-700');
            }, 2000);
          }
        });
      }
    });
  }

  var copyPayoutBtn = _byId('copyPayoutTokensBtn', c);
  if (copyPayoutBtn) {
    copyPayoutBtn.addEventListener('click', function() {
      var tokens = lastPayoutTokens.filter(isValidToken);
      var text = tokens.join('\n');
      if (text && dom.copyToClipboard) {
        dom.copyToClipboard(text).then(function(success) {
          if (success) {
            var originalHtml = copyPayoutBtn.innerHTML;
            copyPayoutBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
            copyPayoutBtn.classList.add('bg-indigo-700');
            setTimeout(function() {
              copyPayoutBtn.innerHTML = originalHtml;
              copyPayoutBtn.classList.remove('bg-indigo-700');
            }, 2000);
          }
        });
      }
    });
  }

  var copyCardPaymentBtn = _byId('copyCardPaymentTokensBtn', c);
  if (copyCardPaymentBtn) {
    copyCardPaymentBtn.addEventListener('click', function() {
      var tokens = lastCardPaymentTokens.filter(isValidToken);
      var text = tokens.join('\n');
      if (text && dom.copyToClipboard) {
        dom.copyToClipboard(text).then(function(success) {
          if (success) {
            var originalHtml = copyCardPaymentBtn.innerHTML;
            copyCardPaymentBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
            copyCardPaymentBtn.classList.add('bg-indigo-700');
            setTimeout(function() {
              copyCardPaymentBtn.innerHTML = originalHtml;
              copyCardPaymentBtn.classList.remove('bg-indigo-700');
            }, 2000);
          }
        });
      }
    });
  }

  var copyCustomBtn = _byId('copyCustomTokensBtn', c);
  if (copyCustomBtn) {
    copyCustomBtn.addEventListener('click', function() {
      var tokens = lastCustomTokens.filter(isValidToken);
      var text = tokens.join('\n');
      if (text && dom.copyToClipboard) {
        dom.copyToClipboard(text).then(function(success) {
          if (success) {
            var originalHtml = copyCustomBtn.innerHTML;
            copyCustomBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
            copyCustomBtn.classList.add('bg-indigo-700');
            setTimeout(function() {
              copyCustomBtn.innerHTML = originalHtml;
              copyCustomBtn.classList.remove('bg-indigo-700');
            }, 2000);
          }
        });
      }
    });
  }

  setExtractButtonEnabled(c, true);
}

/* ── register ─────────────────────────────────────────────── */
var tokensView = {
  route: 'tokens',
  navLabel: 'Tokens Extractor',
  render: render,
  mount: mount
};
(function () {
  window.MonitorToolsViews = window.MonitorToolsViews || {};
  window.MonitorToolsViews.tokensView = tokensView;
})();

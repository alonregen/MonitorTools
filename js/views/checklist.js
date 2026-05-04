/**
 * Shift Checklist view - friendly, playful checklist with local persistence.
 */
(function () {
  var dom = (window.App && window.App.dom) ? window.App.dom : null;
  var escapeHtml = dom && dom.escapeHtml ? dom.escapeHtml : function (text) { return String(text || ''); };

  var STORAGE_KEY = 'monitor_tools_shift_checklist_v1';
  var HISTORY_LIMIT = 6;
  var rootEl = null;
  var state = {};
  var onInputHandler = null;
  var onClickHandler = null;
  var onBackupFileChange = null;
  var historyUnlocked = false;
  var historyUnlockError = '';
  var emailSendState = { status: 'idle', message: '' };
  var checklistToastTimer = null;
  var historyViewKeydownHandler = null;
  /** After unlock without `MONITOR_TOOLS_SHIFT_HISTORY_PASSWORD`, holds the typed passphrase for encrypt/re-save until Lock. */
  var sessionHistoryPassword = '';
  /** When shift history is encrypted, canonical list for merge/persist (not shown in DevTools `state` while locked). */
  var historyPlainShadow = [];
  /** Resolves after encrypted history is decrypted into `historyPlainShadow` (or immediately if not needed). */
  var historyHydrationPromise = Promise.resolve();
  var persistChain = Promise.resolve();
  /** PBKDF2-derived AES keys keyed by salt (base64); reuse same salt across encrypts to avoid 150k iterations every toggle. */
  var pbkdfKeyPromises = {};
  var PBKDF2_ITERATIONS = 150000;
  var HISTORY_ENC_VERSION = 1;
  /** Full localStorage payload encrypted for optional git commit (separate from in-browser history crypto). */
  var FILE_BACKUP_KIND = 'monitor_tools_checklist_local_v1';
  var FILE_BACKUP_VERSION = 1;
  /** Set before render via prepareRoute / mount so `#/shift-history` can show history without full checklist UI. */
  var routePathForLayout = 'checklist';

  function isHistoryOnlyLayout() {
    return routePathForLayout === 'shift-history';
  }

  function prepareRoute(deps) {
    routePathForLayout = (deps && deps.routePath) || 'checklist';
  }

  var checklistSections = [
    {
      id: 'preShift',
      title: '🛫 Start Shift',
      items: [
        { id: 'lastShiftReady', emoji: '📋', title: 'Review last shift — ready to start', hint: 'I talked with the previous shift, got all the information and data, and I am ready to start my shift.', allowNote: false },
        { id: 'checkSlack', emoji: '💬', title: 'Check Slack', hint: 'Channels, DMs, and alerts — see what is live, handled, or needs you now.', allowNote: false },
        { id: 'checkHubspot', emoji: '🟠', title: 'Check HubSpot', hint: 'Tickets and active payouts queue.', allowNote: false },
        {
          id: 'openMonitoring',
          emoji: '📊',
          title: 'Open monitoring',
          hint: 'Bring up each view below so nothing is missing from your screen.',
          allowNote: false,
          subItems: [
            { id: 'hubspot', label: 'HubSpot', emoji: '🟠' },
            { id: 'opensearch', label: 'OpenSearch monitoring', emoji: '🔎' },
            { id: 'tvDashboard', label: 'TV dashboard', emoji: '📺' },
            { id: 'tabswitcher', label: 'TabSwitcher', emoji: '🔀' },
            { id: 'looker', label: 'Looker', emoji: '📈' },
            { id: 'datadog', label: 'Datadog', emoji: '🐕' },
            { id: 'onCall', label: 'On-call list', emoji: '☎️' },
            { id: 'hibob', label: 'HiBob', emoji: '👥' },
            { id: 'clientPortal', label: 'Client portal', emoji: '🌐' },
            { id: 'rbo', label: 'RBO', emoji: '📑' }
          ]
        },
        {
          id: 'jiraReview',
          emoji: '🧩',
          title: 'Check Jira boards',
          hint: 'Open these three MON boards and scan updates, comments, and priority tickets.',
          allowNote: false,
          subItems: [
            { id: 'jiraMonExternal', label: 'MON External', emoji: '🌐' },
            { id: 'jiraMonDashAlert', label: 'MON Dash/Alert', emoji: '🔔' },
            { id: 'jiraMonVersioning', label: 'MON Versioning', emoji: '🏷️' }
          ]
        },
        {
          id: 'jiraBacklogAllBoards',
          emoji: '📥',
          title: 'Review backlog on all Jira boards',
          hint: 'Tick each board after you have reviewed its backlog — nothing critical hiding in the queue.',
          allowNote: false,
          subItems: [
            { id: 'jiraBacklogExternal', label: 'MON External — backlog', emoji: '🌐' },
            { id: 'jiraBacklogDashAlert', label: 'MON Dash/Alert — backlog', emoji: '🔔' },
            { id: 'jiraBacklogVersioning', label: 'MON Versioning — backlog', emoji: '🏷️' }
          ]
        }
      ]
    },
    {
      id: 'duringShift',
      title: '🛰️ During Shift',
      items: [
        { id: 'checkActivePayoutsQueue', emoji: '💸', title: 'Check Active payouts queue', hint: 'Scan the queue for new items, stuck payouts, or anything needing action.', allowNote: false },
        {
          id: 'systemHealthFirst',
          emoji: '1️⃣',
          title: 'System health check #1',
          hint: 'First check in your 2-hour cycle. Open main dashboards and verify all key metrics are steady.',
          allowNote: false,
          trackCompletedAt: true,
          subItems: [
            { id: 'sh1OpenSearch', label: 'OpenSearch dashboard', emoji: '🔎' },
            { id: 'sh1Looker', label: 'Looker views', emoji: '📈' },
            { id: 'sh1MonJira', label: 'MON Jira ticket', emoji: '🧩' }
          ]
        },
        { id: 'systemHealthSecond', emoji: '2️⃣', title: 'System health check #2', hint: 'Second check in your 2-hour cycle.', allowNote: false, trackCompletedAt: true },
        { id: 'systemHealthThird', emoji: '3️⃣', title: 'System health check #3', hint: 'Third check in your 2-hour cycle.', allowNote: false, trackCompletedAt: true },
        { id: 'systemHealthFourth', emoji: '4️⃣', title: 'System health check #4', hint: 'Final cycle check to close the shift strong.', allowNote: false, trackCompletedAt: true }
      ]
    },
    {
      id: 'endShift',
      title: '🌙 End Shift',
      items: [
        { id: 'openTicketsReview', emoji: '🎫', title: 'Review open tickets and incidents', hint: 'Make sure follow-up instructions and links are clear.', allowNote: true },
        { id: 'nightReset', emoji: '💻', title: 'Night shift reset/update if needed', hint: 'Finish any pending reset or update before you sign off if the shift requires it.', allowNote: false },
        { id: 'ongoingHandoverPrep', emoji: '📝', title: 'Prepare handover context continuously', hint: 'Keep unresolved items ready for the next shift.', allowNote: false },
        { id: 'handoverUnresolved', emoji: '🤝', title: 'Pass unresolved issues forward', hint: 'Handover ownership and next actions to the next shift.', allowNote: true },
        { id: 'shiftReportUpdate', emoji: '📄', title: 'Update shift report', hint: 'Summarize incidents, actions, resolutions, and important updates.', allowNote: true }
      ]
    }
  ];

  function itemKey(sectionId, itemId) {
    return sectionId + '.' + itemId;
  }

  function normalizeShiftSlot(raw) {
    if (raw === 'morning' || raw === 'evening' || raw === 'night') return raw;
    return '';
  }

  function shiftSlotExportLabel(slot) {
    if (slot === 'morning') return 'Morning (07:00–15:00)';
    if (slot === 'evening') return 'Evening (15:00–23:00)';
    if (slot === 'night') return 'Night (23:00–07:00)';
    return '';
  }

  function getItemByKey(key) {
    for (var i = 0; i < checklistSections.length; i += 1) {
      var section = checklistSections[i];
      for (var j = 0; j < section.items.length; j += 1) {
        var item = section.items[j];
        if (itemKey(section.id, item.id) === key) return item;
      }
    }
    return null;
  }

  function itemHasSubItems(item) {
    return !!(item && Array.isArray(item.subItems) && item.subItems.length);
  }

  function buildDefaultSubMap(item) {
    var o = {};
    item.subItems.forEach(function (si) {
      o[si.id] = false;
    });
    return o;
  }

  function sanitizeSubForItem(item, rawSub) {
    var out = buildDefaultSubMap(item);
    if (!rawSub || typeof rawSub !== 'object') return out;
    item.subItems.forEach(function (si) {
      if (rawSub[si.id] === true) out[si.id] = true;
    });
    return out;
  }

  function countSubCompletion(entry, item) {
    var n = 0;
    var sub = entry && entry.sub ? entry.sub : {};
    item.subItems.forEach(function (si) {
      if (sub[si.id]) n += 1;
    });
    return { checked: n, total: item.subItems.length };
  }

  function allSubsChecked(entry, item) {
    var c = countSubCompletion(entry, item);
    return c.total > 0 && c.checked === c.total;
  }

  function normalizedCompletedAt(entry, item) {
    if (!item || !item.trackCompletedAt || !entry) return null;
    var done = itemHasSubItems(item) ? allSubsChecked(entry, item) : !!entry.checked;
    if (!done) return null;
    var at = entry.completedAt;
    if (typeof at !== 'number' || !Number.isFinite(at)) return null;
    return at;
  }

  function formatCompletedAtReadable(entry, item) {
    var at = normalizedCompletedAt(entry, item);
    if (at == null) return '';
    return 'Completed at: ' + new Date(at).toLocaleString();
  }

  function buildDefaultState() {
    var next = { __meta: { shiftOwner: '', shiftSlot: '', shiftHistory: [], shiftHistoryEnc: null } };
    checklistSections.forEach(function (section) {
      section.items.forEach(function (item) {
        var key = itemKey(section.id, item.id);
        if (itemHasSubItems(item)) {
          var subEntry = { note: '', sub: buildDefaultSubMap(item), subPanelOpen: true };
          if (item.trackCompletedAt) subEntry.completedAt = null;
          next[key] = subEntry;
          return;
        }
        var base = { checked: false, note: '' };
        if (item.trackCompletedAt) base.completedAt = null;
        next[key] = base;
      });
    });
    return next;
  }

  function copyChecklistEntries(srcState, cleaned) {
    Object.keys(srcState).forEach(function (key) {
      if (key === '__meta') return;
      var item = getItemByKey(key);
      if (!item) return;
      var entry = srcState[key] || {};
      if (itemHasSubItems(item)) {
        var subClean = {
          note: item.allowNote && typeof entry.note === 'string' ? entry.note : '',
          sub: sanitizeSubForItem(item, entry.sub)
        };
        if (item.trackCompletedAt) {
          var subDone = allSubsChecked(entry, item);
          subClean.completedAt = (subDone && typeof entry.completedAt === 'number' && Number.isFinite(entry.completedAt))
            ? entry.completedAt
            : null;
        }
        cleaned[key] = subClean;
        return;
      }
      var row = {
        checked: !!entry.checked,
        note: item.allowNote && typeof entry.note === 'string' ? entry.note : ''
      };
      if (item.trackCompletedAt) {
        row.completedAt = (row.checked && typeof entry.completedAt === 'number' && Number.isFinite(entry.completedAt))
          ? entry.completedAt
          : null;
      }
      cleaned[key] = row;
    });
  }

  function sanitizeStateForPersistence(srcState) {
    var cleaned = { __meta: { shiftOwner: '', shiftSlot: '', shiftHistory: [] } };
    var meta = srcState.__meta || {};
    cleaned.__meta.shiftOwner = typeof meta.shiftOwner === 'string' ? meta.shiftOwner : '';
    cleaned.__meta.shiftSlot = normalizeShiftSlot(meta.shiftSlot);
    cleaned.__meta.shiftHistory = sanitizeShiftHistory(meta.shiftHistory);
    if (!historyEncryptActive() && meta.shiftHistoryEnc) {
      cleaned.__meta.shiftHistoryEnc = meta.shiftHistoryEnc;
    }
    copyChecklistEntries(srcState, cleaned);
    if (!cleaned.__meta.shiftHistoryEnc) delete cleaned.__meta.shiftHistoryEnc;
    return cleaned;
  }

  function loadState() {
    var defaults = buildDefaultState();
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaults;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return defaults;
      var parsedMeta = parsed.__meta || {};
      var encFromDisk = parseShiftHistoryEnc(parsedMeta.shiftHistoryEnc);
      var legacyPlain = sanitizeShiftHistory(parsedMeta.shiftHistory);
      var pass = getHistoryPassword();
      var cryptoOk = usesWebCrypto();
      var shiftOwner = typeof parsedMeta.shiftOwner === 'string' ? parsedMeta.shiftOwner : '';
      var shiftSlot = normalizeShiftSlot(parsedMeta.shiftSlot);
      var oldNightResetKey = 'duringShift.nightReset';
      var newNightResetKey = 'endShift.nightReset';
      if (parsed[oldNightResetKey] && typeof parsed[oldNightResetKey] === 'object' && parsed[newNightResetKey] === undefined) {
        parsed[newNightResetKey] = parsed[oldNightResetKey];
      }
      var oldHandoverPrepKey = 'duringShift.ongoingHandoverPrep';
      var newHandoverPrepKey = 'endShift.ongoingHandoverPrep';
      if (parsed[oldHandoverPrepKey] && typeof parsed[oldHandoverPrepKey] === 'object' && parsed[newHandoverPrepKey] === undefined) {
        parsed[newHandoverPrepKey] = parsed[oldHandoverPrepKey];
      }
      Object.keys(defaults).forEach(function (key) {
        if (key === '__meta') {
          if (pass && encFromDisk && cryptoOk) {
            defaults.__meta = { shiftOwner: shiftOwner, shiftSlot: shiftSlot, shiftHistory: [], shiftHistoryEnc: encFromDisk };
          } else if (!pass && encFromDisk && cryptoOk) {
            defaults.__meta = { shiftOwner: shiftOwner, shiftSlot: shiftSlot, shiftHistory: [], shiftHistoryEnc: encFromDisk };
          } else if (pass && !encFromDisk && legacyPlain.length && cryptoOk) {
            defaults.__meta = { shiftOwner: shiftOwner, shiftSlot: shiftSlot, shiftHistory: legacyPlain, shiftHistoryEnc: null };
          } else {
            defaults.__meta = {
              shiftOwner: shiftOwner,
              shiftSlot: shiftSlot,
              shiftHistory: legacyPlain,
              shiftHistoryEnc: (pass && encFromDisk && !cryptoOk) ? encFromDisk : null
            };
          }
          return;
        }
        var item = getItemByKey(key);
        var src = parsed[key];
        if (!item || !src || typeof src !== 'object') return;
        if (itemHasSubItems(item)) {
          var mergedSub = {
            note: item.allowNote && typeof src.note === 'string' ? src.note : '',
            sub: sanitizeSubForItem(item, src.sub),
            subPanelOpen: src.subPanelOpen !== false
          };
          if (item.trackCompletedAt) {
            var mergedSubDone = allSubsChecked(mergedSub, item);
            var srcAt = src.completedAt;
            mergedSub.completedAt = (mergedSubDone && typeof srcAt === 'number' && Number.isFinite(srcAt)) ? srcAt : null;
          }
          defaults[key] = mergedSub;
          return;
        }
        var merged = {
          checked: !!src.checked,
          note: item.allowNote && typeof src.note === 'string' ? src.note : ''
        };
        if (item.trackCompletedAt) {
          var at = src.completedAt;
          merged.completedAt = (merged.checked && typeof at === 'number' && Number.isFinite(at)) ? at : null;
        }
        defaults[key] = merged;
      });
      var shFirstKey = 'duringShift.systemHealthFirst';
      var shLegacy = parsed[shFirstKey];
      var shDef = getItemByKey(shFirstKey);
      if (shDef && itemHasSubItems(shDef) && shLegacy && typeof shLegacy === 'object' && shLegacy.checked === true && !shLegacy.sub && defaults[shFirstKey] && defaults[shFirstKey].sub) {
        var noSubsYet = Object.keys(defaults[shFirstKey].sub).every(function (id) { return !defaults[shFirstKey].sub[id]; });
        if (noSubsYet) {
          shDef.subItems.forEach(function (si) { defaults[shFirstKey].sub[si.id] = true; });
          if (shDef.trackCompletedAt) {
            var legAt = shLegacy.completedAt;
            defaults[shFirstKey].completedAt = (typeof legAt === 'number' && Number.isFinite(legAt)) ? legAt : Date.now();
          }
        }
      }
      return defaults;
    } catch (e) {
      return defaults;
    }
  }

  function usesWebCrypto() {
    return typeof window.crypto !== 'undefined' && !!window.crypto.subtle;
  }

  function usesCryptoForHistory() {
    return !!getHistoryPassword() && usesWebCrypto();
  }

  function effectiveHistoryPassword() {
    var g = getHistoryPassword();
    if (g) return g;
    if (typeof sessionHistoryPassword === 'string' && sessionHistoryPassword) return sessionHistoryPassword;
    return '';
  }

  /** Encrypted persist path (global password and/or session passphrase after typed unlock). */
  function historyEncryptActive() {
    return usesWebCrypto() && (!!getHistoryPassword() || !!sessionHistoryPassword);
  }

  /** Encrypted history list lives in `historyPlainShadow` when this is true. */
  function historyDataInShadow() {
    if (!usesWebCrypto()) return false;
    if (historyEncryptActive()) return true;
    return !!(historyUnlocked && parseShiftHistoryEnc(state.__meta && state.__meta.shiftHistoryEnc));
  }

  function parseShiftHistoryEnc(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (Number(raw.v) !== HISTORY_ENC_VERSION) return null;
    if (typeof raw.salt !== 'string' || typeof raw.iv !== 'string' || typeof raw.ct !== 'string') return null;
    if (!raw.salt || !raw.iv || !raw.ct) return null;
    return { v: HISTORY_ENC_VERSION, salt: raw.salt, iv: raw.iv, ct: raw.ct };
  }

  function randomBytes(n) {
    var a = new Uint8Array(n);
    window.crypto.getRandomValues(a);
    return a;
  }

  function bytesToB64(buf) {
    var s = '';
    for (var i = 0; i < buf.length; i += 1) s += String.fromCharCode(buf[i]);
    return btoa(s);
  }

  function b64ToBytes(str) {
    var bin = atob(str);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  }

  function getKeyForSalt(password, saltBytes) {
    var saltKey = bytesToB64(saltBytes);
    if (!pbkdfKeyPromises[saltKey]) {
      pbkdfKeyPromises[saltKey] = (function () {
        var enc = new TextEncoder();
        return window.crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']).then(function (keyMaterial) {
          return window.crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt: saltBytes, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
          );
        });
      })();
    }
    return pbkdfKeyPromises[saltKey];
  }

  function encryptShiftHistoryBlob(password, historyArr, prevEnc) {
    var saltBytes;
    if (prevEnc && prevEnc.salt) {
      try {
        saltBytes = b64ToBytes(prevEnc.salt);
      } catch (e1) {
        saltBytes = null;
      }
    }
    if (!saltBytes || saltBytes.length < 8) saltBytes = randomBytes(16);
    var iv = randomBytes(12);
    return getKeyForSalt(password, saltBytes).then(function (key) {
      var te = new TextEncoder();
      var plain = te.encode(JSON.stringify(historyArr));
      return window.crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, plain).then(function (ctBuf) {
        return {
          v: HISTORY_ENC_VERSION,
          salt: bytesToB64(saltBytes),
          iv: bytesToB64(iv),
          ct: bytesToB64(new Uint8Array(ctBuf))
        };
      });
    });
  }

  function decryptShiftHistoryBlob(password, enc) {
    var saltBytes = b64ToBytes(enc.salt);
    var iv = b64ToBytes(enc.iv);
    var ct = b64ToBytes(enc.ct);
    return getKeyForSalt(password, saltBytes).then(function (key) {
      return window.crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, ct).then(function (plainBuf) {
        var td = new TextDecoder();
        var arr = JSON.parse(td.decode(plainBuf));
        if (!Array.isArray(arr)) throw new Error('invalid history payload');
        return sanitizeShiftHistory(arr);
      });
    });
  }

  function encryptChecklistFileBackup(password, utf8Payload) {
    var saltBytes = randomBytes(16);
    var iv = randomBytes(12);
    return getKeyForSalt(password, saltBytes).then(function (key) {
      var te = new TextEncoder();
      return window.crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, te.encode(utf8Payload)).then(function (ctBuf) {
        return {
          kind: FILE_BACKUP_KIND,
          v: FILE_BACKUP_VERSION,
          salt: bytesToB64(saltBytes),
          iv: bytesToB64(iv),
          ct: bytesToB64(new Uint8Array(ctBuf))
        };
      });
    });
  }

  function parseFileBackupEnvelope(obj) {
    if (!obj || typeof obj !== 'object') return null;
    if (obj.kind !== FILE_BACKUP_KIND || Number(obj.v) !== FILE_BACKUP_VERSION) return null;
    if (typeof obj.salt !== 'string' || typeof obj.iv !== 'string' || typeof obj.ct !== 'string') return null;
    if (!obj.salt || !obj.iv || !obj.ct) return null;
    return { salt: obj.salt, iv: obj.iv, ct: obj.ct };
  }

  function decryptChecklistFileBackup(password, enc) {
    var saltBytes = b64ToBytes(enc.salt);
    var iv = b64ToBytes(enc.iv);
    var ct = b64ToBytes(enc.ct);
    return getKeyForSalt(password, saltBytes).then(function (key) {
      return window.crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, ct).then(function (plainBuf) {
        return new TextDecoder().decode(plainBuf);
      });
    });
  }

  function validateImportedStorageJson(plaintext) {
    var p = JSON.parse(plaintext);
    if (!p || typeof p !== 'object') return false;
    if (!p.__meta || typeof p.__meta !== 'object') return false;
    return true;
  }

  function exportEncryptedChecklistBackup() {
    if (!usesWebCrypto()) {
      showChecklistToast('error', 'This browser does not support Web Crypto.');
      return;
    }
    function runExportWithPassword(pw) {
      var raw = localStorage.getItem(STORAGE_KEY) || '{}';
      return encryptChecklistFileBackup(pw, raw).then(function (obj) {
        var json = JSON.stringify(obj, null, 2);
        var blob = new Blob([json], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'monitor-tools-checklist-backup-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.enc.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showChecklistToast('success', 'Encrypted backup downloaded. Safe to commit—keep the password private.');
      });
    }
    var configured = getHistoryPassword();
    if (configured) {
      if (!window.confirm('Export backup file using your configured shift-history password? (Same secret as history unlock / local config—never commit the password or .env.local.)')) {
        return;
      }
      runExportWithPassword(configured).catch(function () {
        showChecklistToast('error', 'Could not encrypt backup.');
      });
      return;
    }
    var p1 = window.prompt('Choose a password for this file (needed to import later; do not commit the password to git):');
    if (!p1) return;
    var p2 = window.prompt('Confirm password:');
    if (p1 !== p2) {
      showChecklistToast('error', 'Passwords do not match.');
      return;
    }
    runExportWithPassword(p1).catch(function () {
      showChecklistToast('error', 'Could not encrypt backup.');
    });
  }

  function triggerEncryptedBackupImportPicker() {
    if (!usesWebCrypto()) {
      showChecklistToast('error', 'This browser does not support Web Crypto.');
      return;
    }
    var inp = rootEl && rootEl.querySelector('#shiftChecklistEncImport');
    if (inp) inp.click();
  }

  function applyDecryptedChecklistBackup(plaintext) {
    if (!validateImportedStorageJson(plaintext)) {
      showChecklistToast('error', 'Decrypted data is not a valid checklist backup.');
      return Promise.reject(new Error('invalid backup'));
    }
    localStorage.setItem(STORAGE_KEY, plaintext);
    showChecklistToast('success', 'Backup restored. Reloading…');
    setTimeout(function () { window.location.reload(); }, 650);
    return Promise.resolve();
  }

  function handleEncryptedBackupFileSelected(files) {
    var f = files && files[0];
    if (!f) return;
    if (!usesWebCrypto()) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        var env = parseFileBackupEnvelope(data);
        if (!env) {
          showChecklistToast('error', 'Not a valid Monitor Tools encrypted backup.');
          return;
        }
        function tryPassword(pwd) {
          return decryptChecklistFileBackup(pwd, env).then(function (plaintext) {
            return applyDecryptedChecklistBackup(plaintext);
          });
        }
        function promptAndImport() {
          var pwd = window.prompt('Password for this backup file:');
          if (!pwd) return;
          tryPassword(pwd).catch(function () {
            showChecklistToast('error', 'Wrong password or corrupted file.');
          });
        }
        var configured = getHistoryPassword();
        if (configured) {
          tryPassword(configured).catch(function () {
            promptAndImport();
          });
          return;
        }
        promptAndImport();
      } catch (e1) {
        showChecklistToast('error', 'Could not read backup file.');
      }
    };
    reader.onerror = function () {
      showChecklistToast('error', 'Could not read backup file.');
    };
    reader.readAsText(f, 'utf8');
  }

  function renderEncryptedBackupTools() {
    if (!usesWebCrypto()) {
      return ''
        + '<div class="mt-3 pt-3 border-t border-slate-200/80 shift-checklist-backup-tools">'
        + '  <p class="text-xs font-semibold text-slate-500 mb-1">Encrypted backup (git-safe)</p>'
        + '  <p class="text-xs text-amber-800">Use a current browser with Web Crypto to export or import encrypted backups.</p>'
        + '</div>';
    }
    var backupDesc = getHistoryPassword()
      ? 'Exports use the <strong>same password as shift history</strong> (from your local <code class="text-xs bg-slate-100 px-1 py-0.5 rounded">config.local.js</code> / env, or an injected build). Encrypts this device&rsquo;s checklist <code class="text-xs bg-slate-100 px-1 py-0.5 rounded">localStorage</code> (PBKDF2 + AES-GCM). Commit only the <code class="text-xs bg-slate-100 px-1 py-0.5 rounded">.enc.json</code> file—never <code class="text-xs bg-slate-100 px-1 py-0.5 rounded">.env.local</code> or the password. Do not enable password embed in public Pages unless you accept that risk (see README).'
      : 'No shift-history password is loaded in this browser—export will <strong>ask you for a password</strong> (use the same value you use to unlock history). GitHub Actions <strong>secrets alone</strong> do not reach the client unless you opt into inject (README). Encrypts <code class="text-xs bg-slate-100 px-1 py-0.5 rounded">localStorage</code> (PBKDF2 + AES-GCM). Commit only the <code class="text-xs bg-slate-100 px-1 py-0.5 rounded">.enc.json</code> file.';
    return ''
      + '<div class="mt-3 pt-3 border-t border-slate-200/80 shift-checklist-backup-tools">'
      + '  <p class="text-xs font-semibold text-slate-500 mb-1">Encrypted backup (git-safe)</p>'
      + '  <p class="text-xs text-slate-500 mb-2 leading-relaxed">' + backupDesc + '</p>'
      + '  <div class="flex flex-wrap gap-2">'
      + '    <button type="button" data-action="export-encrypted-backup" class="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 text-white hover:bg-slate-900 transition text-sm font-medium"><i class="fas fa-file-export"></i> Export backup</button>'
      + '    <button type="button" data-action="import-encrypted-backup-trigger" class="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-800 hover:bg-slate-50 transition text-sm font-medium"><i class="fas fa-file-import"></i> Import backup…</button>'
      + '    <input type="file" id="shiftChecklistEncImport" class="hidden" accept="application/json,.json" tabindex="-1" aria-hidden="true">'
      + '  </div>'
      + '</div>';
  }

  function buildCleanedDiskObject(shiftHistoryEncVal) {
    var meta = state.__meta || {};
    var cleaned = {
      __meta: {
        shiftOwner: typeof meta.shiftOwner === 'string' ? meta.shiftOwner : '',
        shiftSlot: normalizeShiftSlot(meta.shiftSlot),
        shiftHistory: shiftHistoryEncVal ? [] : sanitizeShiftHistory(meta.shiftHistory || []),
        shiftHistoryEnc: shiftHistoryEncVal || undefined
      }
    };
    if (!cleaned.__meta.shiftHistoryEnc) delete cleaned.__meta.shiftHistoryEnc;
    copyChecklistEntries(state, cleaned);
    return cleaned;
  }

  function persistEncryptedSnapshot() {
    var pass = effectiveHistoryPassword();
    var hist = sanitizeShiftHistory(historyPlainShadow || []);
    var prevEncKeep = parseShiftHistoryEnc(state.__meta && state.__meta.shiftHistoryEnc);
    if (!hist.length) {
      if (prevEncKeep && !historyUnlocked) {
        var cleanedKeep = buildCleanedDiskObject(prevEncKeep);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanedKeep));
        return Promise.resolve();
      }
      state.__meta = state.__meta || {};
      state.__meta.shiftHistoryEnc = null;
      if (!historyUnlocked) state.__meta.shiftHistory = [];
      var emptyCleaned = buildCleanedDiskObject(null);
      emptyCleaned.__meta.shiftHistory = [];
      delete emptyCleaned.__meta.shiftHistoryEnc;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(emptyCleaned));
      return Promise.resolve();
    }
    if (!pass) {
      return Promise.resolve();
    }
    var prevEnc = parseShiftHistoryEnc(state.__meta && state.__meta.shiftHistoryEnc);
    return encryptShiftHistoryBlob(pass, hist, prevEnc).then(function (enc) {
      state.__meta = state.__meta || {};
      state.__meta.shiftHistoryEnc = enc;
      if (!historyUnlocked) state.__meta.shiftHistory = [];
      var cleaned = buildCleanedDiskObject(enc);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
    });
  }

  function persistState() {
    if (historyEncryptActive()) {
      persistChain = persistChain.then(function () {
        return persistEncryptedSnapshot();
      }).catch(function () {});
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizeStateForPersistence(state)));
    } catch (e) {}
  }

  function getProgressSnapshot() {
    var totals = { checked: 0, total: 0, percent: 0, sections: {} };
    checklistSections.forEach(function (section) {
      var sectionChecked = 0;
      var sectionTotal = 0;
      section.items.forEach(function (item) {
        var entry = state[itemKey(section.id, item.id)];
        if (itemHasSubItems(item)) {
          var c = countSubCompletion(entry, item);
          sectionChecked += c.checked;
          sectionTotal += c.total;
        } else {
          sectionTotal += 1;
          if (entry && entry.checked) sectionChecked += 1;
        }
      });
      totals.checked += sectionChecked;
      totals.total += sectionTotal;
      totals.sections[section.id] = { checked: sectionChecked, total: sectionTotal };
    });
    totals.percent = totals.total ? Math.round((totals.checked / totals.total) * 100) : 0;
    return totals;
  }

  function getHistoryPassword() {
    var direct = (typeof window.MONITOR_TOOLS_SHIFT_HISTORY_PASSWORD === 'string')
      ? window.MONITOR_TOOLS_SHIFT_HISTORY_PASSWORD
      : '';
    if (direct.trim()) return direct.trim();
    var cfg = (window.__MONITOR_TOOLS_CONFIG__ && typeof window.__MONITOR_TOOLS_CONFIG__.shiftHistoryPassword === 'string')
      ? window.__MONITOR_TOOLS_CONFIG__.shiftHistoryPassword
      : '';
    return cfg.trim();
  }

  function getWeb3FormsAccessKey() {
    if (typeof window.MONITOR_TOOLS_WEB3FORMS_ACCESS_KEY === 'string' && window.MONITOR_TOOLS_WEB3FORMS_ACCESS_KEY.trim()) {
      return window.MONITOR_TOOLS_WEB3FORMS_ACCESS_KEY.trim();
    }
    var cfg = window.__MONITOR_TOOLS_CONFIG__ || {};
    if (typeof cfg.web3formsAccessKey === 'string' && cfg.web3formsAccessKey.trim()) {
      return cfg.web3formsAccessKey.trim();
    }
    return '';
  }

  /** Your inbox (Web3Forms notification address); optional `email` field on submit. */
  function getChecklistOwnerEmail() {
    if (typeof window.MONITOR_TOOLS_CHECKLIST_OWNER_EMAIL === 'string' && window.MONITOR_TOOLS_CHECKLIST_OWNER_EMAIL.trim()) {
      return window.MONITOR_TOOLS_CHECKLIST_OWNER_EMAIL.trim();
    }
    var cfg = window.__MONITOR_TOOLS_CONFIG__ || {};
    if (typeof cfg.checklistOwnerEmail === 'string' && cfg.checklistOwnerEmail.trim()) {
      return cfg.checklistOwnerEmail.trim();
    }
    return '';
  }

  /** Netlify Database sync: set via build inject (ENABLE_SHIFT_HISTORY_NETLIFY_DB) or __MONITOR_TOOLS_CONFIG__. */
  function shiftHistoryNetlifyDbEnabled() {
    if (window.MONITOR_TOOLS_SHIFT_HISTORY_NETLIFY_DB === true) return true;
    if (window.MONITOR_TOOLS_SHIFT_HISTORY_NETLIFY_DB === '1') return true;
    var cfg = window.__MONITOR_TOOLS_CONFIG__ || {};
    if (cfg.shiftHistoryNetlifyDb === true || cfg.shiftHistoryNetlifyDb === '1') return true;
    return false;
  }

  function shiftHistoryApiPath() {
    return '/api/shift-history';
  }

  /** Remote rows win on duplicate `id`. */
  function mergeRemoteShiftHistory(remoteArr, localArr) {
    var byId = {};
    (localArr || []).forEach(function (entry) {
      if (!entry || typeof entry !== 'object') return;
      var id = typeof entry.id === 'string' ? entry.id : String(entry.createdAt || '');
      if (!id) return;
      byId[id] = entry;
    });
    (remoteArr || []).forEach(function (entry) {
      if (!entry || typeof entry !== 'object') return;
      var id = typeof entry.id === 'string' ? entry.id : String(entry.createdAt || '');
      if (!id) return;
      byId[id] = entry;
    });
    return Object.keys(byId).map(function (k) { return byId[k]; }).sort(function (a, b) {
      return (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0);
    });
  }

  function maybeSyncShiftHistoryFromNetlifyDb() {
    if (!shiftHistoryNetlifyDbEnabled() || !historyUnlocked) return Promise.resolve();
    return fetch(shiftHistoryApiPath(), { method: 'GET', credentials: 'same-origin' })
      .then(function (res) {
        if (res.status === 401) {
          showChecklistToast('error', 'Could not load cloud shift history: sign in to the site (HTTP Basic Auth), then try again.');
          return null;
        }
        if (!res.ok) throw new Error('GET shift history failed');
        return res.json();
      })
      .then(function (remote) {
        if (!Array.isArray(remote)) return;
        var local = historyDataInShadow() ? (historyPlainShadow || []) : ((state.__meta && state.__meta.shiftHistory) || []);
        var merged = sanitizeShiftHistory(mergeRemoteShiftHistory(remote, local));
        historyPlainShadow = merged.slice();
        state.__meta = state.__meta || {};
        if (historyEncryptActive() || (usesWebCrypto() && parseShiftHistoryEnc(state.__meta.shiftHistoryEnc))) {
          state.__meta.shiftHistory = historyUnlocked ? merged.slice() : [];
        } else {
          state.__meta.shiftHistory = merged.slice();
        }
        persistState();
        if (rootEl) rootEl.innerHTML = render();
      })
      .catch(function () {
        showChecklistToast('error', 'Could not load cloud shift history. Showing local data only.');
      });
  }

  function postShiftSnapshotToNetlifyDb(snap) {
    if (!shiftHistoryNetlifyDbEnabled()) return;
    fetch(shiftHistoryApiPath(), {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snap)
    })
      .then(function (res) {
        if (!res.ok) throw new Error('POST shift history failed');
      })
      .catch(function () {
        showChecklistToast('error', 'Could not save this shift to cloud history. It is still saved in this browser.');
      });
  }

  function sanitizeShiftHistory(rawHistory) {
    if (!Array.isArray(rawHistory)) return [];
    var cleaned = rawHistory
      .map(function (entry) {
        if (!entry || typeof entry !== 'object') return null;
        var createdAt = Number(entry.createdAt);
        if (!createdAt || Number.isNaN(createdAt)) return null;
        return {
          id: typeof entry.id === 'string' ? entry.id : String(createdAt),
          createdAt: createdAt,
          owner: typeof entry.owner === 'string' ? entry.owner : '',
          checked: Number(entry.checked) || 0,
          total: Number(entry.total) || 0,
          slotLabel: typeof entry.slotLabel === 'string' ? entry.slotLabel : '',
          sections: Array.isArray(entry.sections) ? entry.sections : [],
          summaryText: typeof entry.summaryText === 'string' ? entry.summaryText : ''
        };
      })
      .filter(Boolean)
      .sort(function (a, b) { return b.createdAt - a.createdAt; });
    var cap = shiftHistoryNetlifyDbEnabled() ? null : HISTORY_LIMIT;
    if (cap != null && cap > 0) return cleaned.slice(0, cap);
    return cleaned;
  }

  function buildChecklistSummaryText() {
    var lines = [];
    var meta = state.__meta || {};
    var owner = (meta.shiftOwner || '').trim() || 'N/A';
    var slotLine = shiftSlotExportLabel(normalizeShiftSlot(meta.shiftSlot));
    lines.push('Shift Checklist Summary');
    lines.push('Your name: ' + owner);
    lines.push('Shift: ' + (slotLine || '(not selected)'));
    lines.push('Generated: ' + new Date().toLocaleString());
    lines.push('');
    checklistSections.forEach(function (section) {
      lines.push(section.title);
      section.items.forEach(function (item) {
        var key = itemKey(section.id, item.id);
        var entry = state[key] || {};
        if (itemHasSubItems(item)) {
          var sc = countSubCompletion(entry, item);
          lines.push('- ' + item.title + ' (' + sc.checked + '/' + sc.total + ')');
          item.subItems.forEach(function (si) {
            var subOn = !!(entry.sub && entry.sub[si.id]);
            lines.push('  - ' + (subOn ? '[x]' : '[ ]') + ' ' + si.label);
          });
          var doneAtSub = formatCompletedAtReadable(entry, item);
          if (doneAtSub) lines.push('  ' + doneAtSub);
        } else {
          var mark = entry.checked ? '[x]' : '[ ]';
          lines.push('- ' + mark + ' ' + item.title);
          if (item.allowNote && entry.note) {
            lines.push('  Note: ' + entry.note.replace(/\n/g, ' '));
          }
          var doneAt = formatCompletedAtReadable(entry, item);
          if (doneAt) lines.push('  ' + doneAt);
        }
      });
      lines.push('');
    });
    return lines.join('\n');
  }

  function buildSnapshotSections() {
    return checklistSections.map(function (section) {
      return {
        title: section.title,
        items: section.items.map(function (item) {
          var key = itemKey(section.id, item.id);
          var entry = state[key] || {};
          if (itemHasSubItems(item)) {
            var sc2 = countSubCompletion(entry, item);
            var subItemSnap = {
              title: item.title,
              checked: sc2.checked === sc2.total && sc2.total > 0,
              note: item.allowNote && entry.note ? entry.note : '',
              subs: item.subItems.map(function (si) {
                return { label: si.label, checked: !!(entry.sub && entry.sub[si.id]) };
              })
            };
            if (item.trackCompletedAt) {
              var atSubSnap = normalizedCompletedAt(entry, item);
              subItemSnap.completedAt = atSubSnap != null ? atSubSnap : null;
            }
            return subItemSnap;
          }
          var snap = {
            title: item.title,
            checked: !!entry.checked,
            note: item.allowNote && entry.note ? entry.note : ''
          };
          if (item.trackCompletedAt) {
            var atSnap = normalizedCompletedAt(entry, item);
            snap.completedAt = atSnap != null ? atSnap : null;
          }
          return snap;
        })
      };
    });
  }

  function createShiftSnapshot() {
    var progress = getProgressSnapshot();
    var createdAt = Date.now();
    var metaSnap = state.__meta || {};
    var owner = (metaSnap.shiftOwner || '').trim() || 'N/A';
    var slotSnap = shiftSlotExportLabel(normalizeShiftSlot(metaSnap.shiftSlot));
    var sections = buildSnapshotSections();
    var lines = [
      'Shift Checklist Snapshot',
      'Your name: ' + owner,
      'Shift: ' + (slotSnap || '(not selected)'),
      'Saved: ' + new Date(createdAt).toLocaleString(),
      'Completion: ' + progress.checked + '/' + progress.total,
      ''
    ];
    sections.forEach(function (section) {
      lines.push(section.title);
      section.items.forEach(function (item) {
        if (item.subs && item.subs.length) {
          lines.push('- ' + item.title);
          item.subs.forEach(function (sub) {
            lines.push('  - ' + (sub.checked ? '[x] ' : '[ ] ') + sub.label);
          });
          if (item.note) lines.push('  Note: ' + String(item.note).replace(/\n/g, ' '));
          if (typeof item.completedAt === 'number' && Number.isFinite(item.completedAt) && item.checked) {
            lines.push('  Completed at: ' + new Date(item.completedAt).toLocaleString());
          }
        } else {
          lines.push('- ' + (item.checked ? '[x] ' : '[ ] ') + item.title);
          if (item.note) lines.push('  Note: ' + item.note.replace(/\n/g, ' '));
          if (typeof item.completedAt === 'number' && Number.isFinite(item.completedAt) && item.checked) {
            lines.push('  Completed at: ' + new Date(item.completedAt).toLocaleString());
          }
        }
      });
      lines.push('');
    });
    return {
      id: String(createdAt) + '_' + Math.random().toString(36).slice(2, 7),
      createdAt: createdAt,
      owner: owner,
      checked: progress.checked,
      total: progress.total,
      slotLabel: slotSnap || '',
      sections: sections,
      summaryText: lines.join('\n')
    };
  }

  function exportTextAsPdf(summary, title) {
    var win = window.open('', '_blank');
    if (!win) return;
    var escaped = escapeHtml(summary).replace(/\n/g, '<br>');
    win.document.write(
      '<!doctype html><html><head><meta charset="utf-8"><title>' + escapeHtml(title || 'Shift Checklist Export') + '</title>'
      + '<style>body{font-family:Arial,sans-serif;padding:24px;color:#111827}h1{margin:0 0 12px}.box{border:1px solid #d1d5db;border-radius:10px;padding:16px;background:#f9fafb;line-height:1.5;white-space:normal}</style>'
      + '</head><body><h1>' + escapeHtml(title || 'Shift Checklist Export') + '</h1><div class="box">' + escaped + '</div></body></html>'
    );
    win.document.close();
    win.focus();
    setTimeout(function () { win.print(); }, 250);
  }

  function exportChecklistPdf() {
    exportTextAsPdf(buildChecklistSummaryText(), 'Shift Checklist Export');
  }

  function appendSnapshotNoteBlock(host, noteText) {
    if (!noteText || !String(noteText).trim()) return;
    var wrap = document.createElement('div');
    wrap.className = 'shift-snap-note';
    var lab = document.createElement('p');
    lab.className = 'shift-snap-note-label';
    var icn = document.createElement('i');
    icn.className = 'fas fa-note-sticky';
    icn.setAttribute('aria-hidden', 'true');
    lab.appendChild(icn);
    lab.appendChild(document.createTextNode(' Handover note'));
    wrap.appendChild(lab);
    String(noteText).split(/\r?\n/).forEach(function (line) {
      if (!line.trim()) return;
      var p = document.createElement('p');
      p.className = 'shift-snap-note-body';
      p.textContent = line;
      wrap.appendChild(p);
    });
    host.appendChild(wrap);
  }

  function appendSnapshotCompletedAt(host, at) {
    if (typeof at !== 'number' || !Number.isFinite(at)) return;
    var p = document.createElement('p');
    p.className = 'shift-snap-completed-at';
    p.textContent = 'Completed at: ' + new Date(at).toLocaleString();
    host.appendChild(p);
  }

  function buildHistorySnapshotVisualDOM(entry) {
    var root = document.createElement('div');
    root.className = 'shift-snap-visual';

    var hero = document.createElement('div');
    hero.className = 'shift-snap-hero';
    var pct = entry.total > 0 ? Math.round((entry.checked / entry.total) * 100) : 0;
    var heroLeft = document.createElement('div');
    heroLeft.className = 'shift-snap-hero-left';
    var slotLine = (entry.slotLabel && String(entry.slotLabel).trim()) ? String(entry.slotLabel).trim() : '(shift not selected)';
    var dl = document.createElement('dl');
    dl.className = 'shift-snap-dl';
    function addRow(dt, dd) {
      var row = document.createElement('div');
      row.className = 'shift-snap-dl-row';
      var dtt = document.createElement('dt');
      dtt.textContent = dt;
      var ddd = document.createElement('dd');
      ddd.textContent = dd;
      row.appendChild(dtt);
      row.appendChild(ddd);
      dl.appendChild(row);
    }
    addRow('Shift', slotLine);
    addRow('Saved', new Date(entry.createdAt).toLocaleString());
    heroLeft.appendChild(dl);

    var heroRight = document.createElement('div');
    heroRight.className = 'shift-snap-hero-right';
    var stat = document.createElement('div');
    stat.className = 'shift-snap-stat-block';
    var fracBig = document.createElement('div');
    fracBig.className = 'shift-snap-big-num';
    fracBig.textContent = (entry.checked != null && entry.total != null) ? entry.checked + '/' + entry.total : '—';
    var barWrap = document.createElement('div');
    barWrap.className = 'shift-snap-bar';
    var barFill = document.createElement('span');
    barFill.className = 'shift-snap-bar-fill';
    barFill.style.width = pct + '%';
    barWrap.appendChild(barFill);
    var lab = document.createElement('p');
    lab.className = 'shift-snap-stat-caption';
    lab.textContent = pct + '% complete';
    stat.appendChild(fracBig);
    stat.appendChild(barWrap);
    stat.appendChild(lab);
    heroRight.appendChild(stat);
    hero.appendChild(heroLeft);
    hero.appendChild(heroRight);
    root.appendChild(hero);

    (entry.sections || []).forEach(function (sec) {
      var secEl = document.createElement('section');
      secEl.className = 'shift-snap-section';
      var h2 = document.createElement('h2');
      h2.className = 'shift-snap-section-title';
      h2.textContent = sec.title || '';
      secEl.appendChild(h2);

      (sec.items || []).forEach(function (item) {
        var art = document.createElement('article');
        art.className = 'shift-snap-item';

        if (item.subs && item.subs.length) {
          var head = document.createElement('div');
          head.className = 'shift-snap-item-head';
          var h3 = document.createElement('h3');
          h3.className = 'shift-snap-item-title';
          h3.textContent = item.title || '';
          var pill = document.createElement('span');
          pill.className = 'shift-snap-pill';
          var nDone = item.subs.filter(function (s) { return s.checked; }).length;
          pill.textContent = nDone + '/' + item.subs.length;
          head.appendChild(h3);
          head.appendChild(pill);
          art.appendChild(head);
          var subList = document.createElement('ul');
          subList.className = 'shift-snap-sublist';
          item.subs.forEach(function (sub) {
            var li = document.createElement('li');
            li.className = 'shift-snap-subrow' + (sub.checked ? ' shift-snap-subrow--done' : '');
            var ic = document.createElement('span');
            ic.className = 'shift-snap-sub-ic';
            ic.innerHTML = sub.checked ? '<i class="fas fa-check" aria-hidden="true"></i>' : '<i class="far fa-circle" aria-hidden="true"></i>';
            var tx = document.createElement('span');
            tx.className = 'shift-snap-sub-label';
            tx.textContent = sub.label || '';
            li.appendChild(ic);
            li.appendChild(tx);
            subList.appendChild(li);
          });
          art.appendChild(subList);
          appendSnapshotNoteBlock(art, item.note);
          appendSnapshotCompletedAt(art, item.completedAt);
        } else {
          var row = document.createElement('div');
          row.className = 'shift-snap-item-row';
          var chk = document.createElement('span');
          chk.className = 'shift-snap-check' + (item.checked ? ' shift-snap-check--done' : ' shift-snap-check--todo');
          chk.innerHTML = item.checked
            ? '<i class="fas fa-circle-check" aria-hidden="true"></i>'
            : '<i class="far fa-circle" aria-hidden="true"></i>';
          var twrap = document.createElement('div');
          twrap.className = 'shift-snap-item-text';
          var t = document.createElement('p');
          t.className = 'shift-snap-item-single-title';
          t.textContent = item.title || '';
          twrap.appendChild(t);
          row.appendChild(chk);
          row.appendChild(twrap);
          art.appendChild(row);
          appendSnapshotNoteBlock(art, item.note);
          appendSnapshotCompletedAt(art, item.completedAt);
        }
        secEl.appendChild(art);
      });
      root.appendChild(secEl);
    });

    var rawToggle = document.createElement('details');
    rawToggle.className = 'shift-snap-raw';
    var rawSum = document.createElement('summary');
    rawSum.textContent = 'Plain text snapshot';
    rawToggle.appendChild(rawSum);
    var rawPre = document.createElement('pre');
    rawPre.className = 'shift-snap-raw-pre';
    rawPre.textContent = entry.summaryText || '';
    rawToggle.appendChild(rawPre);
    root.appendChild(rawToggle);

    return root;
  }

  function closeHistoryViewModal() {
    var m = document.getElementById('shiftHistoryViewModal');
    if (m) m.remove();
    document.body.classList.remove('shift-history-view-body-lock');
    if (historyViewKeydownHandler) {
      document.removeEventListener('keydown', historyViewKeydownHandler);
      historyViewKeydownHandler = null;
    }
  }

  function openHistoryViewModal(entry) {
    if (!entry) return;
    closeHistoryViewModal();
    document.body.classList.add('shift-history-view-body-lock');

    var page = document.createElement('div');
    page.id = 'shiftHistoryViewModal';
    page.className = 'shift-history-view-page';
    page.setAttribute('role', 'dialog');
    page.setAttribute('aria-modal', 'true');
    page.setAttribute('aria-labelledby', 'shiftHistoryViewTitle');

    var header = document.createElement('header');
    header.className = 'shift-history-view-header';
    var headerLeft = document.createElement('div');
    headerLeft.className = 'shift-history-view-header-left';
    var eyebrow = document.createElement('p');
    eyebrow.className = 'shift-history-view-eyebrow';
    eyebrow.textContent = 'Shift snapshot';
    var title = document.createElement('h1');
    title.id = 'shiftHistoryViewTitle';
    title.className = 'shift-history-view-heading';
    title.textContent = entry.owner || 'N/A';
    var meta = document.createElement('p');
    meta.className = 'shift-history-view-meta';
    var slotMeta = (entry.slotLabel && String(entry.slotLabel).trim()) ? String(entry.slotLabel).trim() + ' · ' : '';
    meta.textContent = slotMeta + new Date(entry.createdAt).toLocaleString();
    headerLeft.appendChild(eyebrow);
    headerLeft.appendChild(title);
    headerLeft.appendChild(meta);

    var headerRight = document.createElement('div');
    headerRight.className = 'shift-history-view-header-right';
    if (entry.checked != null && entry.total != null) {
      var badge = document.createElement('span');
      badge.className = 'shift-history-view-badge';
      badge.textContent = entry.checked + '/' + entry.total + ' tasks';
      headerRight.appendChild(badge);
    }
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'shift-history-view-done-btn';
    closeBtn.setAttribute('aria-label', 'Close and return');
    closeBtn.innerHTML = '<i class="fas fa-arrow-left" aria-hidden="true"></i><span> Back</span>';
    closeBtn.addEventListener('click', closeHistoryViewModal);
    headerRight.appendChild(closeBtn);

    header.appendChild(headerLeft);
    header.appendChild(headerRight);

    var main = document.createElement('main');
    main.className = 'shift-history-view-main';
    var inner = document.createElement('div');
    inner.className = 'shift-history-view-inner';
    if (entry.sections && entry.sections.length) {
      inner.appendChild(buildHistorySnapshotVisualDOM(entry));
    } else {
      var card = document.createElement('div');
      card.className = 'shift-history-view-card';
      var pre = document.createElement('pre');
      pre.className = 'shift-history-view-pre';
      pre.textContent = entry.summaryText || '(No summary text.)';
      card.appendChild(pre);
      inner.appendChild(card);
    }
    main.appendChild(inner);

    page.appendChild(header);
    page.appendChild(main);
    document.body.appendChild(page);

    historyViewKeydownHandler = function (e) {
      if (e.key === 'Escape') closeHistoryViewModal();
    };
    document.addEventListener('keydown', historyViewKeydownHandler);
    closeBtn.focus();
  }

  function removeHistoryEntryById(id) {
    if (!id || !window.confirm('Remove this shift from history? This cannot be undone.')) return;
    closeHistoryViewModal();
    function filter(arr) {
      return sanitizeShiftHistory((arr || []).filter(function (e) { return e.id !== id; }));
    }
    if (historyDataInShadow()) {
      historyPlainShadow = filter(historyPlainShadow);
      state.__meta = state.__meta || {};
      if (historyUnlocked) state.__meta.shiftHistory = historyPlainShadow.slice();
      else state.__meta.shiftHistory = [];
    } else {
      state.__meta = state.__meta || {};
      state.__meta.shiftHistory = filter(state.__meta.shiftHistory);
    }
    persistState();
    if (rootEl) rootEl.innerHTML = render();
    showChecklistToast('success', 'Removed from history.');
  }

  function dismissChecklistToast() {
    if (checklistToastTimer) {
      clearTimeout(checklistToastTimer);
      checklistToastTimer = null;
    }
    var t = document.getElementById('shiftChecklistToast');
    if (t) t.remove();
  }

  function showChecklistToast(kind, message) {
    dismissChecklistToast();
    var text = String(message || '').trim();
    if (!text) text = kind === 'error' ? 'Something went wrong.' : 'Success.';
    var wrap = document.createElement('div');
    wrap.id = 'shiftChecklistToast';
    wrap.className = 'shift-checklist-toast shift-checklist-toast--' + (kind === 'error' ? 'error' : 'success');
    wrap.setAttribute('role', 'alert');
    var icon = document.createElement('span');
    icon.className = 'shift-checklist-toast-icon';
    icon.innerHTML = kind === 'error' ? '<i class="fas fa-circle-exclamation" aria-hidden="true"></i>' : '<i class="fas fa-circle-check" aria-hidden="true"></i>';
    var msg = document.createElement('span');
    msg.className = 'shift-checklist-toast-msg';
    msg.textContent = text;
    wrap.appendChild(icon);
    wrap.appendChild(msg);
    wrap.setAttribute('tabindex', '-1');
    wrap.addEventListener('click', dismissChecklistToast);
    document.body.appendChild(wrap);
    checklistToastTimer = setTimeout(dismissChecklistToast, 4200);
  }

  function setEmailStatus(status, message) {
    if (status === 'success' || status === 'error') {
      showChecklistToast(status === 'success' ? 'success' : 'error', message || '');
      emailSendState = { status: 'idle', message: '' };
    } else {
      emailSendState = { status: status, message: message || '' };
    }
    rerenderSummary();
  }

  function sendChecklistEmail() {
    var meta = state.__meta || {};
    var owner = (meta.shiftOwner || '').trim();
    var accessKey = getWeb3FormsAccessKey();
    if (!owner) {
      setEmailStatus('error', 'Please enter your name first.');
      return;
    }
    if (!accessKey) {
      setEmailStatus('error', 'Missing Web3Forms key. Set window.MONITOR_TOOLS_WEB3FORMS_ACCESS_KEY.');
      return;
    }
    setEmailStatus('sending', 'Sending email...');
    var summaryBody = buildChecklistSummaryText();
    var ownerInbox = getChecklistOwnerEmail();
    var payload = {
      access_key: accessKey,
      subject: 'Shift Checklist Summary - ' + owner,
      from_name: 'Monitor Tools Checklist',
      name: owner,
      message: summaryBody
    };
    if (ownerInbox) payload.email = ownerInbox;
    fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (res) { return res.json(); })
      .then(function (res) {
        if (res && res.success) {
          setEmailStatus('success', 'Email sent successfully.');
        } else {
          var hint = (res && res.message) ? String(res.message) : 'Check Web3Forms key. If the API requires an email field, set CHECKLIST_OWNER_EMAIL (your address) in site config.';
          setEmailStatus('error', hint);
        }
      })
      .catch(function () {
        setEmailStatus('error', 'Network error while sending email.');
      });
  }

  function renderHistoryPanel() {
    var encBlob = parseShiftHistoryEnc(state.__meta && state.__meta.shiftHistoryEnc);
    var hasUnlockPath = !!getHistoryPassword() || !!encBlob;
    var history = (state.__meta && state.__meta.shiftHistory) || [];
    if (!hasUnlockPath) {
      return ''
        + '<div class="shift-history-panel mt-4">'
        + '  <p class="text-sm text-amber-700">No encrypted shift history in this browser yet. Use <strong>Import backup</strong> below with your team passphrase, or add <code>window.MONITOR_TOOLS_SHIFT_HISTORY_PASSWORD</code> (build inject / local config) to auto-enable encryption. A host login (e.g. Netlify Basic Auth) does not replace the history passphrase.</p>'
        + '</div>';
    }
    if (!historyUnlocked) {
      return ''
        + '<div class="shift-history-panel mt-4">'
        + '  <p class="text-sm font-semibold text-slate-900 mb-2">Shift history (locked)</p>'
        + '  <div class="flex flex-wrap gap-2">'
        + '    <input type="password" id="shiftHistoryPasswordInput" class="px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:ring-2 focus:ring-primary focus:border-primary" placeholder="Enter history password">'
        + '    <button type="button" data-action="unlock-history" class="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white hover:bg-primary-dark transition font-medium">Unlock</button>'
        + '  </div>'
        + (historyUnlockError ? '<p class="text-xs text-red-600 mt-2">' + escapeHtml(historyUnlockError) + '</p>' : '')
        + '</div>';
    }
    var itemsHtml = history.length
      ? history.map(function (entry) {
        return ''
          + '<article class="shift-history-card">'
          + '  <div class="flex flex-wrap items-center justify-between gap-2">'
          + '    <p class="text-sm font-semibold text-slate-800">' + escapeHtml(entry.owner || 'N/A') + '</p>'
          + '    <p class="text-xs text-slate-500">' + escapeHtml(new Date(entry.createdAt).toLocaleString()) + '</p>'
          + '  </div>'
          + '  <p class="text-sm text-slate-600 mt-1">Completion: ' + entry.checked + '/' + entry.total + '</p>'
          + '  <div class="flex flex-wrap gap-2 mt-3">'
          + '    <button type="button" data-action="view-history" data-history-id="' + escapeHtml(entry.id) + '" class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-800 hover:bg-slate-50 transition text-xs font-semibold">View</button>'
          + '    <button type="button" data-action="copy-history" data-history-id="' + escapeHtml(entry.id) + '" class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition text-xs font-semibold">Copy summary</button>'
          + '    <button type="button" data-action="export-history-pdf" data-history-id="' + escapeHtml(entry.id) + '" class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/15 transition text-xs font-semibold">Export PDF</button>'
          + '    <button type="button" data-action="delete-history" data-history-id="' + escapeHtml(entry.id) + '" class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-50 text-red-800 border border-red-200 hover:bg-red-100 transition text-xs font-semibold">Delete</button>'
          + '  </div>'
          + '</article>';
      }).join('')
      : '<p class="text-sm text-slate-600">No saved shifts yet. Save one when checklist is complete.</p>';
    return ''
      + '<div class="shift-history-panel mt-4">'
      + '  <div class="flex items-center justify-between gap-2">'
      + '    <p class="text-sm font-semibold text-slate-900">' + (shiftHistoryNetlifyDbEnabled() ? 'Shift history (cloud)' : ('Shift history (last ' + HISTORY_LIMIT + ')')) + '</p>'
      + '    <button type="button" data-action="lock-history" class="text-xs text-primary hover:text-primary-dark font-semibold">Lock</button>'
      + '  </div>'
      + '  <div class="mt-3 space-y-2">' + itemsHtml + '</div>'
      + '</div>';
  }

  function getCheer(progress) {
    if (progress.total > 0 && progress.checked === progress.total) {
      return { title: '🎉 Shift checklist complete!', subtitle: 'Nice run - everything is wrapped and ready.' };
    }
    if (progress.percent >= 75) return { title: '🔥 Almost there!', subtitle: 'Final stretch - finish strong.' };
    if (progress.percent >= 45) return { title: '🚀 Great pace!', subtitle: 'You are moving through this shift smoothly.' };
    if (progress.percent > 0) return { title: '✨ Nice start!', subtitle: 'Keep going, one tap at a time.' };
    return { title: '👋 Ready to roll?', subtitle: 'Tap cards as you go through your shift.' };
  }

  function renderSubCards(key, item, entry) {
    var sub = (entry && entry.sub) ? entry.sub : buildDefaultSubMap(item);
    return item.subItems.map(function (si) {
      var done = !!sub[si.id];
      var em = si.emoji ? String(si.emoji) : '📌';
      return ''
        + '<button type="button" class="shift-checklist-subcard' + (done ? ' shift-checklist-subcard--done' : '') + '" data-action="toggle-subitem" data-item-key="' + escapeHtml(key) + '" data-sub-id="' + escapeHtml(si.id) + '">'
        + '  <span class="shift-checklist-subcard-emoji" aria-hidden="true">' + escapeHtml(em) + '</span>'
        + '  <span class="shift-checklist-subcard-label">' + escapeHtml(si.label) + '</span>'
        + '</button>';
    }).join('');
  }

  function renderItem(sectionId, item) {
    var key = itemKey(sectionId, item.id);
    var entry = state[key] || { checked: false, note: '' };
    if (itemHasSubItems(item)) {
      if (!entry.sub) {
        entry = {
          note: entry.note || '',
          sub: buildDefaultSubMap(item),
          subPanelOpen: entry.subPanelOpen !== false
        };
      }
      var sc = countSubCompletion(entry, item);
      var subDone = allSubsChecked(entry, item);
      var pillText = subDone ? 'Done' : (sc.checked + '/' + sc.total);
      var doneClass = subDone ? 'shift-checklist-card--done' : '';
      var panelOpen = entry.subPanelOpen !== false;
      var panelDomId = 'subpanel-' + key.replace(/[^a-zA-Z0-9_-]/g, '-');
      var chevOpen = panelOpen ? ' shift-checklist-chevron--open' : '';
      var bodyClass = 'shift-checklist-subpanel-body mt-3' + (panelOpen ? '' : ' hidden');
      var completedAtSubsHtml = '';
      if (item.trackCompletedAt) {
        var atSubsLabel = formatCompletedAtReadable(entry, item);
        completedAtSubsHtml = '<p class="mt-1 text-xs text-slate-500 shift-checklist-completed-at' + (atSubsLabel ? '' : ' hidden') + '">' + escapeHtml(atSubsLabel) + '</p>';
      }
      return ''
        + '<article class="shift-checklist-card shift-checklist-card--has-subs ' + doneClass + '" data-item-key="' + key + '">'
        + '  <button type="button" class="shift-checklist-subpanel-head w-full text-left flex items-start gap-2 sm:gap-3 rounded-xl border border-transparent hover:border-slate-200 hover:bg-slate-50/80 transition p-1.5 -mx-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1" data-action="toggle-subpanel" data-item-key="' + escapeHtml(key) + '" aria-expanded="' + (panelOpen ? 'true' : 'false') + '" aria-controls="' + escapeHtml(panelDomId) + '">'
        + '    <span class="shift-checklist-chevron shrink-0 mt-1' + chevOpen + '" data-sub-chevron aria-hidden="true"></span>'
        + '    <span class="shift-checklist-emoji">' + escapeHtml(item.emoji) + '</span>'
        + '    <div class="min-w-0 flex-1 pt-0.5">'
        + '      <p class="font-semibold text-slate-800 shift-checklist-title">' + escapeHtml(item.title) + '</p>'
        + '      <p class="mt-1 text-sm text-slate-600">' + escapeHtml(item.hint) + '</p>'
        + completedAtSubsHtml
        + '    </div>'
        + '    <span class="shift-checklist-pill self-center shrink-0">' + escapeHtml(pillText) + '</span>'
        + '  </button>'
        + '  <div id="' + escapeHtml(panelDomId) + '" class="' + bodyClass + '" data-sub-panel>'
        + '    <div class="shift-checklist-subcards">' + renderSubCards(key, item, entry) + '</div>'
        + '  </div>'
        + '</article>';
    }
    var doneClass = entry.checked ? 'shift-checklist-card--done' : '';
    var ctaText = entry.checked ? 'Done' : 'Tap to complete';
    var noteHtml = item.allowNote
      ? '<div class="mt-3">'
        + '<label class="block text-xs font-semibold text-slate-500 mb-1">Handover note (optional)</label>'
        + '<textarea rows="2" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:ring-2 focus:ring-primary focus:border-primary resize-y shift-checklist-note" data-item-key="' + key + '" placeholder="Add links / context for next shift...">' + escapeHtml(entry.note) + '</textarea>'
        + '</div>'
      : '';
    var completedAtHtml = '';
    if (item.trackCompletedAt) {
      var atLabel = formatCompletedAtReadable(entry, item);
      completedAtHtml = '<p class="mt-1 text-xs text-slate-500 shift-checklist-completed-at' + (atLabel ? '' : ' hidden') + '">' + escapeHtml(atLabel) + '</p>';
    }

    return ''
      + '<article class="shift-checklist-card ' + doneClass + '" data-item-key="' + key + '">'
      + '  <button type="button" class="shift-checklist-toggle w-full text-left" data-action="toggle-item" data-item-key="' + key + '">'
      + '    <div class="flex items-start gap-3">'
      + '      <span class="shift-checklist-emoji">' + escapeHtml(item.emoji) + '</span>'
      + '      <div class="min-w-0 flex-1">'
      + '        <p class="font-semibold text-slate-800 shift-checklist-title">' + escapeHtml(item.title) + '</p>'
      + '        <p class="mt-1 text-sm text-slate-600">' + escapeHtml(item.hint) + '</p>'
      + completedAtHtml
      + '      </div>'
      + '      <span class="shift-checklist-pill">' + ctaText + '</span>'
      + '    </div>'
      + '  </button>'
      + noteHtml
      + '</article>';
  }

  function renderSection(section, progress) {
    var sectionProgress = progress.sections[section.id];
    return ''
      + '<section class="rounded-3xl border border-slate-200 bg-slate-50/80 p-4 sm:p-5">'
      + '  <div class="flex flex-wrap items-center justify-between gap-2 mb-4">'
      + '    <h2 class="text-lg sm:text-xl font-semibold text-slate-800">' + escapeHtml(section.title) + '</h2>'
      + '    <div class="flex items-center gap-2">'
      + '      <span class="inline-flex items-center rounded-full bg-primary/10 text-primary text-xs font-semibold px-3 py-1" data-section-progress="' + section.id + '">' + sectionProgress.checked + '/' + sectionProgress.total + '</span>'
      + '    </div>'
      + '  </div>'
      + '  <div class="space-y-3">' + section.items.map(function (item) { return renderItem(section.id, item); }).join('') + '</div>'
      + '</section>';
  }

  function renderShiftSlotPicker(meta) {
    var active = normalizeShiftSlot(meta && meta.shiftSlot);
    var defs = [
      { id: 'morning', label: 'Morning', sub: '07–15', icon: 'fa-sun' },
      { id: 'evening', label: 'Evening', sub: '15–23', icon: 'fa-cloud-sun' },
      { id: 'night', label: 'Night', sub: '23–07', icon: 'fa-moon' }
    ];
    return defs.map(function (d) {
      var isOn = active === d.id;
      return ''
        + '<button type="button" role="radio" aria-checked="' + (isOn ? 'true' : 'false') + '" aria-label="' + escapeHtml(d.label) + ' shift" data-action="set-shift-slot" data-shift-slot="' + d.id + '" class="shift-checklist-slot-btn' + (isOn ? ' shift-checklist-slot-btn--active' : '') + '">'
        + '  <span class="shift-checklist-slot-icon" aria-hidden="true"><i class="fas ' + d.icon + '"></i></span>'
        + '  <span class="shift-checklist-slot-label">' + escapeHtml(d.label) + '</span>'
        + '  <span class="shift-checklist-slot-sub">' + escapeHtml(d.sub) + '</span>'
        + '</button>';
    }).join('');
  }

  function renderSummary(progress) {
    var cheer = getCheer(progress);
    var meta = state.__meta || {};
    var owner = meta.shiftOwner || '';
    var doneAll = progress.total > 0 && progress.checked === progress.total;
    var sendDisabled = emailSendState.status === 'sending' ? 'disabled' : '';
    var sendLabel = emailSendState.status === 'sending'
      ? '<i class="fas fa-spinner fa-spin"></i> Sending...'
      : '<i class="fas fa-paper-plane"></i> Send';
    var sendRow = ''
      + '<div class="mt-3 pt-3 border-t border-slate-200/80">'
      + '  <div class="flex flex-wrap items-center gap-2">'
      + '    <button type="button" data-action="save-shift" class="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition font-medium"><i class="fas fa-floppy-disk"></i> Save to shift history</button>'
      + '    <button type="button" data-action="send-email" ' + sendDisabled + ' class="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white hover:bg-primary-dark transition font-medium">' + sendLabel + '</button>'
      + '  </div>'
      + '  <p class="text-xs text-slate-500 mt-2">View and export saved shifts on the <a href="#/shift-history" class="text-primary font-semibold hover:text-primary-dark">Shift history</a> page.</p>'
      + '</div>';
    var exportActions = doneAll
      ? '<div class="mt-4 pt-4 border-t border-slate-200/80">'
        + '<p class="text-sm font-semibold text-slate-900 mb-2">All done — export PDF or review history below</p>'
        + '<div class="flex flex-wrap gap-2">'
        + '<button type="button" data-action="export-pdf" class="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-700 text-white hover:bg-slate-800 transition font-medium"><i class="fas fa-file-pdf"></i> Export PDF</button>'
        + '</div>'
        + renderHistoryPanel()
        + '</div>'
      : '';
    var celebration = progress.total > 0 && progress.checked === progress.total
      ? '<div class="shift-checklist-celebrate mt-3">🥳 You crushed this shift checklist!</div>'
      : '';
    var shiftCard = ''
      + '<div class="shift-checklist-meta-card rounded-2xl border border-slate-200/90 bg-white/70 p-4 sm:p-5 shadow-sm">'
      + '  <p class="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Shift</p>'
      + '  <div class="shift-checklist-slot-row" role="radiogroup" aria-label="Shift slot">' + renderShiftSlotPicker(meta) + '</div>'
      + '  <div class="mt-4">'
      + '    <label class="block text-xs font-semibold text-slate-700 mb-1" for="shiftChecklistYourName">Your name</label>'
      + '    <input id="shiftChecklistYourName" type="text" data-meta-field="shiftOwner" value="' + escapeHtml(owner) + '" autocomplete="name" class="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:ring-2 focus:ring-primary focus:border-primary">'
      + '  </div>'
      + sendRow
      + renderEncryptedBackupTools()
      + '</div>';
    var progressCard = ''
      + '<div class="shift-checklist-meta-card rounded-2xl border border-slate-200/90 bg-white/70 p-4 sm:p-5 shadow-sm">'
      + '  <p class="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Progress</p>'
      + '  <p class="text-2xl font-bold text-slate-900"><span data-overall-checked>' + progress.checked + '</span>/<span data-overall-total>' + progress.total + '</span> <span class="text-base font-semibold text-slate-600">complete</span></p>'
      + '  <p class="text-sm text-slate-700 mt-2" data-cheer-title>' + escapeHtml(cheer.title) + '</p>'
      + '  <p class="text-xs text-slate-600 mt-0.5" data-cheer-subtitle>' + escapeHtml(cheer.subtitle) + '</p>'
      + '  <div class="shift-checklist-progressbar mt-4"><span data-progress-fill style="width:' + progress.percent + '%"></span></div>'
      + '  <p class="text-xs text-slate-600 mt-2"><span data-progress-percent>' + progress.percent + '</span>% done</p>'
      + celebration
      + '</div>';
    return ''
      + '<div class="shift-checklist-summary rounded-3xl border border-slate-200 p-4 sm:p-5 mb-5">'
      + '  <div class="flex flex-wrap items-center justify-between gap-3 mb-4">'
      + '    <p class="text-sm font-medium text-primary">Shift overview</p>'
      + '    <button type="button" id="shiftChecklistResetBtn" class="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition font-medium">'
      + '      <i class="fas fa-rotate-left"></i> Fresh start'
      + '    </button>'
      + '  </div>'
      + '  <div class="grid gap-4 lg:grid-cols-2">'
      + shiftCard
      + progressCard
      + '  </div>'
      + exportActions
      + '</div>';
  }

  function rerenderSummary() {
    if (!rootEl) return;
    if (isHistoryOnlyLayout()) {
      rootEl.innerHTML = render();
      return;
    }
    var oldSummary = rootEl.querySelector('.shift-checklist-summary');
    if (!oldSummary) return;
    oldSummary.outerHTML = renderSummary(getProgressSnapshot());
  }

  /** Dedicated `#/shift-history` route: password + list only (obfuscation, not server auth). */
  function renderHistoryOnlyPage() {
    return ''
      + '<div class="max-w-3xl mx-auto">'
      + '  <div class="mb-6">'
      + '    <h1 class="mt-page-title">Shift history</h1>'
      + '    <p class="mt-page-desc mt-2">Unlock with your history password to view or export past saved shifts. Same encrypted storage as the full checklist.</p>'
      + '  </div>'
      + '  <div class="rounded-3xl border border-slate-200 p-4 sm:p-5 bg-white">'
      + renderHistoryPanel()
      + renderEncryptedBackupTools()
      + '    <p class="mt-4 pt-4 border-t border-slate-200/80 text-sm"><a href="#/checklist" class="text-primary font-semibold hover:text-primary-dark">← Full shift checklist</a></p>'
      + '  </div>'
      + '</div>';
  }

  function render() {
    if (isHistoryOnlyLayout()) {
      return renderHistoryOnlyPage();
    }
    var progress = getProgressSnapshot();
    return ''
      + '<div class="max-w-5xl mx-auto">'
      + '  <div class="mb-6">'
      + '    <h1 class="mt-page-title">Shift checklist</h1>'
      + '  </div>'
      + renderSummary(progress)
      + '  <div class="space-y-5">' + checklistSections.map(function (section) { return renderSection(section, progress); }).join('') + '</div>'
      + '</div>';
  }

  function refreshProgressUI() {
    if (!rootEl || isHistoryOnlyLayout()) return;
    var progress = getProgressSnapshot();
    rerenderSummary();
    checklistSections.forEach(function (section) {
      var badge = rootEl.querySelector('[data-section-progress="' + section.id + '"]');
      var values = progress.sections[section.id];
      if (badge && values) badge.textContent = values.checked + '/' + values.total;
    });
  }

  function refreshItemCard(itemKeyValue) {
    if (!rootEl || isHistoryOnlyLayout()) return;
    var card = rootEl.querySelector('.shift-checklist-card[data-item-key="' + itemKeyValue + '"]');
    if (!card) return;
    var entry = state[itemKeyValue] || {};
    var item = getItemByKey(itemKeyValue);
    if (itemHasSubItems(item)) {
      var sc = countSubCompletion(entry, item);
      var subDone = allSubsChecked(entry, item);
      card.classList.toggle('shift-checklist-card--done', subDone);
      var pillSub = card.querySelector('.shift-checklist-subpanel-head .shift-checklist-pill');
      if (pillSub) pillSub.textContent = subDone ? 'Done' : (sc.checked + '/' + sc.total);
      var panelOpen = entry.subPanelOpen !== false;
      var panel = card.querySelector('[data-sub-panel]');
      if (panel) panel.classList.toggle('hidden', !panelOpen);
      var headBtn = card.querySelector('[data-action="toggle-subpanel"]');
      if (headBtn) headBtn.setAttribute('aria-expanded', panelOpen ? 'true' : 'false');
      var chev = card.querySelector('[data-sub-chevron]');
      if (chev) chev.classList.toggle('shift-checklist-chevron--open', panelOpen);
      var tsSub = card.querySelector('.shift-checklist-subpanel-head .shift-checklist-completed-at');
      if (tsSub) {
        var tsSubText = formatCompletedAtReadable(entry, item);
        tsSub.textContent = tsSubText;
        tsSub.classList.toggle('hidden', !tsSubText);
      }
      item.subItems.forEach(function (si) {
        var btn = card.querySelector('.shift-checklist-subcard[data-sub-id="' + si.id + '"]');
        if (!btn) return;
        var on = !!(entry.sub && entry.sub[si.id]);
        btn.classList.toggle('shift-checklist-subcard--done', on);
      });
      return;
    }
    var isDone = !!entry.checked;
    card.classList.toggle('shift-checklist-card--done', isDone);
    var pill = card.querySelector('.shift-checklist-pill');
    if (pill) pill.textContent = isDone ? 'Done' : 'Tap to complete';
    var tsEl = card.querySelector('.shift-checklist-completed-at');
    if (tsEl) {
      var text = formatCompletedAtReadable(entry, item);
      tsEl.textContent = text;
      tsEl.classList.toggle('hidden', !text);
    }
  }

  function toggleSubItem(parentKey, subId) {
    var item = getItemByKey(parentKey);
    if (!itemHasSubItems(item) || !state[parentKey]) return;
    var ok = item.subItems.some(function (si) { return si.id === subId; });
    if (!ok) return;
    state[parentKey].sub = state[parentKey].sub || buildDefaultSubMap(item);
    state[parentKey].sub[subId] = !state[parentKey].sub[subId];
    if (item.trackCompletedAt) {
      if (allSubsChecked(state[parentKey], item)) {
        state[parentKey].completedAt = Date.now();
      } else {
        state[parentKey].completedAt = null;
      }
    }
    refreshItemCard(parentKey);
    refreshProgressUI();
    persistState();
  }

  function toggleSubPanel(parentKey) {
    var item = getItemByKey(parentKey);
    if (!itemHasSubItems(item) || !state[parentKey]) return;
    var isOpen = state[parentKey].subPanelOpen !== false;
    state[parentKey].subPanelOpen = !isOpen;
    refreshItemCard(parentKey);
    persistState();
  }

  function toggleItem(itemKeyValue) {
    if (!itemKeyValue || !state[itemKeyValue]) return;
    var item = getItemByKey(itemKeyValue);
    if (itemHasSubItems(item)) return;
    state[itemKeyValue].checked = !state[itemKeyValue].checked;
    if (item && item.trackCompletedAt) {
      if (state[itemKeyValue].checked) {
        state[itemKeyValue].completedAt = Date.now();
      } else {
        state[itemKeyValue].completedAt = null;
      }
    }
    refreshItemCard(itemKeyValue);
    refreshProgressUI();
    persistState();
  }

  function mount(container, deps) {
    rootEl = container;
    historyUnlocked = false;
    historyUnlockError = '';
    if (deps && deps.routePath) {
      routePathForLayout = deps.routePath;
    }
    state = loadState();
    historyPlainShadow = [];
    historyHydrationPromise = Promise.resolve();
    if (usesWebCrypto() && parseShiftHistoryEnc(state.__meta && state.__meta.shiftHistoryEnc)) {
      var enc = state.__meta.shiftHistoryEnc;
      state.__meta.shiftHistory = [];
      var mountPass = getHistoryPassword();
      if (mountPass) {
        historyHydrationPromise = decryptShiftHistoryBlob(mountPass, enc)
          .then(function (arr) {
            historyPlainShadow = arr;
            if (historyUnlocked) state.__meta.shiftHistory = historyPlainShadow;
          })
          .catch(function () {
            historyPlainShadow = [];
          });
      } else {
        historyPlainShadow = [];
        historyHydrationPromise = Promise.resolve();
      }
    } else if (usesCryptoForHistory()) {
      var legacy2 = (state.__meta && state.__meta.shiftHistory) || [];
      if (legacy2.length) {
        historyPlainShadow = sanitizeShiftHistory(legacy2);
        state.__meta.shiftHistory = [];
        state.__meta.shiftHistoryEnc = null;
        persistState();
      } else {
        historyPlainShadow = [];
      }
    } else {
      historyPlainShadow = sanitizeShiftHistory((state.__meta && state.__meta.shiftHistory) || []);
    }
    rootEl.innerHTML = render();

    if (isHistoryOnlyLayout() && !historyUnlocked && (getHistoryPassword() || parseShiftHistoryEnc(state.__meta && state.__meta.shiftHistoryEnc))) {
      requestAnimationFrame(function () {
        if (!rootEl) return;
        var pwd = rootEl.querySelector('#shiftHistoryPasswordInput');
        if (pwd) pwd.focus();
      });
    }

    onInputHandler = function (event) {
      var target = event.target;
      if (target && target.dataset && target.dataset.metaField) {
        var metaField = target.dataset.metaField;
        state.__meta = state.__meta || { shiftOwner: '', shiftSlot: '', shiftHistory: [] };
        state.__meta[metaField] = target.value || '';
        persistState();
        return;
      }
      if (!target || !target.classList || !target.classList.contains('shift-checklist-note')) return;
      var key = target.getAttribute('data-item-key');
      if (!key || !state[key]) return;
      var item = getItemByKey(key);
      if (!item || !item.allowNote) return;
      state[key].note = target.value || '';
      persistState();
    };
    rootEl.addEventListener('input', onInputHandler);

    onBackupFileChange = function (event) {
      var t = event.target;
      if (!t || t.id !== 'shiftChecklistEncImport') return;
      var files = t.files;
      t.value = '';
      if (!files || !files.length) return;
      handleEncryptedBackupFileSelected(files);
    };
    rootEl.addEventListener('change', onBackupFileChange);

    onClickHandler = function (event) {
      var target = event.target;
      if (!target) return;

      var resetBtn = target.closest('#shiftChecklistResetBtn');
      if (resetBtn) {
        state = buildDefaultState();
        historyPlainShadow = [];
        pbkdfKeyPromises = {};
        historyUnlocked = false;
        historyUnlockError = '';
        emailSendState = { status: 'idle', message: '' };
        persistState();
        rootEl.innerHTML = render();
        return;
      }

      var subPanelBtn = target.closest('[data-action="toggle-subpanel"]');
      if (subPanelBtn) {
        toggleSubPanel(subPanelBtn.getAttribute('data-item-key'));
        return;
      }

      var subBtn = target.closest('[data-action="toggle-subitem"]');
      if (subBtn) {
        toggleSubItem(subBtn.getAttribute('data-item-key'), subBtn.getAttribute('data-sub-id'));
        return;
      }

      var slotBtn = target.closest('[data-action="set-shift-slot"]');
      if (slotBtn) {
        var picked = normalizeShiftSlot(slotBtn.getAttribute('data-shift-slot'));
        if (!picked) return;
        state.__meta = state.__meta || {};
        var prev = normalizeShiftSlot(state.__meta.shiftSlot);
        state.__meta.shiftSlot = prev === picked ? '' : picked;
        rerenderSummary();
        persistState();
        return;
      }

      var toggleBtn = target.closest('[data-action="toggle-item"]');
      if (toggleBtn) {
        toggleItem(toggleBtn.getAttribute('data-item-key'));
        return;
      }

      var pdfBtn = target.closest('[data-action="export-pdf"]');
      if (pdfBtn) {
        exportChecklistPdf();
        return;
      }

      var emailBtn = target.closest('[data-action="send-email"]');
      if (emailBtn) {
        sendChecklistEmail();
        return;
      }

      var expEnc = target.closest('[data-action="export-encrypted-backup"]');
      if (expEnc) {
        exportEncryptedChecklistBackup();
        return;
      }

      var impEnc = target.closest('[data-action="import-encrypted-backup-trigger"]');
      if (impEnc) {
        triggerEncryptedBackupImportPicker();
        return;
      }

      var saveShiftBtn = target.closest('[data-action="save-shift"]');
      if (saveShiftBtn) {
        historyHydrationPromise.then(function () {
          if (parseShiftHistoryEnc(state.__meta && state.__meta.shiftHistoryEnc) && !historyUnlocked && !historyEncryptActive()) {
            showChecklistToast('error', 'Unlock shift history first (your passphrase), then save a snapshot.');
            return;
          }
          state.__meta = state.__meta || {};
          var snap = createShiftSnapshot();
          if (historyEncryptActive() || (usesWebCrypto() && parseShiftHistoryEnc(state.__meta && state.__meta.shiftHistoryEnc))) {
            historyPlainShadow = sanitizeShiftHistory((historyPlainShadow || []).concat([snap]));
            if (historyUnlocked) state.__meta.shiftHistory = historyPlainShadow;
            else state.__meta.shiftHistory = [];
          } else {
            state.__meta.shiftHistory = sanitizeShiftHistory(((state.__meta && state.__meta.shiftHistory) || []).concat([snap]));
          }
          persistState();
          var afterPersist = historyEncryptActive() ? persistChain : Promise.resolve();
          afterPersist.then(function () {
            postShiftSnapshotToNetlifyDb(snap);
            if (isHistoryOnlyLayout()) {
              if (rootEl) rootEl.innerHTML = render();
              showChecklistToast('success', 'Shift saved to history.');
            } else {
              showChecklistToast('success', 'Shift saved to history.');
              window.location.hash = '#/shift-history';
            }
          });
        });
        return;
      }

      var unlockBtn = target.closest('[data-action="unlock-history"]');
      if (unlockBtn) {
        var input = rootEl.querySelector('#shiftHistoryPasswordInput');
        var entered = input ? String(input.value || '').trim() : '';
        if (!entered) {
          historyUnlockError = 'Enter your history passphrase.';
          rootEl.innerHTML = render();
          return;
        }
        var encUnlock = state.__meta && state.__meta.shiftHistoryEnc;
        if (encUnlock && usesWebCrypto()) {
          decryptShiftHistoryBlob(entered, encUnlock)
            .then(function (arr) {
              historyPlainShadow = arr;
              historyUnlocked = true;
              historyUnlockError = '';
              if (!getHistoryPassword()) sessionHistoryPassword = entered;
              state.__meta = state.__meta || {};
              state.__meta.shiftHistory = historyPlainShadow;
              rootEl.innerHTML = render();
              persistState();
              maybeSyncShiftHistoryFromNetlifyDb();
            })
            .catch(function () {
              historyUnlockError = 'Wrong password.';
              rootEl.innerHTML = render();
            });
          return;
        }
        var expected = getHistoryPassword();
        if (!expected) {
          historyUnlockError = 'No encrypted history to unlock. Import a backup or configure a history password.';
          rootEl.innerHTML = render();
          return;
        }
        if (entered !== expected) {
          historyUnlockError = 'Wrong password.';
          rootEl.innerHTML = render();
          return;
        }
        historyUnlocked = true;
        historyUnlockError = '';
        state.__meta = state.__meta || {};
        state.__meta.shiftHistory = historyPlainShadow.slice();
        rootEl.innerHTML = render();
        maybeSyncShiftHistoryFromNetlifyDb();
        return;
      }

      var lockBtn = target.closest('[data-action="lock-history"]');
      if (lockBtn) {
        historyUnlocked = false;
        historyUnlockError = '';
        if (historyEncryptActive()) state.__meta.shiftHistory = [];
        persistState();
        persistChain = persistChain.then(function () {
          sessionHistoryPassword = '';
        });
        rootEl.innerHTML = render();
        return;
      }

      var viewHistoryBtn = target.closest('[data-action="view-history"]');
      if (viewHistoryBtn) {
        var viewId = viewHistoryBtn.getAttribute('data-history-id');
        var viewEntry = ((state.__meta && state.__meta.shiftHistory) || []).find(function (entry) { return entry.id === viewId; });
        if (viewEntry) openHistoryViewModal(viewEntry);
        return;
      }

      var deleteHistoryBtn = target.closest('[data-action="delete-history"]');
      if (deleteHistoryBtn) {
        var delId = deleteHistoryBtn.getAttribute('data-history-id');
        if (delId) removeHistoryEntryById(delId);
        return;
      }

      var copyBtn = target.closest('[data-action="copy-history"]');
      if (copyBtn) {
        var copyId = copyBtn.getAttribute('data-history-id');
        var copyEntry = ((state.__meta && state.__meta.shiftHistory) || []).find(function (entry) { return entry.id === copyId; });
        if (copyEntry && dom && dom.copyToClipboard) dom.copyToClipboard(copyEntry.summaryText || '');
        return;
      }

      var exportHistoryBtn = target.closest('[data-action="export-history-pdf"]');
      if (exportHistoryBtn) {
        var exportId = exportHistoryBtn.getAttribute('data-history-id');
        var exportEntry = ((state.__meta && state.__meta.shiftHistory) || []).find(function (entry) { return entry.id === exportId; });
        if (exportEntry) exportTextAsPdf(exportEntry.summaryText || '', 'Shift Snapshot Export');
        return;
      }
    };
    rootEl.addEventListener('click', onClickHandler);
  }

  function unmount() {
    closeHistoryViewModal();
    dismissChecklistToast();
    if (rootEl && onInputHandler) rootEl.removeEventListener('input', onInputHandler);
    if (rootEl && onBackupFileChange) rootEl.removeEventListener('change', onBackupFileChange);
    if (rootEl && onClickHandler) rootEl.removeEventListener('click', onClickHandler);
    onInputHandler = null;
    onBackupFileChange = null;
    onClickHandler = null;
    rootEl = null;
    historyPlainShadow = [];
    routePathForLayout = 'checklist';
  }

  var checklistView = {
    route: 'checklist',
    navLabel: 'Shift Checklist',
    prepareRoute: prepareRoute,
    render: render,
    mount: mount,
    unmount: unmount
  };

  window.MonitorToolsViews = window.MonitorToolsViews || {};
  window.MonitorToolsViews.checklistView = checklistView;
})();

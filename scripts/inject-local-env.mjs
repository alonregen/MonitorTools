/**
 * Writes js/config.local.js so the static app sets window.* globals before checklist.js loads.
 *
 * Local: reads .env.local — run: npm run local-config
 * CI:    pass --ci and set env WEB3FORMS_ACCESS_KEY (optional CHECKLIST_OWNER_EMAIL).
 *        Shift history password is NOT written in CI by default (so it never ships in public JS).
 *        Set INJECT_SHIFT_HISTORY_PASSWORD_IN_PAGES=true only if you accept that risk.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

var __dirname = path.dirname(fileURLToPath(import.meta.url));
var root = path.join(__dirname, '..');
var envPath = path.join(root, '.env.local');
var outPath = path.join(root, 'js', 'config.local.js');
var ciMode = process.argv.indexOf('--ci') !== -1;

function parseEnv(text) {
  var out = {};
  String(text || '').split(/\r?\n/).forEach(function (line) {
    var t = line.trim();
    if (!t || t[0] === '#') return;
    var eq = t.indexOf('=');
    if (eq === -1) return;
    var k = t.slice(0, eq).trim();
    var v = t.slice(eq + 1).trim();
    if ((v[0] === '"' && v[v.length - 1] === '"') || (v[0] === "'" && v[v.length - 1] === "'")) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  });
  return out;
}

function jsString(s) {
  return JSON.stringify(s == null ? '' : String(s));
}

function writeConfig(web3, pass, ownerEmail, sourceLabel) {
  var parts = [
    '/* ' + sourceLabel + ' — do not commit real keys to git */',
    '(function () {',
    '  if (' + jsString(web3) + ') window.MONITOR_TOOLS_WEB3FORMS_ACCESS_KEY = ' + jsString(web3) + ';',
    '  if (' + jsString(pass) + ') window.MONITOR_TOOLS_SHIFT_HISTORY_PASSWORD = ' + jsString(pass) + ';',
    '  if (' + jsString(ownerEmail) + ') window.MONITOR_TOOLS_CHECKLIST_OWNER_EMAIL = ' + jsString(ownerEmail) + ';',
    '})();',
    ''
  ];
  fs.writeFileSync(outPath, parts.join('\n'), 'utf8');
  console.log('Wrote ' + outPath + ' (' + sourceLabel + ')');
}

if (ciMode) {
  var web3 = process.env.WEB3FORMS_ACCESS_KEY || process.env.MONITOR_TOOLS_WEB3FORMS_ACCESS_KEY || '';
  var ownerEmail = process.env.CHECKLIST_OWNER_EMAIL || process.env.MONITOR_TOOLS_CHECKLIST_OWNER_EMAIL || '';
  var injectPass =
    process.env.INJECT_SHIFT_HISTORY_PASSWORD_IN_PAGES === 'true' ||
    process.env.INJECT_SHIFT_HISTORY_PASSWORD_IN_PAGES === '1';
  var pass = injectPass
    ? (process.env.SHIFT_HISTORY_PASSWORD || process.env.MONITOR_TOOLS_SHIFT_HISTORY_PASSWORD || '')
    : '';
  if (!injectPass && (process.env.SHIFT_HISTORY_PASSWORD || process.env.MONITOR_TOOLS_SHIFT_HISTORY_PASSWORD)) {
    console.warn(
      'CI mode: SHIFT_HISTORY_PASSWORD is set but not written to js/config.local.js (public Pages). ' +
        'Unlock shift history by typing the password on the site, or set INJECT_SHIFT_HISTORY_PASSWORD_IN_PAGES=true to embed (not recommended).'
    );
  }
  if (!web3 && !pass) {
    console.warn('CI mode: no WEB3FORMS_ACCESS_KEY in environment (and no embedded history password); writing stub where needed.');
  }
  writeConfig(web3, pass, ownerEmail, 'CI / GitHub Actions');
  process.exit(0);
}

if (!fs.existsSync(envPath)) {
  console.warn('No .env.local found. Copy .env.local.example to .env.local and add your keys.');
  fs.writeFileSync(
    outPath,
    '/* No .env.local — run: cp .env.local.example .env.local && npm run local-config */\n',
    'utf8'
  );
  console.log('Wrote empty ' + outPath);
  process.exit(0);
}

var env = parseEnv(fs.readFileSync(envPath, 'utf8'));
writeConfig(
  env.WEB3FORMS_ACCESS_KEY || env.MONITOR_TOOLS_WEB3FORMS_ACCESS_KEY || '',
  env.SHIFT_HISTORY_PASSWORD || env.MONITOR_TOOLS_SHIFT_HISTORY_PASSWORD || '',
  env.CHECKLIST_OWNER_EMAIL || env.MONITOR_TOOLS_CHECKLIST_OWNER_EMAIL || '',
  'Generated from .env.local'
);

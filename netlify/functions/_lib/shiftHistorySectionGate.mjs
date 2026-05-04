import crypto from 'crypto';

export const SHIFT_HISTORY_GATE_COOKIE_NAME = 'mt_sh_sec';

/** 7 days */
export const SHIFT_HISTORY_GATE_MAX_AGE_SEC = 7 * 24 * 60 * 60;

function trimEnv(name) {
  var v = process.env[name];
  return typeof v === 'string' ? v.trim() : '';
}

export function getShiftHistorySectionUser() {
  return trimEnv('SHIFT_HISTORY_SECTION_USER');
}

export function getShiftHistorySectionPassword() {
  return trimEnv('SHIFT_HISTORY_SECTION_PASSWORD');
}

export function getShiftHistorySectionCookieSecret() {
  return trimEnv('SHIFT_HISTORY_SECTION_COOKIE_SECRET');
}

/**
 * @returns {'off' | 'misconfigured_userpass' | 'misconfigured_secret' | 'on'}
 */
export function getShiftHistorySectionGateStatus() {
  var u = getShiftHistorySectionUser();
  var p = getShiftHistorySectionPassword();
  var hasU = u.length > 0;
  var hasP = p.length > 0;
  if (!hasU && !hasP) return 'off';
  if (hasU !== hasP) return 'misconfigured_userpass';
  var sec = getShiftHistorySectionCookieSecret();
  if (!sec.length) return 'misconfigured_secret';
  return 'on';
}

/** Compare two UTF-8 strings in constant time (via SHA-256 digests). */
export function timingSafeEqualUtf8(a, b) {
  var da = crypto.createHash('sha256').update(String(a), 'utf8').digest();
  var db = crypto.createHash('sha256').update(String(b), 'utf8').digest();
  return crypto.timingSafeEqual(da, db);
}

/**
 * @param {string | null | undefined} cookieHeader
 * @returns {string | null}
 */
function getCookieValue(cookieHeader, name) {
  if (!cookieHeader || typeof cookieHeader !== 'string') return null;
  var parts = cookieHeader.split(';');
  for (var i = 0; i < parts.length; i += 1) {
    var seg = parts[i].trim();
    if (seg.indexOf(name + '=') === 0) return seg.slice(name.length + 1).trim() || null;
  }
  return null;
}

/**
 * @param {string | null | undefined} cookieHeader
 * @returns {boolean}
 */
export function verifyShiftHistorySectionSessionCookie(cookieHeader) {
  if (getShiftHistorySectionGateStatus() !== 'on') return true;
  var secret = getShiftHistorySectionCookieSecret();
  if (!secret) return false;
  var raw = getCookieValue(cookieHeader, SHIFT_HISTORY_GATE_COOKIE_NAME);
  if (!raw) return false;
  var dot = raw.indexOf('.');
  if (dot < 0) return false;
  var payloadB64 = raw.slice(0, dot);
  var sigB64 = raw.slice(dot + 1);
  var payload;
  try {
    payload = Buffer.from(payloadB64, 'base64url').toString('utf8');
  } catch (_) {
    return false;
  }
  var expectedSig = crypto.createHmac('sha256', secret).update(payload, 'utf8').digest();
  var actualSig;
  try {
    actualSig = Buffer.from(sigB64, 'base64url');
  } catch (_) {
    return false;
  }
  if (expectedSig.length !== actualSig.length) return false;
  if (!crypto.timingSafeEqual(expectedSig, actualSig)) return false;
  try {
    var obj = JSON.parse(payload);
    var exp = Number(obj && obj.exp);
    if (!exp || Number.isNaN(exp)) return false;
    if (exp <= Date.now()) return false;
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * @param {number} expMs
 * @returns {string}
 */
export function signShiftHistorySectionSessionValue(expMs) {
  var secret = getShiftHistorySectionCookieSecret();
  var payload = JSON.stringify({ exp: expMs });
  var sig = crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('base64url');
  var payloadB64 = Buffer.from(payload, 'utf8').toString('base64url');
  return payloadB64 + '.' + sig;
}

/**
 * @param {string} token
 * @returns {string}
 */
export function buildShiftHistoryGateSetCookie(token) {
  return (
    SHIFT_HISTORY_GATE_COOKIE_NAME +
    '=' +
    token +
    '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=' +
    SHIFT_HISTORY_GATE_MAX_AGE_SEC
  );
}

export function buildShiftHistoryGateClearCookie() {
  return SHIFT_HISTORY_GATE_COOKIE_NAME + '=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
}

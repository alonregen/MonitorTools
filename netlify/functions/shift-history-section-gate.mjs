import {
  buildShiftHistoryGateClearCookie,
  buildShiftHistoryGateSetCookie,
  getShiftHistorySectionGateStatus,
  getShiftHistorySectionPassword,
  getShiftHistorySectionUser,
  signShiftHistorySectionSessionValue,
  timingSafeEqualUtf8,
  verifyShiftHistorySectionSessionCookie,
} from './_lib/shiftHistorySectionGate.mjs';

function jsonResponse(obj, status, extraHeaders) {
  var h = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  if (extraHeaders) {
    Object.keys(extraHeaders).forEach(function (k) {
      h[k] = extraHeaders[k];
    });
  }
  return new Response(JSON.stringify(obj), { status: status, headers: h });
}

/**
 * @param {Request} request
 */
export default async function shiftHistorySectionGateHandler(request) {
  var status = getShiftHistorySectionGateStatus();

  if (status === 'misconfigured_userpass') {
    return new Response(
      'Shift history section gate misconfigured: set both SHIFT_HISTORY_SECTION_USER and SHIFT_HISTORY_SECTION_PASSWORD (Netlify Functions env), or clear both to disable.',
      { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
    );
  }

  if (status === 'misconfigured_secret') {
    return new Response(
      'Shift history section gate misconfigured: set SHIFT_HISTORY_SECTION_COOKIE_SECRET when SHIFT_HISTORY_SECTION_USER and SHIFT_HISTORY_SECTION_PASSWORD are set.',
      { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
    );
  }

  if (request.method === 'GET') {
    if (status === 'off') {
      return jsonResponse({ gateEnabled: false, authenticated: true }, 200);
    }
    var ok = verifyShiftHistorySectionSessionCookie(request.headers.get('cookie'));
    return jsonResponse({ gateEnabled: true, authenticated: ok }, 200);
  }

  if (request.method === 'POST') {
    if (status === 'off') {
      return jsonResponse({ error: 'Section gate is not enabled' }, 400);
    }
    var buf = await request.arrayBuffer();
    var text = new TextDecoder('utf-8').decode(buf);
    var body;
    try {
      body = JSON.parse(text);
    } catch (_) {
      return jsonResponse({ error: 'Invalid JSON' }, 400);
    }
    if (!body || typeof body !== 'object') {
      return jsonResponse({ error: 'Invalid body' }, 400);
    }
    var u = typeof body.username === 'string' ? body.username : '';
    var p = typeof body.password === 'string' ? body.password : '';
    var eu = getShiftHistorySectionUser();
    var ep = getShiftHistorySectionPassword();
    if (!timingSafeEqualUtf8(u, eu) || !timingSafeEqualUtf8(p, ep)) {
      return jsonResponse({ error: 'Invalid credentials' }, 401);
    }
    var exp = Date.now() + 7 * 24 * 60 * 60 * 1000;
    var token = signShiftHistorySectionSessionValue(exp);
    return jsonResponse({ ok: true }, 200, {
      'Set-Cookie': buildShiftHistoryGateSetCookie(token),
    });
  }

  if (request.method === 'DELETE') {
    return jsonResponse({ ok: true }, 200, {
      'Set-Cookie': buildShiftHistoryGateClearCookie(),
    });
  }

  return jsonResponse({ error: 'Method not allowed' }, 405, { Allow: 'GET, POST, DELETE' });
}

export const config = {
  path: '/api/shift-history-section-gate',
};

/**
 * Site-wide HTTP Basic Auth (optional). When BASIC_AUTH_USER and BASIC_AUTH_PASSWORD
 * are both set in Netlify env (Functions scope), requests must send valid credentials.
 * If either is unset, auth is skipped so local/preview deploys without misconfiguration
 * still serve the static app.
 *
 * /.well-known/* is never gated (ACME, etc.).
 */

var REALM = 'Monitor Tools';

function trimEnv(name) {
  var v = Netlify.env.get(name);
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * @param {Uint8Array} expected
 * @param {Uint8Array} actual
 */
async function bytesEqualTimingSafe(expected, actual) {
  if (expected.length !== actual.length) {
    var h1 = await crypto.subtle.digest('SHA-256', expected);
    var h2 = await crypto.subtle.digest('SHA-256', actual);
    return crypto.subtle.timingSafeEqual(new Uint8Array(h1), new Uint8Array(h2));
  }
  return crypto.subtle.timingSafeEqual(expected, actual);
}

/**
 * @param {string} expectedUser
 * @param {string} expectedPass
 * @param {string | null} authHeader
 */
async function basicAuthMatches(expectedUser, expectedPass, authHeader) {
  if (!authHeader || authHeader.slice(0, 6).toLowerCase() !== 'basic ') return false;
  var b64 = authHeader.slice(6).trim();
  var decoded;
  try {
    decoded = atob(b64);
  } catch (_) {
    return false;
  }
  var colon = decoded.indexOf(':');
  if (colon < 0) return false;
  var u = decoded.slice(0, colon);
  var p = decoded.slice(colon + 1);
  var enc = new TextEncoder();
  var expected = enc.encode(expectedUser + ':' + expectedPass);
  var actual = enc.encode(u + ':' + p);
  return bytesEqualTimingSafe(expected, actual);
}

export default async function siteGate(request, context) {
  var url = new URL(request.url);
  if (url.pathname.startsWith('/.well-known/')) {
    return context.next();
  }

  var expectedUser = trimEnv('BASIC_AUTH_USER');
  var expectedPass = trimEnv('BASIC_AUTH_PASSWORD');
  var hasUser = expectedUser.length > 0;
  var hasPass = expectedPass.length > 0;

  if (!hasUser && !hasPass) {
    return context.next();
  }

  if (hasUser !== hasPass) {
    return new Response(
      'Basic auth misconfigured: set both BASIC_AUTH_USER and BASIC_AUTH_PASSWORD (Netlify env, Functions scope), or clear both to disable the gate.',
      { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
    );
  }

  var ok = await basicAuthMatches(expectedUser, expectedPass, request.headers.get('authorization'));
  if (ok) {
    return context.next();
  }

  return new Response('Authentication required', {
    status: 401,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'WWW-Authenticate': 'Basic realm="' + REALM + '"',
    },
  });
}

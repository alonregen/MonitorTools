import { getConnectionString } from '@netlify/database';
import postgres from 'postgres';
import {
  getShiftHistorySectionGateStatus,
  verifyShiftHistorySectionSessionCookie,
} from './_lib/shiftHistorySectionGate.mjs';

/** Max JSON body size for POST (bytes). */
const MAX_BODY_BYTES = 512 * 1024;

/**
 * @param {unknown} body
 * @returns {string | null} Error message or null if valid.
 */
function validateSnapshot(body) {
  if (!body || typeof body !== 'object') return 'Invalid body';
  var o = /** @type {Record<string, unknown>} */ (body);
  if (typeof o.id !== 'string' || !o.id.trim()) return 'Invalid id';
  var createdAt = Number(o.createdAt);
  if (!createdAt || Number.isNaN(createdAt)) return 'Invalid createdAt';
  if (typeof o.owner !== 'string') return 'Invalid owner';
  if (typeof o.slotLabel !== 'string') return 'Invalid slotLabel';
  var checked = Number(o.checked);
  var total = Number(o.total);
  if (Number.isNaN(checked) || Number.isNaN(total)) return 'Invalid progress';
  if (!Array.isArray(o.sections)) return 'Invalid sections';
  if (typeof o.summaryText !== 'string') return 'Invalid summaryText';
  if (o.summaryText.length > 200000) return 'summaryText too long';
  if (o.sections.length > 200) return 'sections too large';
  return null;
}

/**
 * @param {import('postgres').Sql} sql
 * @param {Record<string, unknown>} body
 */
async function insertSnapshot(sql, body) {
  var created = new Date(Number(body.createdAt));
  await sql`
    INSERT INTO shift_history_snapshots (id, created_at, snapshot)
    VALUES (${body.id}, ${created}, ${sql.json(body)})
    ON CONFLICT (id) DO NOTHING
  `;
}

/**
 * @param {Request} request
 */
export default async function shiftHistoryHandler(request) {
  var gateStatus = getShiftHistorySectionGateStatus();
  if (gateStatus === 'misconfigured_userpass' || gateStatus === 'misconfigured_secret') {
    return new Response(JSON.stringify({ error: 'Shift history section gate misconfigured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
  if (gateStatus === 'on' && !verifyShiftHistorySectionSessionCookie(request.headers.get('cookie'))) {
    return new Response(JSON.stringify({ error: 'Shift history section login required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  var dbUrl = process.env.NETLIFY_DB_URL || '';
  if (!dbUrl) {
    try {
      dbUrl = getConnectionString();
    } catch (_) {
      dbUrl = '';
    }
  }
  if (!dbUrl) {
    return new Response(JSON.stringify({ error: 'Database not configured (NETLIFY_DB_URL missing)' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  var sql = postgres(dbUrl, { max: 1, idle_timeout: 20, connect_timeout: 10 });

  try {
    if (request.method === 'GET') {
      var rows = await sql`
        SELECT id, snapshot, created_at
        FROM shift_history_snapshots
        ORDER BY created_at DESC
      `;
      var list = rows.map(function (r) {
        var snap = r.snapshot && typeof r.snapshot === 'object' ? { ...r.snapshot } : {};
        snap.id = r.id;
        snap.createdAt = new Date(r.created_at).getTime();
        return snap;
      });
      return new Response(JSON.stringify(list), {
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }

    if (request.method === 'POST') {
      var lenHeader = request.headers.get('content-length');
      if (lenHeader && Number(lenHeader) > MAX_BODY_BYTES) {
        return new Response(JSON.stringify({ error: 'Payload too large' }), {
          status: 413,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        });
      }
      var buf = await request.arrayBuffer();
      if (buf.byteLength > MAX_BODY_BYTES) {
        return new Response(JSON.stringify({ error: 'Payload too large' }), {
          status: 413,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        });
      }
      var text = new TextDecoder('utf-8').decode(buf);
      var body;
      try {
        body = JSON.parse(text);
      } catch (_) {
        return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        });
      }
      var err = validateSnapshot(body);
      if (err) {
        return new Response(JSON.stringify({ error: err }), {
          status: 400,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        });
      }
      await insertSnapshot(sql, /** @type {Record<string, unknown>} */ (body));
      return new Response(JSON.stringify({ ok: true, id: body.id }), {
        status: 201,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Allow': 'GET, POST', 'Content-Type': 'application/json; charset=utf-8' },
    });
  } catch (e) {
    console.error('shift-history function error', e);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  } finally {
    await sql.end({ timeout: 5 }).catch(function () {});
  }
}

export const config = {
  path: '/api/shift-history',
};

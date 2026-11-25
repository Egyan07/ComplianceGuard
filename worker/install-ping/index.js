// ComplianceGuard install counter: a Cloudflare Worker.
//
// Receives the opt-in ping from electron/install-ping.js and answers one
// question the GitHub download count cannot: how many separate installations
// actually run. Downloads include updater metadata, so they overcount.
//
// What is stored per install, in KV:
//   install:<installId> -> { firstSeen, lastSeen, appVersion, platform, arch, lastDay }
// Counters:
//   meta:installs   total distinct installations ever seen
//   meta:day:<date> distinct installations seen that UTC day
//   meta:pings      total pings received
//
// What is NOT stored: IP address, user agent, referrer, request headers,
// geography. Nothing is written to logs. An install id is a random UUID the
// client made and cannot be reversed into a person or a machine.
//
// Bind a KV namespace as INSTALLS (see wrangler.toml). If the binding is
// missing the worker answers 503 rather than silently accepting and dropping.

const MAX_BODY_BYTES = 1024;
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

function clean(value, max) {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

async function bump(kv, key) {
  const current = Number((await kv.get(key)) || 0);
  await kv.put(key, String(current + 1));
  return current + 1;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/stats') {
      if (!env.STATS_TOKEN) return json({ error: 'stats disabled' }, 403);
      if (url.searchParams.get('token') !== env.STATS_TOKEN) return json({ error: 'forbidden' }, 403);
      const day = new Date().toISOString().slice(0, 10);
      return json({
        installs: Number((await env.INSTALLS.get('meta:installs')) || 0),
        pings: Number((await env.INSTALLS.get('meta:pings')) || 0),
        dau: Number((await env.INSTALLS.get(`meta:day:${day}`)) || 0),
        day,
      });
    }

    if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
    if (!env.INSTALLS) return json({ error: 'not configured' }, 503);

    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return json({ error: 'too large' }, 413);

    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ error: 'bad json' }, 400);
    }

    // Only these five fields are read. Anything else in the body is ignored,
    // so a client cannot accidentally start storing more than it should.
    const installId = clean(body.installId, 64);
    if (!ID_RE.test(installId)) return json({ error: 'bad install id' }, 400);

    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    const record = {
      appVersion: clean(body.appVersion, 32),
      platform: clean(body.platform, 16),
      arch: clean(body.arch, 16),
    };

    const key = `install:${installId}`;
    const existing = await env.INSTALLS.get(key, 'json');

    if (!existing) {
      await env.INSTALLS.put(
        key,
        JSON.stringify({ ...record, firstSeen: now.toISOString(), lastSeen: now.toISOString(), lastDay: day })
      );
      await bump(env.INSTALLS, 'meta:installs');
      // A first ping is also that install's first active day. Without this the
      // daily number misses every new install until its second day.
      await bump(env.INSTALLS, `meta:day:${day}`);
    } else {
      await env.INSTALLS.put(
        key,
        JSON.stringify({
          firstSeen: existing.firstSeen || now.toISOString(),
          lastSeen: now.toISOString(),
          lastDay: day,
          // Keep the newest version seen, so an install that updates is not
          // frozen at the version it first ran.
          appVersion: record.appVersion || existing.appVersion,
          platform: record.platform || existing.platform,
          arch: record.arch || existing.arch,
        })
      );
      if (existing.lastDay !== day) await bump(env.INSTALLS, `meta:day:${day}`);
    }

    await bump(env.INSTALLS, 'meta:pings');
    return json({ ok: true }, 202);
  },
};

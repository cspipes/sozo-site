// sozoware.com – Cloudflare Worker.
// Static files in /public are served by Cloudflare directly. This script only
// handles /api/* routes. Today that is the pilot sign-up form.
//
// Settings (Cloudflare dashboard > Workers & Pages > sozo-site > Settings > Variables and Secrets):
//   FORM_WEBHOOK_URL      (secret)    Where each sign-up is sent as JSON. A Power Automate
//                                     "When an HTTP request is received" URL, Zapier, Make, Slack, etc.
//   TURNSTILE_SECRET_KEY  (secret)    Optional. Turns on the Cloudflare Turnstile spam check.
//                                     Also put the matching site key in index.html
//                                     (data-turnstile-sitekey on the form).

const MAX = { name: 120, agency: 160, email: 200, team_size: 40 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/pilot') {
      if (request.method !== 'POST') {
        return json({ ok: false, error: 'method_not_allowed' }, 405, { Allow: 'POST' });
      }
      return handlePilot(request, env);
    }

    if (url.pathname.startsWith('/api/')) {
      return json({ ok: false, error: 'not_found' }, 404);
    }

    return env.ASSETS.fetch(request);
  },
};

async function handlePilot(request, env) {
  let fields;
  try {
    fields = await readFields(request);
  } catch {
    return json({ ok: false, error: 'bad_request' }, 400);
  }

  // Honeypot: real people never fill in the hidden "website" field.
  if (fields.website) {
    return json({ ok: true });
  }

  const entry = {
    name: clean(fields.name, MAX.name),
    agency: clean(fields.agency, MAX.agency),
    email: clean(fields.email, MAX.email).toLowerCase(),
    team_size: clean(fields.team_size, MAX.team_size),
  };
  if (!entry.name || !entry.agency || !EMAIL_RE.test(entry.email)) {
    return json({ ok: false, error: 'invalid' }, 422);
  }

  if (env.TURNSTILE_SECRET_KEY) {
    const passed = await verifyTurnstile(
      env.TURNSTILE_SECRET_KEY,
      fields['cf-turnstile-response'],
      request.headers.get('CF-Connecting-IP')
    );
    if (!passed) return json({ ok: false, error: 'spam_check_failed' }, 403);
  }

  if (!env.FORM_WEBHOOK_URL) {
    console.error('Pilot sign-up received but FORM_WEBHOOK_URL is not set', entry);
    return json({ ok: false, error: 'not_configured' }, 503);
  }

  const payload = {
    ...entry,
    source: 'sozoware.com pilot form',
    submitted_at: new Date().toISOString(),
    country: request.cf?.country || '',
  };

  const res = await fetch(env.FORM_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    console.error('Form webhook failed', res.status, await res.text().catch(() => ''));
    return json({ ok: false, error: 'delivery_failed' }, 502);
  }

  return json({ ok: true });
}

async function readFields(request) {
  const type = request.headers.get('Content-Type') || '';
  if (type.includes('application/json')) {
    return await request.json();
  }
  const form = await request.formData();
  const out = {};
  for (const [k, v] of form.entries()) out[k] = typeof v === 'string' ? v : '';
  return out;
}

function clean(value, max) {
  return String(value ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
}

async function verifyTurnstile(secret, token, ip) {
  if (!token) return false;
  const body = new FormData();
  body.append('secret', secret);
  body.append('response', token);
  if (ip) body.append('remoteip', ip);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
  const data = await res.json().catch(() => ({}));
  return data.success === true;
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

// sozoware.com – Cloudflare Worker.
// Static files in /public are served by Cloudflare directly. This script only
// handles /api/* routes. Today that is the pilot sign-up form.
//
// How sign-ups are delivered:
//   PILOT_EMAIL  (send_email binding in wrangler.jsonc)  Emails each sign-up from pilot@sozoware.com
//                to chris@pipesins.com, which must stay a verified Email Routing destination.
//
// Optional settings (Cloudflare dashboard > Workers & Pages > sozo-site > Settings > Variables and Secrets):
//   FORM_WEBHOOK_URL      (secret)    Also send each sign-up as JSON to a webhook (Power Automate,
//                                     Zapier, Make, Slack, a CRM...).
//   TURNSTILE_SECRET_KEY  (secret)    Turns on the Cloudflare Turnstile spam check.
//                                     Also put the matching site key in index.html
//                                     (data-turnstile-sitekey on the form).

import { EmailMessage } from 'cloudflare:email';

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

  const payload = {
    ...entry,
    source: 'sozoware.com pilot form',
    submitted_at: new Date().toISOString(),
    country: request.cf?.country || '',
  };

  // Deliver by email (PILOT_EMAIL binding in wrangler.jsonc) and/or webhook (FORM_WEBHOOK_URL).
  // The sign-up counts as received if at least one of them works.
  let delivered = false;

  if (env.PILOT_EMAIL) {
    try {
      await env.PILOT_EMAIL.send(
        new EmailMessage(MAIL_FROM, MAIL_TO, buildSignupEmail(payload))
      );
      delivered = true;
    } catch (err) {
      console.error('Pilot email failed', String(err), payload);
    }
  }

  if (env.FORM_WEBHOOK_URL) {
    try {
      const res = await fetch(env.FORM_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) delivered = true;
      else console.error('Form webhook failed', res.status, await res.text().catch(() => ''));
    } catch (err) {
      console.error('Form webhook failed', String(err));
    }
  }

  if (!delivered) {
    console.error('Pilot sign-up could not be delivered', payload);
    return json({ ok: false, error: 'delivery_failed' }, 502);
  }
  return json({ ok: true });
}

// ---------- sign-up email ----------
// Sent from an address on sozoware.com to the verified Email Routing destination.

const MAIL_FROM = 'pilot@sozoware.com';
const MAIL_TO = 'chris@pipesins.com';

function buildSignupEmail(p) {
  const subject = `Sozo pilot sign-up: ${p.agency}`;
  const when = new Date(p.submitted_at).toLocaleString('en-US', {
    timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short',
  });
  const rows = [
    ['Name', p.name],
    ['Agency', p.agency],
    ['Email', p.email],
    ['Team size', p.team_size || 'Not given'],
    ['Submitted', `${when} ET`],
    ['Country', p.country || 'Unknown'],
  ];

  const text = [
    'New Sozo pilot sign-up',
    '',
    ...rows.map(([k, v]) => `${k}: ${v}`),
    '',
    'Reply to this email to answer them directly.',
  ].join('\r\n');

  const cell = 'padding:8px 0;border-bottom:1px solid #E3E9F2;font-size:15px';
  const html = `<!doctype html><html><body style="margin:0;background:#F5F7FC;font-family:Segoe UI,Arial,sans-serif;color:#1A1836">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7FC;padding:24px 0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#FFFFFF;border-radius:14px;overflow:hidden">
<tr><td style="background:#1B1749;padding:18px 24px;color:#FFFFFF;font-size:20px;font-weight:800">Sozo<span style="color:#23AEE0">.</span> <span style="font-weight:600;font-size:15px;color:#9DD8F0">&nbsp;Pilot sign-up</span></td></tr>
<tr><td style="padding:22px 24px 6px;font-size:22px;font-weight:800;color:#252060">${esc(p.agency)}</td></tr>
<tr><td style="padding:0 24px 18px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${rows.map(([k, v]) => `<tr><td style="${cell};color:#55597A;width:120px">${esc(k)}</td><td style="${cell};font-weight:600">${k === 'Email' ? `<a href="mailto:${esc(v)}" style="color:#0E7AA3">${esc(v)}</a>` : esc(v)}</td></tr>`).join('\n')}
</table></td></tr>
<tr><td style="padding:0 24px 22px;font-size:13px;color:#55597A">Reply to this email to answer ${esc(p.name.split(' ')[0])} directly. Sent from the form on sozoware.com.</td></tr>
</table></td></tr></table></body></html>`;

  const boundary = `sozo-${crypto.randomUUID()}`;
  const replyName = p.name.replace(/["\r\n\\]/g, '').slice(0, 80);
  const headers = [
    `From: "Sozo website" <${MAIL_FROM}>`,
    `To: <${MAIL_TO}>`,
    `Reply-To: ${displayName(replyName)} <${p.email}>`,
    `Subject: ${headerText(subject.replace(/[\r\n]/g, ' '))}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@sozoware.com>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  return [
    ...headers,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64(text),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64(html),
    `--${boundary}--`,
    '',
  ].join('\r\n');
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function b64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/.{1,76}/g, '$&\r\n').trimEnd();
}

// Header text: plain when it is simple ASCII, otherwise an RFC 2047 encoded word.
function headerText(s) {
  return /^[\x20-\x7E]*$/.test(s) ? s : `=?UTF-8?B?${b64(s).replace(/\r\n/g, '')}?=`;
}

// A display name for From/Reply-To: quoted when ASCII, encoded otherwise.
function displayName(s) {
  return /^[\x20-\x7E]*$/.test(s) ? `"${s}"` : headerText(s);
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

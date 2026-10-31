// server.js
// Same-origin static server + Gmail OAuth proxy for Cloud Run.
// No external npm dependencies. Node >= 20.

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8080);

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.settings.basic'
].join(' ');

const sessions = new Map();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

const KNOWN_SYSTEM_LABELS = new Set([
  'INBOX',
  'STARRED',
  'IMPORTANT',
  'UNREAD',
  'SENT',
  'DRAFT',
  'SPAM',
  'TRASH',
  'CATEGORY_PERSONAL',
  'CATEGORY_PROMOTIONS',
  'CATEGORY_SOCIAL',
  'CATEGORY_UPDATES',
  'CATEGORY_FORUMS'
]);

function baseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`;
  return `${proto}://${host}`;
}

function redirectUri(req) {
  return process.env.GOOGLE_REDIRECT_URI || `${baseUrl(req)}/oauth2callback`;
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  return Object.fromEntries(
    header
      .split(';')
      .map(p => p.trim())
      .filter(Boolean)
      .map(p => {
        const i = p.indexOf('=');
        if (i === -1) return ['', ''];
        return [p.slice(0, i), decodeURIComponent(p.slice(i + 1))];
      })
      .filter(([k]) => k)
  );
}

function setCookie(res, name, value, options = {}) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${options.path || '/'}`,
    `Max-Age=${options.maxAge ?? 60 * 60 * 24 * 7}`
  ];

  if (options.httpOnly) parts.push('HttpOnly');
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  if (options.secure) parts.push('Secure');

  const cookie = parts.join('; ');
  const prev = res.getHeader('Set-Cookie');

  if (!prev) {
    res.setHeader('Set-Cookie', cookie);
  } else {
    res.setHeader('Set-Cookie', [].concat(prev, cookie));
  }
}

function clearCookie(res, name) {
  setCookie(res, name, '', { maxAge: 0 });
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

async function readJsonBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (err) {
        reject(err);
      }
    });

    req.on('error', reject);
  });
}

function getSession(req) {
  const cookies = parseCookies(req);
  const sid = cookies.ic_sid;
  if (!sid) return null;
  return sessions.get(sid) || null;
}

function requireSession(req, res) {
  const session = getSession(req);
  if (!session) {
    sendJson(res, 401, { error: 'LOGIN_REQUIRED', loginUrl: '/api/auth/login' });
    return null;
  }
  return session;
}

async function refreshAccessToken(session) {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: session.refresh_token,
    grant_type: 'refresh_token'
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  session.access_token = data.access_token;
  session.expires_at = Date.now() + (data.expires_in || 3600) * 1000;
  return session.access_token;
}

async function getAccessToken(session) {
  if (!session.access_token || Date.now() >= session.expires_at - 30000) {
    return refreshAccessToken(session);
  }
  return session.access_token;
}

async function gmailFetch(session, endpoint, options = {}) {
  const token = await getAccessToken(session);

  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gmail API ${res.status}: ${text}`);
  }

  if (res.status === 204) return {};
  return res.json();
}

async function getLabelsMap(session) {
  if (!session.labels) {
    const data = await gmailFetch(session, 'labels');
    session.labels = new Map(data.labels.map(l => [l.name, l.id]));
    session.labelById = new Map(data.labels.map(l => [l.id, l.name]));
  }
  return session.labels;
}

async function ensureLabel(session, name) {
  const map = await getLabelsMap(session);
  if (map.has(name)) return map.get(name);

  const created = await gmailFetch(session, 'labels', {
    method: 'POST',
    body: JSON.stringify({
      name,
      labelListVisibility: 'labelShow',
      messageListVisibility: 'show'
    })
  });

  map.set(created.name, created.id);
  session.labelById.set(created.id, created.name);
  return created.id;
}

async function resolveLabelIds(session, names = []) {
  const ids = [];
  for (const raw of names) {
    const name = String(raw || '').trim();
    if (!name) continue;

    if (KNOWN_SYSTEM_LABELS.has(name)) {
      ids.push(name);
      continue;
    }

    ids.push(await ensureLabel(session, name));
  }
  return Array.from(new Set(ids));
}

function labelNamesFromIds(session, ids = []) {
  const map = session.labelById || new Map();
  return ids.map(id => map.get(id) || id);
}

function parseHeader(headers, name) {
  const found = headers.find(h => h.name?.toLowerCase() === name.toLowerCase());
  return found?.value || '';
}

function parseFrom(value) {
  const str = String(value || '').trim();
  const match = str.match(/^(.*?)\s*<([^>]+)>$/);
  if (match) {
    return {
      name: match[1].replace(/^"|"$/g, '').trim() || match[2],
      email: match[2].toLowerCase()
    };
  }
  if (str.includes('@')) {
    return { name: str.split('@')[0], email: str.toLowerCase() };
  }
  return { name: str || 'Unknown', email: '' };
}

function extractEmails(value) {
  const str = String(value || '');
  return Array.from(str.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g))
    .map(m => m[0].toLowerCase());
}

function toMinorUnits(numStr) {
  const cleaned = String(numStr).replace(/,/g, '');
  const num = Number(cleaned);
  if (!Number.isFinite(num)) return null;
  return Math.round(num * 100);
}

function parseAmount(text) {
  const s = String(text || '').replace(/\s+/g, ' ');

  const symbolMap = {
    '$': 'USD',
    '€': 'EUR',
    '£': 'GBP',
    '₹': 'INR',
    '¥': 'JPY'
  };

  const numberRe = String.raw`\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?`;

  let m = s.match(new RegExp(String.raw`([$€£₹¥])\s*(${numberRe})`, 'i'));
  if (m) {
    return { amount: toMinorUnits(m[2]), currency: symbolMap[m[1]] || 'USD' };
  }

  m = s.match(new RegExp(String.raw`\b(USD|EUR|GBP|INR|CAD|AUD|JPY)\b\s*(${numberRe})`, 'i'));
  if (m) {
    return { amount: toMinorUnits(m[2]), currency: m[1].toUpperCase() };
  }

  m = s.match(new RegExp(String.raw`(${numberRe})\s*\b(USD|EUR|GBP|INR|CAD|AUD|JPY)\b`, 'i'));
  if (m) {
    return { amount: toMinorUnits(m[1]), currency: m[2].toUpperCase() };
  }

  return { amount: null, currency: null };
}

function categorizeExpense(text) {
  const s = String(text || '').toLowerCase();

  if (/flight|hotel|uber|lyft|delta|airline|booking|travel|airbnb/.test(s)) return 'travel';
  if (/starbucks|mcdonald|restaurant|food|doordash|uber eats|coffee|grocery/.test(s)) return 'food';
  if (/adobe|aws|netflix|spotify|software|subscription|icloud|google one/.test(s)) return 'software';
  if (/staples|office|supplies|printer/.test(s)) return 'office';
  if (/pharmacy|walgreens|clinic|health|medical|dental/.test(s)) return 'health';
  if (/amazon|target|walmart|store|shopping|order/.test(s)) return 'shopping';

  return 'other';
}

function looksLikeExpense(text) {
  return /receipt|invoice|confirmation|payment|order|booking|statement|charge/.test(
    String(text || '').toLowerCase()
  );
}

function messageFromGmail(msg, session) {
  const headers = msg.payload?.headers || [];
  const from = parseFrom(parseHeader(headers, 'From'));
  const subject = parseHeader(headers, 'Subject') || '(no subject)';
  const date = parseHeader(headers, 'Date') || '';
  const listUnsubscribe = Boolean(parseHeader(headers, 'List-Unsubscribe'));
  const snippet = msg.snippet || '';
  const labelIds = msg.labelIds || [];
  const labels = labelNamesFromIds(session, labelIds);

  const combined = `${subject} ${snippet}`;
  const parsed = parseAmount(combined);
  const isExpense = looksLikeExpense(combined);

  const local = from.email.split('@')[0] || '';
  const ignored =
    labels.includes('CATEGORY_PROMOTIONS') ||
    labels.includes('CATEGORY_SOCIAL') ||
    /noreply|no-reply/.test(local);

  return {
    id: msg.id,
    name: from.name,
    email: from.email,
    subject,
    date,
    labels,
    starred: labels.includes('STARRED'),
    important: labels.includes('IMPORTANT'),
    listUnsubscribe,
    ignored,
    isExpense,
    amount: parsed.amount,
    currency: parsed.currency,
    category: isExpense ? categorizeExpense(combined) : null,
    snippet
  };
}

async function handleStatus(req, res) {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return sendJson(res, 200, { available: false, authenticated: false });
  }

  const session = getSession(req);
  if (!session) {
    return sendJson(res, 200, { available: true, authenticated: false });
  }

  try {
    const profile = await gmailFetch(session, 'profile');
    const inboxLabel = await gmailFetch(session, 'labels/INBOX');

    return sendJson(res, 200, {
      available: true,
      authenticated: true,
      email: profile.emailAddress,
      inboxCount: Number(inboxLabel.messagesTotal || 0)
    });
  } catch {
    const cookies = parseCookies(req);
    if (cookies.ic_sid) sessions.delete(cookies.ic_sid);
    clearCookie(res, 'ic_sid');
    return sendJson(res, 200, { available: true, authenticated: false });
  }
}

async function handleLogin(req, res) {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return sendJson(res, 500, { error: 'OAuth is not configured' });
  }

  const state = crypto.randomUUID();
  setCookie(res, 'ic_state', state, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: baseUrl(req).startsWith('https'),
    maxAge: 600
  });

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri(req),
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state
  });

  redirect(res, `https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}

async function handleCallback(req, res, url) {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookies = parseCookies(req);

  if (!code || !state || cookies.ic_state !== state) {
    return redirect(res, '/?auth_error=1');
  }

  clearCookie(res, 'ic_state');

  try {
    const body = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri(req)
    });

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      console.error('Token exchange failed', text);
      return redirect(res, '/?auth_error=1');
    }

    const token = await tokenRes.json();
    const sid = crypto.randomUUID();

    sessions.set(sid, {
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      expires_at: Date.now() + (token.expires_in || 3600) * 1000,
      labels: null,
      labelById: null
    });

    setCookie(res, 'ic_sid', sid, {
      httpOnly: true,
      sameSite: 'Lax',
      secure: baseUrl(req).startsWith('https'),
      maxAge: 60 * 60 * 24 * 7
    });

    return redirect(res, '/?real=1');
  } catch (err) {
    console.error(err);
    return redirect(res, '/?auth_error=1');
  }
}

async function handleLogout(req, res) {
  const cookies = parseCookies(req);
  if (cookies.ic_sid) sessions.delete(cookies.ic_sid);
  clearCookie(res, 'ic_sid');
  redirect(res, '/');
}

async function handleMessages(req, res, url) {
  const session = requireSession(req, res);
  if (!session) return;

  const maxResults = Math.min(50, Math.max(1, Number(url.searchParams.get('maxResults') || 25)));
  const q = url.searchParams.get('q') || 'in:inbox';

  await getLabelsMap(session);

  const list = await gmailFetch(session, `messages?q=${encodeURIComponent(q)}&maxResults=${maxResults}&includeSpamTrash=false`);
  const ids = (list.messages || []).map(m => m.id);

  const messages = [];
  let apiCalls = 1;

  for (const id of ids) {
    const msg = await gmailFetch(session, `messages/${id}?format=full`);
    messages.push(messageFromGmail(msg, session));
    apiCalls += 1;
  }

  sendJson(res, 200, {
    messages,
    apiCalls: { messages: apiCalls }
  });
}

async function handleSentContacts(req, res, url) {
  const session = requireSession(req, res);
  if (!session) return;

  const maxResults = Math.min(100, Math.max(1, Number(url.searchParams.get('maxResults') || 50)));
  await getLabelsMap(session);

  const list = await gmailFetch(session, `messages?q=${encodeURIComponent('in:sent')}&maxResults=${maxResults}`);
  const ids = (list.messages || []).map(m => m.id);

  const contacts = new Set();
  const domains = new Set();
  let apiCalls = 1;

  for (const id of ids) {
    const msg = await gmailFetch(
      session,
      `messages/${id}?format=metadata&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Bcc`
    );

    const headers = msg.payload?.headers || [];
    const to = parseHeader(headers, 'To');
    const cc = parseHeader(headers, 'Cc');

    for (const email of [...extractEmails(to), ...extractEmails(cc)]) {
      contacts.add(email);
      const domain = email.split('@')[1];
      if (domain) domains.add(domain);
    }

    apiCalls += 1;
  }

  sendJson(res, 200, {
    contacts: Array.from(contacts),
    domains: Array.from(domains),
    apiCalls: { sentContacts: apiCalls }
  });
}

async function handleBatchModify(req, res) {
  const session = requireSession(req, res);
  if (!session) return;

  const body = await readJsonBody(req);
  const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : [];
  const addLabelNames = Array.isArray(body.addLabelNames) ? body.addLabelNames : [];
  const removeLabelNames = Array.isArray(body.removeLabelNames) ? body.removeLabelNames : [];

  if (!ids.length) {
    return sendJson(res, 200, { ok: true, apiCalls: { batchModify: 0 } });
  }

  const addLabelIds = await resolveLabelIds(session, addLabelNames);
  const removeLabelIds = await resolveLabelIds(session, removeLabelNames);

  let apiCalls = 0;

  for (let i = 0; i < ids.length; i += 1000) {
    const chunk = ids.slice(i, i + 1000);
    await gmailFetch(session, 'messages/batchModify', {
      method: 'POST',
      body: JSON.stringify({
        ids: chunk,
        addLabelIds,
        removeLabelIds
      })
    });
    apiCalls += 1;
  }

  sendJson(res, 200, { ok: true, apiCalls: { batchModify: apiCalls } });
}

async function handleCreateFilter(req, res) {
  const session = requireSession(req, res);
  if (!session) return;

  const body = await readJsonBody(req);
  const from = String(body.from || '').trim();
  if (!from) {
    return sendJson(res, 400, { error: 'filter.from is required' });
  }

  const addLabelIds = await resolveLabelIds(session, body.addLabels || []);
  const removeLabelIds = await resolveLabelIds(session, body.removeLabels || []);

  const created = await gmailFetch(session, 'settings/filters', {
    method: 'POST',
    body: JSON.stringify({
      criteria: { from },
      action: {
        addLabelIds,
        removeLabelIds
      }
    })
  });

  sendJson(res, 200, {
    id: created.id,
    apiCalls: { createFilter: 1 }
  });
}

async function handleDeleteFilter(req, res, id) {
  const session = requireSession(req, res);
  if (!session) return;

  await gmailFetch(session, `settings/filters/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });

  sendJson(res, 200, { ok: true, apiCalls: { deleteFilter: 1 } });
}

async function handleRestoreLabels(req, res) {
  const session = requireSession(req, res);
  if (!session) return;

  const body = await readJsonBody(req);
  const items = Array.isArray(body.items) ? body.items : [];
  let apiCalls = 0;

  for (const item of items) {
    if (!item?.id || !Array.isArray(item.labels)) continue;

    const msg = await gmailFetch(session, `messages/${item.id}?format=minimal`);
    apiCalls += 1;

    const currentIds = new Set(msg.labelIds || []);
    const targetIds = new Set(await resolveLabelIds(session, item.labels));

    const addLabelIds = Array.from(targetIds).filter(id => !currentIds.has(id));
    const removeLabelIds = Array.from(currentIds).filter(id => !targetIds.has(id));

    if (addLabelIds.length || removeLabelIds.length) {
      await gmailFetch(session, `messages/${item.id}/modify`, {
        method: 'POST',
        body: JSON.stringify({ addLabelIds, removeLabelIds })
      });
      apiCalls += 1;
    }
  }

  sendJson(res, 200, { ok: true, apiCalls: { restoreLabels: apiCalls } });
}

async function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);

  if (pathname === '/') pathname = '/index.html';

  const fullPath = path.normalize(path.join(__dirname, pathname));
  if (!fullPath.startsWith(__dirname)) {
    return sendJson(res, 403, { error: 'Forbidden' });
  }

  try {
    const data = await fs.readFile(fullPath);
    const ext = path.extname(fullPath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'"
    });
    res.end(data);
  } catch {
    if (pathname.startsWith('/api/')) {
      return sendJson(res, 404, { error: 'Not found' });
    }

    try {
      const index = await fs.readFile(path.join(__dirname, 'index.html'));
      res.writeHead(200, {
        'Content-Type': MIME['.html'],
        'Cache-Control': 'no-cache'
      });
      res.end(index);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
    }
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, baseUrl(req));
    const pathname = url.pathname;

    if (pathname === '/api/auth/login') return handleLogin(req, res);
    if (pathname === '/oauth2callback') return handleCallback(req, res, url);
    if (pathname === '/api/auth/logout') return handleLogout(req, res);

    if (pathname === '/api/gmail/status') return handleStatus(req, res);
    if (pathname === '/api/gmail/messages') return handleMessages(req, res, url);
    if (pathname === '/api/gmail/sent-contacts') return handleSentContacts(req, res, url);
    if (pathname === '/api/gmail/batchModify' && req.method === 'POST') return handleBatchModify(req, res);
    if (pathname === '/api/gmail/filters' && req.method === 'POST') return handleCreateFilter(req, res);
    if (pathname === '/api/gmail/restoreLabels' && req.method === 'POST') return handleRestoreLabels(req, res);

    const filterMatch = pathname.match(/^\/api\/gmail\/filters\/([^/]+)$/);
    if (filterMatch && req.method === 'DELETE') {
      return handleDeleteFilter(req, res, decodeURIComponent(filterMatch[1]));
    }

    if (pathname.startsWith('/api/')) {
      return sendJson(res, 404, { error: 'Not found' });
    }

    return serveStatic(req, res, url);
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: 'Internal server error' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Inbox Court server listening on port ${PORT}`);
});
(() => {
'use strict';

/* PMV Toolkit Tracker V14
 * Unified session selection.
 *
 * Fixes the V13 bug where pmv_session_v2 was checked BEFORE
 * pmv_session_v3. A stale legacy token could therefore be selected
 * even when a newer valid session existed.
 */

const PRIMARY = 'pmv_session_v3';
const LEGACY = [
  'pmv_session_v2',
  'pmv_session',
  'pmvSession',
  'session',
  'sessionData',
  'currentSession',
  'pmv_session_data'
];
const ALL_KEYS = [PRIMARY, ...LEGACY];
const TIMEOUT = 30000;

function parseStored(v) {
  if (!v) return null;
  try {
    const x = typeof v === 'string' ? JSON.parse(v) : v;
    if (!x || typeof x !== 'object') return null;
    if (x.session && typeof x.session === 'object') return parseStored(x.session);
    if (x.sessionData && typeof x.sessionData === 'object') return parseStored(x.sessionData);
    if (x.token && x.userId) return x;
  } catch (_) {}
  return null;
}

function valid(s) {
  return !!(s && typeof s === 'object' && s.token && s.userId);
}

function sessionTime(s) {
  const candidates = [
    s?.lastActive, s?.LAST_ACTIVE, s?.last_active,
    s?.createdAt, s?.CREATED_AT, s?.created_at,
    s?.timestamp, s?.TIMESTAMP
  ];
  for (const v of candidates) {
    const n = Date.parse(String(v || ''));
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function collectStorageCandidates(storage) {
  const out = [];
  if (!storage) return out;

  const seenTokens = new Set();

  // Explicit keys first, but PRIMARY is deliberately first.
  for (const key of ALL_KEYS) {
    let s = null;
    try { s = parseStored(storage.getItem(key)); } catch (_) {}
    if (valid(s) && !seenTokens.has(String(s.token))) {
      seenTokens.add(String(s.token));
      out.push({ key, session: s, priority: key === PRIMARY ? 1000000 : (ALL_KEYS.length - ALL_KEYS.indexOf(key)) });
    }
  }

  // Also inspect other storage entries used by older builds.
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key || ALL_KEYS.includes(key)) continue;
    let s = null;
    try { s = parseStored(storage.getItem(key)); } catch (_) {}
    if (valid(s) && !seenTokens.has(String(s.token))) {
      seenTokens.add(String(s.token));
      out.push({ key, session: s, priority: 0 });
    }
  }
  return out;
}

function collectCandidates() {
  const out = [];
  try { out.push(...collectStorageCandidates(window.localStorage)); } catch (_) {}
  try {
    for (const item of collectStorageCandidates(window.sessionStorage)) {
      if (!out.some(x => String(x.session.token) === String(item.session.token))) out.push(item);
    }
  } catch (_) {}

  // Older builds sometimes exposed a session on window.
  for (const key of ['PMV_SESSION', 'pmvSession', 'sessionData', 'currentSession']) {
    try {
      const s = parseStored(window[key]);
      if (valid(s) && !out.some(x => String(x.session.token) === String(s.token))) {
        out.push({ key: 'window.' + key, session: s, priority: 0 });
      }
    } catch (_) {}
  }

  // PRIMARY always wins. For non-primary candidates, prefer the newest timestamp.
  out.sort((a, b) => {
    const ap = a.key === PRIMARY ? 1 : 0;
    const bp = b.key === PRIMARY ? 1 : 0;
    if (ap !== bp) return bp - ap;
    const at = sessionTime(a.session), bt = sessionTime(b.session);
    if (at !== bt) return bt - at;
    return (b.priority || 0) - (a.priority || 0);
  });
  return out;
}

function getSession() {
  const c = collectCandidates();
  const selected = c[0]?.session || null;
  if (valid(selected)) mirrorSession(selected);
  return selected;
}

function mirrorSession(s) {
  if (!valid(s)) return s;
  const raw = JSON.stringify(s);
  try {
    localStorage.setItem(PRIMARY, raw);
    // Compatibility mirror only. V14 NEVER reads this before PRIMARY.
    localStorage.setItem('pmv_session_v2', raw);
  } catch (_) {}
  return s;
}

function saveSession(s) {
  if (!valid(s)) throw Error('Invalid login session returned by server.');
  // Remove all stale session records BEFORE writing the new primary session.
  clearSession(false);
  mirrorSession(s);
  try { sessionStorage.setItem(PRIMARY, JSON.stringify(s)); } catch (_) {}
  try { sessionStorage.setItem('pmv_session_v2', JSON.stringify(s)); } catch (_) {}
  window.dispatchEvent(new CustomEvent('pmv-session-ready', { detail: s }));
  return s;
}

function removeToken(token) {
  if (!token) return;
  for (const storage of [window.localStorage, window.sessionStorage]) {
    try {
      for (let i = storage.length - 1; i >= 0; i--) {
        const key = storage.key(i);
        if (!key) continue;
        const s = parseStored(storage.getItem(key));
        if (valid(s) && String(s.token) === String(token)) storage.removeItem(key);
      }
    } catch (_) {}
  }
}

function clearSession(dispatch = true) {
  for (const k of ALL_KEYS) {
    try { localStorage.removeItem(k); } catch (_) {}
    try { sessionStorage.removeItem(k); } catch (_) {}
  }
  if (dispatch) {
    try { window.dispatchEvent(new Event('pmv-session-cleared')); } catch (_) {}
  }
}

function endpoint() {
  const u = String((window.APP_CONFIG && APP_CONFIG.API_URL) || '').trim();
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/i.test(u)) {
    throw Error('Invalid Apps Script /exec URL in js/config.js.');
  }
  return u;
}

function isInvalidSessionMessage(msg) {
  return /invalid session|session expired|session not found/i.test(String(msg || ''));
}

async function doRequest(action, params, session) {
  const q = new URLSearchParams({ action });
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null) {
      q.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    }
  });
  if (session) q.set('session', JSON.stringify(session));

  const c = new AbortController();
  const timer = setTimeout(() => c.abort(), TIMEOUT);
  let res, text;
  try {
    res = await fetch(endpoint() + '?' + q.toString(), {
      method: 'GET',
      redirect: 'follow',
      cache: 'no-store',
      credentials: 'omit',
      signal: c.signal
    });
    text = await res.text();
  } catch (e) {
    throw Error(
      e.name === 'AbortError'
        ? 'Failed to fetch: Apps Script request timed out.'
        : 'Failed to fetch: browser could not reach the Apps Script /exec Web App. Verify deployment access and URL.'
    );
  } finally {
    clearTimeout(timer);
  }

  let j;
  try {
    j = JSON.parse(text);
  } catch (_) {
    throw Error(`Failed to fetch: backend returned non-JSON HTTP ${res.status}. Open the /exec URL directly to test deployment.`);
  }

  if (!j.success) {
    const msg = String(j.error || 'Request failed.');
    const err = new Error(msg);
    err.sessionInvalid = isInvalidSessionMessage(msg);
    throw err;
  }
  return j.data ?? {};
}

async function request(action, params = {}) {
  let candidates = action === 'login' ? [] : collectCandidates();
  if (action !== 'login' && !candidates.length) {
    throw Error('Not authenticated. Please sign in again.');
  }

  // Try the best candidate first. If the server rejects it as invalid,
  // try one or more other stored candidates before forcing a logout.
  const attempts = action === 'login' ? [null] : candidates.slice(0, 4).map(x => x.session);
  let lastError = null;

  for (let i = 0; i < attempts.length; i++) {
    const s = attempts[i];
    try {
      const data = await doRequest(action, params, s);
      if (s) mirrorSession(s);
      return data;
    } catch (e) {
      lastError = e;
      if (!e.sessionInvalid || i === attempts.length - 1) break;
      // Remove only the rejected token, preserving other possible sessions.
      removeToken(s?.token);
    }
  }

  if (lastError?.sessionInvalid) {
    clearSession();
    try { window.dispatchEvent(new CustomEvent('pmv-session-expired', { detail: { message: 'Session expired or invalid. Please sign in again.' } })); } catch (_) {}
  }
  throw lastError || Error('Request failed.');
}


function todayIndia() {
  // Return YYYY-MM-DD using Asia/Kolkata, without depending on the
  // device's local timezone.
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const get = t => parts.find(p => p.type === t)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

window.PMVApi = {
  getSession,
  todayIndia,
  saveSession,
  clearSession,
  login: async (userId, mobile) => saveSession(await request('login', { userId, mobile })),
  logout: async () => {
    try { return await request('logout'); }
    finally { clearSession(); }
  },
  opening: d => request('getPmvOpeningBalance', { date: d }),
  own: d => request('getOwnPmvDashboard', { date: d }),
  admin: d => request('getAdminPmvDashboard', { date: d }),
  submit: r => request('submitPmvReport', { record: r }),
  articles: (d, q) => request('getSpmArticles', { date: d, search: q || '', limit: 10000 }),
  adminArticles: (d, q) => request('getAdminArticleStatus', { date: d, search: q || '', limit: 10000 }),
  updateArticleStatus: r => request('updateArticleStatus', { record: r }),
  updateArticleMaster: r => request('updateArticleMaster', { record: r }),
  pushArticleStatusToMaster: r => request('pushArticleStatusToMaster', { record: r }),
  diagnoseMaster: () => request('diagnoseArticleMaster'),
  diagnoseStatus: d => request('diagnoseArticleStatus', { date: d }),
  diagnosePinAccess: () => request('diagnosePinAccess')
};

setTimeout(() => getSession(), 0);
})();

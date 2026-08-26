(() => {
  'use strict';

  const SESSION_KEY = 'pmv_session_v3';
  const TIMEOUT = 30000;

  function getSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
    catch (e) { localStorage.removeItem(SESSION_KEY); return null; }
  }

  function saveSession(session) {
    if (!session || !session.token || !session.userId) {
      throw new Error('Invalid login session returned by server.');
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem('pmv_session_v2');
  }

  function todayIndia() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: APP_CONFIG.TIME_ZONE || 'Asia/Kolkata',
      year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const o = {};
    parts.forEach(p => o[p.type] = p.value);
    return `${o.year}-${o.month}-${o.day}`;
  }

  function apiUrl() {
    const url = String(APP_CONFIG.API_URL || '').trim();
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/i.test(url)) {
      throw new Error('Invalid Apps Script API URL. Use the deployed Web App /exec URL.');
    }
    return url;
  }

  async function request(action, params = {}) {
    const q = new URLSearchParams();
    q.set('action', action);

    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      q.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
    });

    const session = getSession();
    if (session) q.set('session', JSON.stringify(session));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT);

    let response;
    try {
      response = await fetch(`${apiUrl()}?${q.toString()}`, {
        method: 'GET',
        redirect: 'follow',
        cache: 'no-store',
        credentials: 'omit',
        signal: controller.signal
      });
    } catch (e) {
      if (e.name === 'AbortError') {
        throw new Error('Failed to fetch: Apps Script request timed out.');
      }
      throw new Error(
        'Failed to fetch: browser could not reach the Apps Script Web App. ' +
        'Verify the /exec URL and Web App access setting.'
      );
    } finally {
      clearTimeout(timer);
    }

    const text = await response.text();
    let result;
    try {
      result = JSON.parse(text);
    } catch (e) {
      throw new Error(
        `Failed to fetch: Apps Script returned non-JSON HTTP ${response.status}. ` +
        'Open the /exec URL directly and verify the deployment.'
      );
    }

    if (!result.success) {
      const message = result.error || result.message || `Request failed (HTTP ${response.status}).`;
      if (/not authenticated|session expired|invalid session|account is inactive|sign in again/i.test(message)) {
        clearSession();
        window.dispatchEvent(new CustomEvent('pmv-session-expired', {detail: {message}}));
      }
      throw new Error(message);
    }

    return result.data ?? {};
  }

  async function bulkUpdateArticleStatus({date, articleKeys, status, remarksByKey = {}}) {
    const keys = [...new Set((articleKeys || []).map(String).map(x => x.trim()).filter(Boolean))];
    if (!keys.length) throw new Error('Select at least one article.');

    const results = [];
    for (const articleKey of keys) {
      results.push(await request('updateArticleStatus', {
        record: {
          date,
          articleKey,
          status,
          remarks: remarksByKey[articleKey] || ''
        }
      }));
    }
    return {updated: results.length, results};
  }

  async function pushArticleStatusToMaster({date, articleKeys}) {
    const keys = [...new Set((articleKeys || []).map(String).map(x => x.trim()).filter(Boolean))];
    if (!keys.length) throw new Error('Select at least one article.');

    let pushed = 0;
    let skipped = 0;

    for (const articleKey of keys) {
      const x = await request('pushArticleStatusToMaster', {
        record: {date, articleKeys: [articleKey]}
      });
      pushed += Number(x.pushed || 0);
      skipped += Number(x.skipped || 0);
    }
    return {pushed, skipped};
  }

  window.PMVApi = {
    getSession,
    saveSession,
    clearSession,
    todayIndia,
    login: (userId, mobile) => request('login', {userId, mobile}),
    logout: () => request('logout'),
    opening: date => request('getPmvOpeningBalance', {date}),
    own: date => request('getOwnPmvDashboard', {date}),
    admin: date => request('getAdminPmvDashboard', {date}),
    submit: record => request('submitPmvReport', {record}),
    articles: (date, query) => request('getSpmArticles', {date, q: query || '', limit: 10000}),
    updateArticleStatus: record => request('updateArticleStatus', {record}),
    bulkUpdateArticleStatus,
    adminArticles: (date, query) => request('getAdminArticleStatus', {date, q: query || '', limit: 10000}),
    pushArticleStatusToMaster,
    updateArticleMaster: record => request('updateArticleMaster', {record})
  };
})();

(() => {
  const SESSION_KEY = 'pmv_session_v2';
  const TIMEOUT = 20000;

  function getSession() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    } catch (e) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
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
  }

  function todayIndia() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: APP_CONFIG.TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(new Date());

    const o = {};
    parts.forEach(p => o[p.type] = p.value);

    return `${o.year}-${o.month}-${o.day}`;
  }

  function validateApiUrl() {
    const url = String(APP_CONFIG.API_URL || '').trim();

    if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/i.test(url)) {
      throw new Error(
        'Invalid Apps Script API URL. Use the deployed Web App /exec URL.'
      );
    }

    return url;
  }

  function isAuthError(message) {
    return /not authenticated|session expired|invalid session|account is inactive|sign in again|log in again/i
      .test(String(message || ''));
  }

  async function requestWithTimeout(url, options = {}) {
    const controller = new AbortController();

    const timer = setTimeout(() => {
      controller.abort();
    }, TIMEOUT);

    try {
      return await fetch(url, {
        ...options,
        signal: controller.signal,
        redirect: 'follow',
        cache: 'no-store',
        credentials: 'omit'
      });
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error(
          'Apps Script request timed out. Check the Web App deployment and internet connection.'
        );
      }

      throw new Error(
        'Failed to fetch Apps Script. Check that the Web App is deployed as /exec with access set to Anyone.'
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async function parseResponse(response) {
    const text = await response.text();

    let result;

    try {
      result = JSON.parse(text);
    } catch (e) {
      throw new Error(
        `Apps Script returned a non-JSON response (HTTP ${response.status}). ` +
        `Check the Web App /exec deployment.`
      );
    }

    if (!result.success) {
      const message =
        result.error ||
        result.message ||
        `Request failed (HTTP ${response.status}).`;

      if (isAuthError(message)) {
        clearSession();

        window.dispatchEvent(
          new CustomEvent('pmv-session-expired', {
            detail: { message }
          })
        );
      }

      throw new Error(message);
    }

    return result.data ?? {};
  }

  async function request(method, action, params = {}) {
    const apiUrl = validateApiUrl();
    const session = getSession();

    if (method === 'GET') {
      const query = new URLSearchParams();

      query.set('action', action);

      Object.entries(params).forEach(([key, value]) => {
        if (value === undefined || value === null) return;

        query.set(
          key,
          typeof value === 'object'
            ? JSON.stringify(value)
            : String(value)
        );
      });

      if (session) {
        query.set('session', JSON.stringify(session));
      }

      const response = await requestWithTimeout(
        `${apiUrl}?${query.toString()}`,
        {
          method: 'GET'
        }
      );

      return parseResponse(response);
    }

    const payload = {
      action,
      ...params,
      session: session || undefined
    };

    const response = await requestWithTimeout(
      apiUrl,
      {
        method: 'POST',

        /*
         * text/plain avoids an OPTIONS/CORS preflight.
         * Apps Script can parse this body normally.
         */
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },

        body: JSON.stringify(payload)
      }
    );

    return parseResponse(response);
  }

  window.PMVApi = {

    getSession,

    saveSession,

    clearSession,

    todayIndia,

    /*
     * IMPORTANT:
     * Code.gs supports GET login specifically to avoid
     * browser CORS/preflight problems.
     */
    login: (userId, mobile) =>
      request('GET', 'login', {
        userId,
        mobile
      }),

    logout: () =>
      request('POST', 'logout'),

    opening: date =>
      request('GET', 'getPmvOpeningBalance', {
        date
      }),

    own: date =>
      request('GET', 'getOwnPmvDashboard', {
        date
      }),

    admin: date =>
      request('GET', 'getAdminPmvDashboard', {
        date
      }),

    submit: record =>
      request('POST', 'submitPmvReport', {
        record
      }),

    /*
     * Article master/search
     */
    articles: (date, query) =>
      request('GET', 'getSpmArticles', {
        date,
        q: query || '',
        limit: 10000
      }),

    /*
     * SPM/DPS article status update
     */
    updateArticleStatus: record =>
      request('POST', 'updateArticleStatus', {
        record
      }),

    /*
     * Admin article-status verification
     */
    adminArticles: (date, query) =>
      request('GET', 'getAdminArticleStatus', {
        date,
        q: query || '',
        limit: 10000
      }),

    /*
     * Admin pushes approved SPM changes
     * into ARTICLE_MASTER.
     */
    pushArticleStatusToMaster: record =>
      request('POST', 'pushArticleStatusToMaster', {
        record
      }),

    /*
     * Direct admin master-file update.
     */
    updateArticleMaster: record =>
      request('POST', 'updateArticleMaster', {
        record
      })
  };
})();

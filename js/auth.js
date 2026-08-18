/* PMV Toolkit Tracker v6.1 - session manager */
window.Auth = (() => {
  "use strict";
  const KEY = "pmv_session_v6";
  function getSession() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || !s.token || !s.userId) { localStorage.removeItem(KEY); return null; }
      if (s.expiresAt && new Date(s.expiresAt).getTime() <= Date.now()) {
        localStorage.removeItem(KEY); return null;
      }
      return s;
    } catch (_) { localStorage.removeItem(KEY); return null; }
  }
  function setSession(s) {
    if (!s || !s.token || !s.userId) throw new Error("Invalid login session returned by server.");
    localStorage.setItem(KEY, JSON.stringify(s));
    return s;
  }
  function clear() { localStorage.removeItem(KEY); }
  return {getSession, setSession, clear, isLoggedIn:()=>!!getSession()};
})();
window.PMVAuth = window.Auth;

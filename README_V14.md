PMV Toolkit Tracker V14 — Session Selection Fix

Purpose
-------
Fixes the V13 authentication problem where a stale pmv_session_v2 token
could be selected before the newer pmv_session_v3 token.

Files to replace in GitHub
--------------------------
js/api.js
js/article-dashboard.js
js/auth.js
js/app.js
service-worker.js   (root service-worker.js if that is the registered worker)

Notes
-----
- V14 always prefers pmv_session_v3.
- If the server rejects that token as invalid, V14 tries other stored session
  candidates before clearing the session.
- Successful login clears stale session records before writing the new session.
- The service worker cache is bumped to V14.
- Application JS/config are fetched network-first/no-store to prevent mixed
  versions.
- article-dashboard.js exposes both ArticleDashboard and PMVArticles because
  app.js calls PMVArticles.

Apps Script
-----------
No Code.gs change is required for the session-selection fix itself.
The existing backend must still be deployed as a Web App:
Execute as: Me
Who has access: Anyone

Deployment
----------
1. Replace the listed files in the GitHub repository.
2. Commit/push and wait for GitHub Pages.
3. Close the old site tab completely.
4. Reopen the site.
5. Sign in once.
6. Test FETCH ALL.

Diagnostic
----------
ARTICLE_ACCESS_DIAGNOSTIC_V14.html can be opened locally to inspect stored
session metadata without printing the actual token.


V14.1 HOTFIX — PMVApi.todayIndia
--------------------------------
The existing spm-dashboard.js calls PMVApi.todayIndia(). V14 did not expose
that helper, causing: "PMVApi.todayIndia is not a function".

V14.1 adds PMVApi.todayIndia(), returning the current date in Asia/Kolkata
as YYYY-MM-DD. No Apps Script/API call is needed for this helper.

Replace js/api.js with the V14.1 file. Keep the other V14 files together.

PMV Proje V14.2 — ADMIN ARTICLE STATUS SYNC FIX

Purpose
-------
Fixes the case where an SPM changes an article in ARTICLE_STATUS but the Admin
dashboard does not show the SPM update.

Backend changes
---------------
1. ARTICLE_STATUS matching now uses multiple identifiers:
   ARTICLE_KEY, barcode/article number, PMV application number, tracking number.
2. Numeric variants are also matched, preventing formatting differences from
   breaking the overlay.
3. Latest matching status row is selected using UPDATED_AT/date and row order.
4. Admin diagnostics now report matchedStatusRows.
5. A diagnoseArticleSync endpoint is included.
6. Admin rows expose statusSource, updatedBy and updatedAt.
7. Authorisation/push continues to update ARTICLE_MASTER and marks the status
   row AUTHORISED.

Files to replace
----------------
Code.gs
js/api.js
js/article-dashboard.js
js/app.js
js/auth.js
service-worker.js

Deployment
----------
A) Google Apps Script:
   Replace Code.gs in the Apps Script project and save.
   Deploy > Manage deployments > Edit the web app deployment.
   Create a new version and deploy.
   Keep access settings the same as your existing working deployment.

B) GitHub Pages:
   Replace the listed JS/service-worker files.
   Commit and push.
   Hard-refresh the site or clear the site cache.

C) Test:
   1. Log in as SPM.
   2. Fetch an article.
   3. Change its Present Status and save.
   4. Log in as Admin.
   5. Select the same date.
   6. Search by barcode, PMV application number or artisan.
   7. Admin should show:
      Present = ARTICLE_STATUS value
      Master = ARTICLE_MASTER value
      Review = PENDING_REVIEW
      Updated By = SPM user
      Updated At = SPM timestamp
      Source = ARTICLE_STATUS
   8. Click AUTHORISE PUSH SELECTED.
   9. Master should then equal Present and Review should become AUTHORISED.

Important
---------
The Admin page must use the same deployed Apps Script web-app URL as the SPM
page. If Code.gs is updated but the deployment version is not updated, the
old backend will continue to be served.

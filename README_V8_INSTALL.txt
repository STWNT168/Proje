# PMV Proje V8 - Article Master / Failed Fetch Fix

Replace in the web project:
- js/api.js
- js/article-dashboard.js

Replace the Apps Script backend with:
- Code.gs

Optional diagnostic:
- ARTICLE_DIAGNOSTIC.html

## Apps Script
1. Open the Apps Script project attached to the configured spreadsheet.
2. Replace Code.gs with the supplied V8 Code.gs.
3. Run `setupPMVSheets()` once.
4. Run `testArticleMaster()` once. It must report totalArticles > 0.
5. Run `testArticleStatus()` once.
6. Deploy a NEW Web App deployment, Execute as owner, grant intended access.
7. Put the new /exec URL in js/config.js.
8. Clear browser/PWA cache and sign in again.

## Article Master requirements
The backend dynamically detects common variants of:
- barcode/article number
- PMV application number
- artisan name
- mobile
- address
- PIN/Pincode
- circle/division
- delivery staff
- present status

SPM visibility is restricted to assigned PINs. Assigned PINs are read first from USER_MASTER and, if empty, from OFFICE_MASTER. An SPM with no configured PINs is deliberately blocked rather than exposing the entire master.

## Diagnostics
The diagnostic endpoint reports:
- ARTICLE_MASTER row count
- detected headers
- assigned PINs
- matching PIN rows
- missing PIN rows
- missing article-key rows
- ARTICLE_STATUS row count and date-specific entries

## Failed fetch
The API uses GET for reads and writes to avoid Apps Script POST redirect/preflight failures. Bulk status changes are sent one article at a time for reliable error reporting.

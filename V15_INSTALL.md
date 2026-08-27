# PMV Toolkit Tracker V15 — corrected replacement bundle

Based on the current STWNT168/Proje V14 structure.

## Files to replace

1. `ZZZ_V15_ArticleStatusFixes.gs`
   - Add this file to the same Google Apps Script project as `Code.gs`.
   - Keep it as a separate `.gs` file.
   - It overrides the article-status functions used by the existing HTTP routes.

2. `js/api.js`
   - Replace the repository's `js/api.js`.
   - This guarantees `PMVApi.todayIndia()` exists and adds deterministic session recovery.

3. `service-worker.js`
   - Replace the repository root `service-worker.js`.
   - V15 cache name forces old V14 cached application assets to be discarded.

## Important deployment step

After adding/replacing the Apps Script file:

Google Apps Script → Deploy → Manage deployments → Edit the Web app deployment → New version → Deploy.

Do NOT only save the script. The web app URL must point to the new deployment version.

## Browser step

After GitHub Pages updates:
- close the old PMV page;
- open the site again;
- sign in again;
- if an old page remains, use browser site settings → clear stored data for the site, then reopen.

## What V15 fixes

- `The parameters (number,number,number,null) don't match ... Sheet.getRange`
- `Article not found in ARTICLE_MASTER` caused by identifier-format differences
- SPM status written to `ARTICLE_STATUS`
- Admin/DPS reads the latest SPM status from `ARTICLE_STATUS`
- Admin/DPS authorization pushes the status to `ARTICLE_MASTER`
- `PMVApi.todayIndia is not a function`
- stale V14 session/cache problems

## Diagnostic

After deployment, Apps Script editor can run:

`diagnoseV15Article_('MS009608650IN')`

or another exact barcode/PMV/article identifier. It returns whether the article is found in `ARTICLE_MASTER`, its row number, and its current `ARTICLE_STATUS` row.

The ZIP contains the V15 replacement files; the unchanged repository files remain as they are in STWNT168/Proje.

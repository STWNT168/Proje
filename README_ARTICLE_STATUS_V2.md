# PMV Toolkit Tracker — Article Status V2 Patch

This patch implements:

- Artisan/article-wise search across all returned fields.
- All articles for the SPM's assigned PIN codes, with total count.
- Present-status filters: Pending, Delivered, Redirected, Return, Torn/Without Address, Invalid OTP.
- Bulk SPM status changes for selected articles.
- ARTICLE_STATUS as the source of present status.
- Admin/DPS review of SPM changes before master synchronisation.
- Admin/DPS buttons for selected or filtered master push.
- ARTICLE_MASTER is changed only by authorised Admin/DPS actions.
- Audit entries for SPM updates and master pushes.
- Duplicate `theme-color` HTML metadata removed.
- Article UI moved into a dedicated CSS file.

## Installation

1. Keep the existing `Code.gs` unchanged so the existing PMV reporting/dashboard functions remain intact.
2. Add `ZZZ_ArticleStatusEngine.gs` to the same Google Apps Script project.
3. Deploy/redeploy the Apps Script Web App.
4. Replace the repository `index.html`, `js/api.js`, and `js/article-dashboard.js` with the files in this patch.
5. Add `css/article-status-v2.css` and ensure `index.html` includes it.
6. Keep the existing `ARTICLE_MASTER` and `ARTICLE_STATUS` headers. `ARTICLE_STATUS` should contain:
   `DATE, ARTICLE_KEY, BAR_CODE_ID, PMV_APPLICATION_NUMBER, OFFICE_ID, OFFICE_NAME, SPM_ID, SPM_NAME, STATUS, REMARKS, UPDATED_AT`
7. `ARTICLE_MASTER` should contain `TOOLKIT_DELIVERY_STATUS` and the article identity/address/PIN fields used by the existing project.
8. Run the existing `setupSpreadsheet()` once if the spreadsheet has not already been initialised.
9. Redeploy after any Apps Script change.

## Important

The new engine deliberately does not overwrite the master when an SPM changes a status. The SPM writes to `ARTICLE_STATUS`; an authorised ADMIN/DPS must review and explicitly push selected entries to `ARTICLE_MASTER`.

The Apps Script integration available in this session did not permit direct repository writes, so this ZIP is a ready-to-apply project patch rather than an automatic commit.

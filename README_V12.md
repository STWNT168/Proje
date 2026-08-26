# PMV Proje V12 — Corrected Complete Version

## Root cause fixed
The uploaded Code.gs contained an incomplete V9 `readArticleMasterV9_()` block. It ended at `diagnostics:{` and then immediately started `findUser_()`, which corrupts the Apps Script source. That V9 block has been removed.

The PIN resolver is also corrected. It now searches USER_MASTER and OFFICE_MASTER for any header containing PIN/POSTAL_CODE/ZIP and matches office name/code flexibly.

## Install
1. Replace the Apps Script `Code.gs` with the V12 `Code.gs` in this ZIP. Do not add the old V9 block again.
2. Deploy a NEW Web App version: Execute as Me; access Anyone.
3. Replace frontend `js/api.js` and `js/article-dashboard.js`.
4. Update `js/config.js` with the current Apps Script `/exec` URL.
5. Replace service-worker.js and publish GitHub Pages.
6. Sign out, clear/reload the site, then sign in again.

## Test
Open the Apps Script `/exec` URL alone. It should return JSON with `version: V12 Corrected PIN + Article Master Fix`.
Then run `diagnosePinAccess` from the diagnostic page. For SPM 10203232 / Batote SO it should show effective PINs.

The Article Master field resolver supports the actual headers such as Bar Code ID, PMV Application Number, Artisan Name, Artisan Current Address, Artisan Pin Code and Toolkit Delivery Status.

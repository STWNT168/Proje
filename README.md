# PMV Toolkit Tracker — Corrected Upload Package

## What is fixed
- Correct root paths for GitHub Pages (`css/styles.css` and `js/*.js`).
- One consistent browser session key: `pmv_session`.
- Login handler is defined in `app.js`; no dependency on a missing `msg()` function.
- SPM opening balance comes from the **latest previous report's closing balance**.
- Delivered Kits Today and Delivered Articles Today are included in the SPM form and Admin dashboard.
- Redirected, RTS/Returned, Delivered and exception categories are all included in validation.
- Admin date selector loads the exact selected date, not the previous day.
- Admin office-wise report and pending-SPM list are populated from the selected date.
- Mobile-friendly professional dashboard.

## Stock validation
For kits:
`Opening Kits + New Kits - Redirected Kits - RTS Kits - Delivered Kits = Invalid Mobile Kits + Torn/Without Proper Details Kits + Deliverable Kits + Incomplete Kits`

The same formula is applied to articles.

The previous day's **closing pending balance becomes the next day's opening balance**.

## Apps Script
The included `Code.gs` uses:
- Spreadsheet ID: `1vEjY1z-147b38XTWV7vRm_9pjXVMfJmjdQtrKRkkLy8`
- API endpoint configured in `js/config.js`

### First-time setup
1. Open the Apps Script project connected to the supplied deployment.
2. Replace its `Code.gs` with the included `Code.gs`.
3. Run `setupSpreadsheet()` once and authorize it.
4. Deploy/redeploy as a Web App:
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Keep the deployment URL exactly the same as the URL in `js/config.js`.

### Spreadsheet masters
`USER_MASTER` must contain:
`USER_ID, NAME, MOBILE, ROLE, OFFICE_ID, OFFICE_NAME, ACTIVE`

`OFFICE_MASTER` must contain:
`OFFICE_ID, OFFICE_NAME, DIVISION, ACTIVE`

For login, MOBILE must match the registered mobile number exactly after trimming spaces.

## GitHub Pages upload
Upload the contents of this ZIP to the repository root. The repository root must contain:
- `index.html`
- `css/styles.css`
- `js/...`
- `Code.gs` (for reference/deployment; GitHub Pages does not execute it)

Do not put the only copy of `index.html` inside `js/`.

## Important
If the Apps Script deployment is not redeployed after changing `Code.gs`, GitHub Pages will still call the old backend.

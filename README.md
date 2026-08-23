# PMV Toolkit Tracker v2

Built from the repository's calculations.js movement model, with corrected credential validation, sessions, previous-closing-to-next-opening logic, full movement/category validation, delivered-today totals, and responsive Admin/DPS dashboard.

Spreadsheet ID: 1vEjY1z-147b38XTWV7vRm_9pjXVMfJmjdQtrKRkkLy8

Apps Script Web App: https://script.google.com/macros/s/AKfycbz99tuShcZP2e4cPYKObZU0SGbckHL6uw68wRfZCwmRO9xAQuPNpinC0LisHvEDWxxC/exec

Setup: replace Code.gs in Apps Script, run setupSpreadsheet() once, deploy as Web App, then upload this project to GitHub Pages.

Validation: Closing = Opening + New - Redirected - RTS/Returned - Delivered. Closing must equal Invalid Mobile + Torn/Without Proper Details + Deliverable + Incomplete. Previous date closing becomes next date opening for the same office.


## V5 Article-wise Status Tracking

1. Run `setupSpreadsheet()` in Apps Script. It creates `PINCODE_MASTER`, `ARTICLE_MASTER`, and `ARTICLE_STATUS` and adds `PINCODES` to `OFFICE_MASTER`.
2. Import `ARTICLE_MASTER_IMPORT.csv` into the `ARTICLE_MASTER` sheet, keeping the exact header row.
3. Import `PINCODE_MASTER_TEMPLATE.csv` into `PINCODE_MASTER`, then fill `OFFICE_ID` and `OFFICE_NAME` for each PIN code. Set `ACTIVE` to TRUE.
4. SPMs can search/fetch only articles whose PIN code is assigned to their own `OFFICE_ID`.
5. SPMs can update one present status per article per day, with remarks.
6. Admin/DPS can search and view article-wise status, SPM, office, PIN code and update time.
7. Redeploy the Apps Script Web App after updating `Code.gs`, then update `API_URL` in `js/config.js` if the deployment URL changes.

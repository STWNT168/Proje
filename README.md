# PMV Toolkit Tracker v6.0.0

## Core balance logic

For both kits and tool-kit articles:

**Closing Pending = Opening Balance + New Received/Taken - Redirected - RTS/Returned - Delivered Today**

The five current-status fields must exactly equal Closing Pending:

**Invalid Mobile + Torn/Damaged + Without Proper Details/Address + Deliverable + Incomplete Sets = Closing Pending**

The previous date's closing pending becomes the next date's opening balance. If there is no previous report, the value comes from `OFFICE_MASTER` columns `INITIAL_OPENING_KITS` and `INITIAL_OPENING_ARTICLES`.

## Included fields

- Opening balance
- New kits/articles received or taken today
- Redirected kits/articles
- RTS/Returned kits/articles
- Kits/articles delivered today
- Invalid mobile
- Torn/damaged
- Without proper article details/address
- Deliverable
- Incomplete sets
- Closing pending
- SPM and Admin/DPS dashboards

## Setup

1. Open the Apps Script project connected to the target spreadsheet.
2. Replace its `Code.gs` with the `Code.gs` in this ZIP.
3. Run `setupSpreadsheet()` once and authorize it.
4. Populate `OFFICE_MASTER` and `USER_MASTER`.
5. In `OFFICE_MASTER`, use:
   `OFFICE_ID | OFFICE_NAME | DIVISION | ACTIVE | INITIAL_OPENING_KITS | INITIAL_OPENING_ARTICLES`
6. In `USER_MASTER`, use:
   `USER_ID | NAME | MOBILE | ROLE | OFFICE_ID | OFFICE_NAME | ACTIVE`
7. Deploy Apps Script as a Web App and use the deployment URL in `js/config.js`.
8. Upload the frontend folder to GitHub Pages or another static host.

## Important

The supplied deployment URL is already placed in `js/config.js` and `Code.gs`. If a new Apps Script deployment URL is generated, update `js/config.js`.

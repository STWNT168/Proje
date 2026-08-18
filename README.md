# PMV Toolkit Tracker v6.1

This package fixes the `Auth is not defined` login error by including `js/auth.js`.

Backend:
- Google Spreadsheet ID: `1vEjY1z-147b38XTWV7vRm_9pjXVMfJmjdQtrKRkkLy8`
- Apps Script API is configured in `js/config.js`.

Balance rule:
Closing Pending = Opening Balance + New Received/Taken - Redirected - RTS/Returned - Delivered.

The five pending categories must exactly equal Closing Pending:
Invalid Mobile + Torn/Damaged + Without Address/Details + Deliverable + Incomplete.

The previous day's closing pending becomes the next day's opening balance.

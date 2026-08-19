# PMV Toolkit Tracker v2

Built from the repository's calculations.js movement model, with corrected credential validation, sessions, previous-closing-to-next-opening logic, full movement/category validation, delivered-today totals, and responsive Admin/DPS dashboard.

Spreadsheet ID: 1vEjY1z-147b38XTWV7vRm_9pjXVMfJmjdQtrKRkkLy8

Apps Script Web App: https://script.google.com/macros/s/AKfycbz99tuShcZP2e4cPYKObZU0SGbckHL6uw68wRfZCwmRO9xAQuPNpinC0LisHvEDWxxC/exec

Setup: replace Code.gs in Apps Script, run setupSpreadsheet() once, deploy as Web App, then upload this project to GitHub Pages.

Validation: Closing = Opening + New - Redirected - RTS/Returned - Delivered. Closing must equal Invalid Mobile + Torn/Without Proper Details + Deliverable + Incomplete. Previous date closing becomes next date opening for the same office.

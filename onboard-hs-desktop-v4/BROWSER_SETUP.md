# Browser-only Onboard H&S Dashboard

No Node.js, PowerShell scripts, installer or Cloudflare is required.

## Launch

1. In GitHub Desktop, click **Fetch origin**, then **Pull origin** if shown.
2. Select **Show in Explorer**, open `onboard-hs-desktop-v4` and double-click `OPEN_BROWSER_DASHBOARD.bat`, or open `app/index.html` directly in Microsoft Edge.
3. Keep using the **same browser profile** and **same file path**. Do not use InPrivate mode.

## Preserve your existing work

1. In the installed EXE, **Export backup** and store the JSON securely.
2. In the browser dashboard, choose **Import backup** exactly once, and verify each register and attachment.
3. Continue using **Export backup** regularly and keep the original EXE until everything has been verified.

## Updating without installers

When John pushes code to GitHub, fetch/pull in GitHub Desktop, then reopen or refresh your local HTML dashboard. You do not need Node.js, PowerShell or a new EXE.

## Important limitations

The browser version uses **IndexedDB**, which belongs to that browser profile and local file origin. Browser-data clearing, profile changes, file moves and browser privacy settings may cause records to become inaccessible. The records **are not committed or uploaded to GitHub**. The save API is asynchronous under the hood; allow time for large attachments to finish saving and export backups after significant changes.

This is a practical single-PC version, not a managed system of record. For business-critical H&S records, keep separately backed-up originals of signed documents and training sheets. If your organisation requires a controlled document repository or audited access, this lightweight browser version isn't a substitute.

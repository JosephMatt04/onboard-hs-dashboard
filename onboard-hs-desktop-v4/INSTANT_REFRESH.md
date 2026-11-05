# Refresh dashboard without installing a new Windows application

From desktop version **4.13.0**, the top bar includes **Refresh dashboard**.

- The app uses the user's existing authenticated GitHub CLI to fetch the latest `app/index.html` from `main`.
- It validates the interface structure and stores a private copy under the current Windows user data folder, separate from records.
- It reloads the dashboard using the existing Electron window, preload and local storage. There is no installer for compatible HTML/CSS/inline-JavaScript updates.
- Videos and other packaged assets must already exist in the installed app. New native APIs, preload modifications, new bundled files, dependency changes or Electron security updates **still require an approved Windows installer**.
- If GitHub is unavailable, the existing cached interface remains usable offline. If the new interface is broken, **Ctrl+Shift+Alt+B** returns to the bundled copy (or use Backup & Updates → Restore bundled dashboard).
- The normal **Check GitHub for updates** control is retained for on-demand full desktop/runtime releases. It no longer automatically prompts for installers just because the UI has changed.
- H&S records and attachments are never uploaded to GitHub by this mechanism. The refreshed HTML is application code running with the same narrow storage bridge as the installed UI; only use it with a trusted repository and reviewed commits.
- You need **one final installer** to install the refresh-capable Electron shell in v4.13.0; after that, routine interface changes can be picked up by clicking Refresh dashboard.

Do not place employee data or confidential site records in GitHub. Do not use unreviewed external HTML or scripts as a UI update source.

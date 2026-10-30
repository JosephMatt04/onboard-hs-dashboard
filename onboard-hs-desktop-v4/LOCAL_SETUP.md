# Local no-installer dashboard (Windows)

1. In your existing EXE, choose **Export backup** to save your actual employee and H&S records. Do this before switching.
2. Install IT-approved Node.js LTS, Git for Windows, and GitHub Desktop. Clone private GitHub repo `JosephMatt04/onboard-hs-dashboard` via GitHub Desktop, not a ZIP.
3. Double-click `onboard-hs-desktop-v4/OPEN_LOCAL_DASHBOARD.bat`. Browser opens at `http://127.0.0.1:38471/`. Keep the terminal window running.
4. In the browser version select **Import backup** and pick the exported EXE backup. Import replaces all current data in the local browser dashboard. Check records, attached files and signatures before uninstalling the old app.
5. Subsequently close the dashboard console window and double-click **UPDATE_AND_OPEN.bat** to fetch changes from GitHub and launch. No EXE reinstall.

Records are written to `%LOCALAPPDATA%\Onboard-HS-Local\records.json` outside GitHub and never uploaded to the repository. One previous backup copy is retained automatically. Continue regular manual JSON backup exports.

The local server listens on loopback only, rejects non-local Host values, and requires a random session token for save/load requests. Do not expose or port-forward localhost port 38471. Your Windows account and disk encryption must protect employee data. GitHub Desktop sign-in is needed once for private repo access.

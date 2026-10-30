# Onboard H&S Dashboard — no-installer PowerShell version

You do **not** need Node.js, Cloudflare, or a new Windows EXE installer.

## Initial setup

1. Open your old desktop dashboard and **Export backup** to a safe location. Keep the original EXE installed until migration has been verified.
2. Clone the private repository using GitHub Desktop and fetch/pull the newest changes.
3. Open `onboard-hs-desktop-v4` and double-click `OPEN_LOCAL_DASHBOARD.bat`. This launches Windows PowerShell 5.1 and opens `http://127.0.0.1:38471/` in your browser. Leave the PowerShell window open while using the dashboard.
4. Choose **Import backup** in the browser dashboard and select your old desktop backup. Import replaces the browser dashboard's records, so only do it once, after a fresh local setup.
5. Verify your Risk Assessments, SSOWs, signatures, PPE and Training Records including attachments before uninstalling the old EXE.

## Updates after that

Close the dashboard's PowerShell console, open GitHub Desktop, click **Fetch origin** and **Pull origin** if available, then double-click `OPEN_LOCAL_DASHBOARD.bat` again. Or use `UPDATE_AND_OPEN.bat` which requires Git for Windows on PATH and automatically pulls then launches.

There is **no EXE reinstall**. Records are kept under `%LOCALAPPDATA%\Onboard-HS-Local\records.json`, outside the Git checkout. The server listens only on `127.0.0.1` and uses a random token for save/load. Never expose the local port to the network. Export backups regularly. If workplace PowerShell execution policy blocks the script, request IT approval rather than bypassing company controls.

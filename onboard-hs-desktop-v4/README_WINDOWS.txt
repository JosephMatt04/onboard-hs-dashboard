ONBOARD CORRUGATED — HEALTH & SAFETY DASHBOARD (DESKTOP V4)
=========================================================

WHAT THIS DOWNLOAD IS
A Windows Electron desktop APP PROJECT, NOT an already built installer.
It includes the V3.6 dashboard (all five registers, company logo and previews),
Electron wrapper, and local file-backed data storage.

WINDOWS FIRST-TIME SETUP (requires approval to install dependencies)
1. Extract this ZIP into a permanent folder such as Documents\Onboard-HS-Dashboard.
2. Install Node.js LTS from https://nodejs.org/ if not already installed.
   Do NOT install it if your IT department has not approved it.
3. Open the project folder in Windows File Explorer.
4. Click File Explorer's address bar, type cmd and press Enter.
5. Type: npm install
   This downloads Electron and the build tool. It requires internet access.
6. Type: npm start
   The dashboard opens in its own Windows window.

MAKE A WINDOWS INSTALLER
1. With dependencies installed, open Command Prompt in the project folder.
2. Type: npm run dist:win
3. Look inside the 'dist' folder for the installer EXE (exact name may vary).
4. Run the installer after approval from IT / your device administrator.
5. Launch Onboard H&S Dashboard from the desktop or Start menu.
6. Once installed, you DON'T need to keep opening the project ZIP or terminal.

UPDATES
1. In the running app choose Export backup and keep the JSON file somewhere safe.
2. Build and install the next version with the SAME appId and productName.
3. Installing a new version should normally retain data automatically because it
   resides under Electron's userData directory, separate from program files.
4. Check records after updating. If absent, use Import backup.
5. Automatic online updates are NOT implemented: future releases still need
   a new installer, but you won't need to replace an HTML file manually.

MIGRATING FROM YOUR CURRENT V3.6 BROWSER DASHBOARD
1. Open your old V3.6 browser dashboard.
2. On Dashboard, click Export backup. Save the JSON backup file.
3. Launch the Windows app (after setup above).
4. On the new dashboard, click Import backup, pick your old JSON file and confirm.
5. This REPLACES the fictional examples with your imported records and attachments.
   Keep an independent copy of your exported backup.

DATA STORAGE
The Windows app writes to records.json in Electron's per-user application-data
folder (typically %APPDATA%\onboard-corrugated-hs-desktop\records.json).
The current previous version is also copied to records.json.previous.json before
successful replacements. Writes use a temporary file and rename to reduce risk
from interrupted saves. All files remain on the PC. There is no login or cloud.
This is a local JSON data file, NOT an enterprise database or audit trail.
Data is NOT encrypted at rest, and anyone with access to your Windows account or
backup files may be able to read it. Do not treat it as a compliant system for
confidential medical/personnel records without IT and data-protection review.

Documents are stored as base64 within records.json, max 15 MB PER FILE and
200 MB combined across registers. Large documents increase save times and backup
sizes; for large-scale use, we should move attachments to a separate local folder.
DOCX preview is basic text; PDF/image/text preview is supported; old .DOC/.XLS
files still need their usual applications.

TESTING STATUS
JavaScript syntax and ZIP structure were tested in this environment; installing
Electron, building an EXE, running in Windows and clicking through the UI were
NOT tested here. npm install and any commands outside this project folder have
NOT been run. Before operational use, test data backup, restore and documents.

All sample records are fictional. This application is a prototype, not a certified
health and safety compliance platform. Maintain separately controlled copies of
critical documents and records.

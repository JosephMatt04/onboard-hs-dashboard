# Onboard Corrugated H&S Dashboard — Windows EXE v4.9.0

## Build and download
The Windows build runs automatically in GitHub Actions whenever the desktop folder changes:
https://github.com/JosephMatt04/onboard-hs-dashboard/actions/workflows/build-windows.yml

1. Open the link while signed into your GitHub account.
2. Select the latest **Build Onboard H&S Windows App** run, and confirm it has a green success check.
3. Scroll to **Artifacts** and download **Onboard-HS-Windows-Installer**.
4. Extract the ZIP and run the Windows installer inside. This build is unsigned, so ask IT for approval before installing on a managed work computer.

This is an installed Electron desktop program, not an .html file. The current release version is **4.9.0**.

## Move data from the browser version
The browser and EXE **do not automatically share records**.

1. In your existing browser dashboard, use **Export Backup** to save a JSON backup in an approved secure location.
2. Install and launch the EXE.
3. Use the dashboard's **Import Backup** function and select that JSON file.
4. Verify your RA, SSOW, PPE, training, incident, asset and permit records and attachments before relying on the new application.
5. Keep the browser version and original backup until verification is finished.

If you already installed an older EXE, its records in the Electron application-data folder may be loaded automatically. Importing a browser backup will **replace** those existing EXE records. Back up the old EXE records first if you need both sets.

## Automatic company OneDrive backups
Open **Backup Settings** in the EXE and choose a company/IT-approved OneDrive folder. Changes to the EXE records will save a latest and daily copy there. Confirm the OneDrive client synchronises those files; this is not a substitute for centrally administered data protection and retention.

## Permits
Use **Generate PDF** on Permit to Work records to save an A4 PDF directly. Generated PDFs do not themselves authorise work. Follow the formal site PTW procedure and approvals.

## Checks
The JavaScript source passed syntax checks. A full Windows installer build and user acceptance test must pass in GitHub Actions and on your PC before using the EXE for operational H&S records.

# Onboard H&S Dashboard — approved-users-only Windows updates (v4.9.2)

## What is automatic
- The installed application checks a selected restricted folder approximately 15 seconds after launch and every four hours while open.
- It reads `onboard-hs-update.json`, compares versions and verifies installer size and SHA256.
- It prompts once per new version; clicking **Install update** launches the installer after another verification. Choosing **Later** lets you continue working.
- Records and attachments remain in the Windows app-data folder, separate from installed program files.

## Initial setup (required once)
1. Ask IT for a *restricted* company folder that approved users can read and approved publishers can write. A company OneDrive-synced folder or managed shared drive can work, but confirm it is kept synchronised.
2. Build and install dashboard **v4.9.2** once manually; v4.9.1 cannot add its own new updater without an initial upgrade.
3. Open **Backup & Updates** in the new EXE. Choose **Choose update folder** and point it to that restricted folder.
4. Keep the backup folder separate. Export a backup before major updates.

## Publishing the next version
1. Update version in `package.json` (e.g. 4.9.3) and commit changes to the private GitHub repository.
2. Wait for **Build Onboard H&S Windows App** under GitHub Actions. Verify that its Windows build and tests pass.
3. Download the restricted Actions artifact named **Onboard-HS-Windows-Installer**, extract both the `.exe` and `onboard-hs-update.json` into the approved update folder. **Copy the EXE first, then replace the JSON manifest last.**
4. Keep files unmodified. Do not use public GitHub Releases, personal cloud links or a publicly shared folder.
5. The installed app will check the folder automatically (or users can click **Check and install update**) and request permission before running the installer.
6. Check installation and retained data on a test PC before distributing an update widely.

## Safety and limits
- All users must have read access to the **same approved location** (or synced copies). Without a configured folder the app cannot discover private updates.
- This is **folder-based checking**, not direct private-GitHub download or unattended/silent updates. Publishing each package to the restricted folder is still a controlled manual step.
- SHA256 detects accidental corruption or changes to the installer **relative to the manifest**; it does not authenticate a publisher if someone can modify both files. Restrict folder write access, and ask IT about Windows signing before wider deployment.
- An unsigned installer can show an unknown-publisher warning; do not bypass corporate security restrictions.
- The application does not synchronise employee records between PCs. Do not include employee data, backups or credentials in installer builds.
- Confirm Windows installation and an actual version-to-version update on a test computer before relying on the system.

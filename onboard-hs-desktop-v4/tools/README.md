# Automatic private-folder publishing (Windows)

The installed dashboard already checks the selected **Dashboard Updates** folder for a new `onboard-hs-update.json` (shortly after launch and then every four hours), validates installer size and SHA256, and asks users before starting the installer.

This optional setup removes the **manual copying** of the GitHub build into the company shared drive. It does **not** install updates without the user's consent.

## One-time setup on the IT-approved publisher PC

Prerequisites:

- Written approval from your IT team for an unsigned Windows installer and for a scheduled task that publishes it.
- GitHub access to the **private** `JosephMatt04/onboard-hs-dashboard` repository, with read-only access if possible.
- A fine-grained GitHub personal access token restricted to **only** `JosephMatt04/onboard-hs-dashboard`, with **Actions: read-only** and **Metadata: read-only**. It is prompted for once and saved using Windows current-user DPAPI encryption. Never paste it into chat or email.
- Read/write access to the approved `Z:\Health & Safety\Dashboard Updates` folder.
- A Windows session where the Z: drive is mapped. The publisher only runs while that Windows account is signed in, and needs VPN/company network access as applicable.

1. Download `Publish-PrivateUpdate.ps1` and `Install-UpdatePublisher.ps1` from this `tools` folder, preserving those filenames. Put both into the **same local folder**.
2. In PowerShell **under the intended Windows account**, verify:
   - `gh --version`
   - `gh auth status`
   - `Test-Path 'Z:\Health & Safety\Dashboard Updates'` returns `True`.
3. Create the limited repository token in GitHub's Settings → Developer settings → Personal access tokens → Fine-grained tokens. With IT approval, launch `Install-UpdatePublisher.ps1`. It prompts securely for the token. If your organisation blocks PowerShell scripts, ask IT to approve the setup rather than changing corporate security controls.
4. The installer copies the publisher into your local app data folder, registers a Windows Task Scheduler job called **Onboard H&S Private Update Publisher**, and performs one publication check.
5. Open Task Scheduler, confirm the task runs **hourly** and review the log at `%LOCALAPPDATA%\OnboardCorrugated\UpdatePublisher\publisher.log`.
6. Publish a later dashboard version on GitHub main and wait for its build to succeed. The publisher will copy the installer first, validate the copy and place the new manifest last. The dashboard will see the updated folder and offer installation.

**Security:** Restrict write permission on the shared folder to a nominated publisher account. User devices require only read permission. Do not allow unreviewed GitHub commits to trigger deployment. GitHub artifact hashes verify transfer integrity, **not** the legitimacy of a code change. The executable is not digitally signed; obtain IT approval and consider code signing.

## Troubleshooting

- **Not seeing new versions**: Ensure the newest GitHub build is successful, the PC is signed in, the Z: mapping is accessible from the scheduled task, and the publisher log says `Published`.
- **Log says `already published`**: The private update folder already has that version or newer.
- **GitHub authentication error**: Confirm the fine-grained token has not expired and has access to the private repository with Actions read permission. Rerun installation after IT-approved credential replacement. Do not disclose the token.
- **Mapped drive missing**: Ask IT to use an approved UNC path such as `\\server\share\Dashboard Updates` rather than Z: (substitute the **real** share path; do not guess it).
- **The latest build failed**: The publisher deliberately does not fall back to an older build.
- **Nothing happened**: The dashboard itself checks shortly after opening and then every four hours. Use **Backup & Updates → Check and install update** to check immediately.

## Stop automatic publishing

Disable or remove the **Onboard H&S Private Update Publisher** task in Windows Task Scheduler. This does not uninstall the dashboard, change existing backup data or disable checking already-published private updates.

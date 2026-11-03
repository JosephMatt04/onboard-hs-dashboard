'use strict';
function createUpdates({app, dialog, getWindow, config, getUpdater = () => require('electron-updater').autoUpdater, platform = process.platform}) {
  let updater, timer, busy = false, downloaded = false;
  let detail = 'Updates will be checked after the app starts.';
  const enabled = () => app.isPackaged && platform === 'win32' && config.enabled === true;
  const status = () => ({enabled: enabled(), version: app.getVersion(), detail});
  async function offerInstall() {
    const window = getWindow();
    if (!window || window.isDestroyed()) return;
    const answer = await dialog.showMessageBox(window, {
      type: 'info', title: 'Dashboard update ready',
      message: 'A new version is ready to install.',
      detail: 'Save your work and export a backup before restarting. Choose Later to keep working; use Check for updates when you are ready.',
      buttons: ['Restart and install', 'Later'], defaultId: 1, cancelId: 1
    });
    if (answer.response === 0) updater.quitAndInstall(false, true);
  }
  async function check(manual = false) {
    if (!updater) return {...status(), detail: 'Updates are not enabled for this installation.'};
    if (downloaded) { if (manual) await offerInstall(); return status(); }
    if (busy) return {...status(), detail: 'An update check or download is already running.'};
    busy = true;
    try {
      const result = await updater.checkForUpdates();
      if (result?.downloadPromise) await result.downloadPromise;
      return status();
    } catch (error) {
      detail = 'Could not check or download updates. Check your internet connection and that an approved release has been published.';
      return {...status(), error: error.message};
    } finally { busy = false; }
  }
  function start() {
    if (!enabled() || updater) return;
    updater = getUpdater();
    updater.autoDownload = true;
    updater.autoInstallOnAppQuit = false;
    updater.allowDowngrade = false;
    updater.allowPrerelease = false;
    updater.setFeedURL({provider: 'github', owner: config.owner, repo: config.repo});
    updater.on('update-available', info => { detail = 'Downloading version ' + info.version + '…'; });
    updater.on('update-not-available', () => { detail = 'You have the latest published version.'; });
    updater.on('error', () => { detail = 'Update service unavailable. You can try again using Check for updates.'; });
    updater.on('update-downloaded', () => {
      downloaded = true;
      detail = 'Update downloaded. Use Check for updates to restart and install.';
      offerInstall().catch(() => {});
    });
    timer = setTimeout(() => { check(); timer = setInterval(() => check(), 4 * 60 * 60 * 1000); timer.unref?.(); }, 15000);
    timer.unref?.();
    app.once('before-quit', () => { clearTimeout(timer); clearInterval(timer); });
  }
  return {start, check, status};
}
module.exports = {createUpdates};

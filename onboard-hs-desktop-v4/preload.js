'use strict';
const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('onboardDesktop', Object.freeze({
  pinStatus: () => ipcRenderer.sendSync('pin:status'),
  pinVerify: (pin) => ipcRenderer.invoke('pin:verify',pin),
  pinConfigure: (pin,sections,currentPin) => ipcRenderer.invoke('pin:configure',pin,sections,currentPin),
  pinLock: () => ipcRenderer.invoke('pin:lock'),
  read: () => ipcRenderer.sendSync('records:read'),
  write: (records) => ipcRenderer.sendSync('records:write', records),
  dataFolder: () => ipcRenderer.invoke('records:location'),
  liveUiStatus: () => ipcRenderer.invoke('live-ui:status'),
  refreshDashboard: () => ipcRenderer.invoke('live-ui:refresh'),
  restoreDashboard: () => ipcRenderer.invoke('live-ui:restore'),
  githubUpdateStatus: () => ipcRenderer.invoke('github-updates:status'),
  checkGithubUpdates: () => ipcRenderer.invoke('github-updates:check'),
  updateStatus: () => ipcRenderer.invoke('updates:status'),
  checkUpdates: () => ipcRenderer.invoke('updates:check'),
  chooseUpdateFolder: () => ipcRenderer.invoke('updates:choose'),
  backupStatus: () => ipcRenderer.invoke('backup:status'),
  chooseBackupFolder: () => ipcRenderer.invoke('backup:choose'),
  backupNow: () => ipcRenderer.invoke('backup:now'),
  openAttachment: (section,id,index) => ipcRenderer.invoke('attachments:open',section,id,index),
  savePermitPDF: (html,reference) => ipcRenderer.invoke('permit:savepdf',html,reference)
}));

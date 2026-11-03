'use strict';
const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('onboardDesktop', Object.freeze({
  read: () => ipcRenderer.sendSync('records:read'),
  write: (records) => ipcRenderer.sendSync('records:write', records),
  dataFolder: () => ipcRenderer.invoke('records:location'),
  updateStatus: () => ipcRenderer.invoke('updates:status'),
  checkUpdates: () => ipcRenderer.invoke('updates:check'),
  backupStatus: () => ipcRenderer.invoke('backup:status'),
  chooseBackupFolder: () => ipcRenderer.invoke('backup:choose'),
  backupNow: () => ipcRenderer.invoke('backup:now'),
  savePermitPDF: (html,reference) => ipcRenderer.invoke('permit:savepdf',html,reference)
}));

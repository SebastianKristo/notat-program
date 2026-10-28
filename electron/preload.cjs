const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('margDesktop', {
  setDockIcon: dataUrl => ipcRenderer.send('dock-icon', dataUrl)
});

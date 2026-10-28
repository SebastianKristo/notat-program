const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 380, minHeight: 600,
    backgroundColor: '#191919', titleBarStyle: 'hiddenInset', title: 'Marg',
    webPreferences: { contextIsolation: true }
  });
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  // Egne sider (nytt vindu, utskrift) åpnes i appen; alt annet i nettleseren
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('file:') || url === 'about:blank') return { action: 'allow', overrideBrowserWindowOptions: { width: 1100, height: 780, backgroundColor: '#191919', titleBarStyle: 'hiddenInset' } };
    shell.openExternal(url); return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

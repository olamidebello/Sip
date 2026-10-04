const { app, BrowserWindow, shell, session } = require('electron');

const origin = 'https://sip.dobhrap.com';

function isOlamide(url) {
  try { return new URL(url).origin === origin; } catch { return false; }
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const fromApp = isOlamide(details?.requestingUrl || webContents.getURL());
    callback(fromApp && ['media', 'mediaTypes', 'microphone', 'camera', 'notifications'].includes(permission));
  });
  const window = new BrowserWindow({
    width: 1180, height: 800, minWidth: 390, minHeight: 550,
    title: 'Olamide', autoHideMenuBar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true,
      webviewTag: false, devTools: false }
  });
  window.webContents.setWindowOpenHandler(({url}) => {
    if (isOlamide(url)) shell.openExternal(url);
    return {action: 'deny'};
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (!isOlamide(url)) event.preventDefault();
  });
  window.loadURL(origin);
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

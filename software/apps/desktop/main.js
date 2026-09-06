const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// The desktop app is a thin native shell around the same WebXR/Three.js
// frontend used by the browser and mobile builds -- one codebase, three
// install targets. It expects the COGNIFORGE backend (FastAPI) to be
// reachable at localhost:8000, exactly like the browser version (see the
// project README for `docker-compose up` / manual backend setup).
const FRONTEND_DIST_CANDIDATES = [
  path.join(__dirname, 'frontend-dist', 'index.html'), // packaged app
  path.join(__dirname, '..', '..', 'frontend', 'dist', 'index.html'), // dev
];

function resolveFrontendEntry() {
  for (const candidate of FRONTEND_DIST_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    'Could not find a built frontend. Run `npm run build:frontend` in apps/desktop, ' +
    'or `npm run build` in frontend/, before starting the desktop app.'
  );
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'COGNIFORGE',
    backgroundColor: '#1a1a1a',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // WebXR / getUserMedia (for the head-tracking parallax feature) need
      // media permissions; Electron's default webSecurity stays enabled.
    },
  });

  win.loadFile(resolveFrontendEntry());

  // Open any target="_blank" links in the OS browser rather than a new
  // Electron window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

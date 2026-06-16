const path = require('path');
const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const { createPESUAgent } = require('../core/pesuAgent');
const { parseSpeedOption } = require('../core/unitTools');

let mainWindow;
let activeRun = null;
let activeAgent = null;
let lastOutputDir = '';

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function getDefaultOutputDir() {
  if (!lastOutputDir) {
    lastOutputDir = path.join(app.getPath('downloads'), 'PESU_Academy');
  }

  return lastOutputDir;
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    backgroundColor: '#f4ede3',
    height: 860,
    minHeight: 760,
    minWidth: 1120,
    title: 'PESU Academy Slide Downloader',
    width: 1320,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

ipcMain.handle('pesu:get-default-output-dir', async () => getDefaultOutputDir());

ipcMain.handle('pesu:choose-output-dir', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    defaultPath: getDefaultOutputDir(),
    properties: ['openDirectory', 'createDirectory'],
    title: 'Choose PESU slide download folder',
  });

  if (result.canceled || !result.filePaths[0]) {
    return null;
  }

  lastOutputDir = result.filePaths[0];
  return lastOutputDir;
});

ipcMain.handle('pesu:open-output-dir', async (_event, outputDir) => {
  const target = outputDir || getDefaultOutputDir();
  const error = await shell.openPath(target);
  if (error) {
    return { ok: false, error };
  }

  return { ok: true };
});

ipcMain.handle('pesu:start', async (_event, payload = {}) => {
  if (activeRun) {
    throw new Error('A download is already running.');
  }

  const username = String(payload.username || '').trim();
  const password = String(payload.password || '');
  const outputDir = path.resolve(payload.outputDir || getDefaultOutputDir());

  if (!username) {
    throw new Error('Username is required.');
  }

  if (!password) {
    throw new Error('Password is required.');
  }

  let speed;
  try {
    speed = parseSpeedOption({ speed: payload.speed, delayMs: payload.delayMs });
  } catch (error) {
    throw new Error(error.message);
  }

  lastOutputDir = outputDir;
  sendToRenderer('pesu:run-state', {
    outputDir,
    running: true,
  });

  const agent = createPESUAgent({
    actionDelayMs: speed.actionDelayMs,
    headless: false,
    outputDir,
    speedLabel: speed.label,
    workspaceDir: app.getPath('userData'),
  });
  activeAgent = agent;

  activeRun = agent.run({
    appRoot: app.getAppPath(),
    isPackaged: app.isPackaged,
    onLog: (event) => {
      sendToRenderer('pesu:log', event);
    },
    onProgress: (event) => {
      sendToRenderer('pesu:progress', {
        ...event,
        outputDir,
      });
    },
    password,
    playwrightBrowsersPath: app.isPackaged ? null : path.join(app.getAppPath(), 'playwright-browsers'),
    resourcesPath: process.resourcesPath,
    username,
  });

  try {
    const counts = await activeRun;
    sendToRenderer('pesu:run-state', {
      counts,
      outputDir,
      running: false,
      success: true,
    });
    return counts;
  } catch (error) {
    sendToRenderer('pesu:run-state', {
      error: error.message,
      outputDir,
      running: false,
      success: false,
    });
    throw error;
  } finally {
    activeRun = null;
    activeAgent = null;
  }
});

ipcMain.handle('pesu:stop', async () => {
  if (activeAgent && typeof activeAgent.requestStop === 'function') {
    activeAgent.requestStop();
    sendToRenderer('pesu:log', { line: 'Stop requested by user. Finishing the current step...', level: 'info' });
    return { ok: true };
  }
  return { ok: false, error: 'No active download to stop.' };
});

app.whenReady().then(() => {
  getDefaultOutputDir();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

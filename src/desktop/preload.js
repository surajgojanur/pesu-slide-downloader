const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

contextBridge.exposeInMainWorld('pesuDesktop', {
  chooseOutputDir: () => ipcRenderer.invoke('pesu:choose-output-dir'),
  getDefaultOutputDir: () => ipcRenderer.invoke('pesu:get-default-output-dir'),
  onLog: (callback) => subscribe('pesu:log', callback),
  onProgress: (callback) => subscribe('pesu:progress', callback),
  onRunState: (callback) => subscribe('pesu:run-state', callback),
  openOutputDir: (outputDir) => ipcRenderer.invoke('pesu:open-output-dir', outputDir),
  startDownload: (payload) => ipcRenderer.invoke('pesu:start', payload),
});

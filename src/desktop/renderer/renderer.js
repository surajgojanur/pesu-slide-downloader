const elements = {
  chooseFolderButton: document.getElementById('chooseFolderButton'),
  downloadedCount: document.getElementById('downloadedCount'),
  failedCount: document.getElementById('failedCount'),
  logList: document.getElementById('logList'),
  openFolderButton: document.getElementById('openFolderButton'),
  outputDirInput: document.getElementById('outputDirInput'),
  passwordInput: document.getElementById('passwordInput'),
  progressMessage: document.getElementById('progressMessage'),
  skippedCount: document.getElementById('skippedCount'),
  startButton: document.getElementById('startButton'),
  statusBadge: document.getElementById('statusBadge'),
  statusText: document.getElementById('statusText'),
  usernameInput: document.getElementById('usernameInput'),
};

const state = {
  counts: {
    downloaded: 0,
    failed: 0,
    skipped: 0,
  },
  outputDir: '',
  running: false,
};

function appendLog(message, level = 'info') {
  const row = document.createElement('div');
  row.className = `log-entry log-entry-${level}`;
  row.textContent = message;
  elements.logList.appendChild(row);
  elements.logList.scrollTop = elements.logList.scrollHeight;
}

function setCounts(counts = {}) {
  state.counts = {
    downloaded: counts.downloaded || 0,
    failed: counts.failed || 0,
    skipped: counts.skipped || 0,
  };

  elements.downloadedCount.textContent = String(state.counts.downloaded);
  elements.skippedCount.textContent = String(state.counts.skipped);
  elements.failedCount.textContent = String(state.counts.failed);
}

function setStatus(label, message) {
  elements.statusBadge.textContent = label;
  elements.statusText.textContent = message;
}

function syncButtons() {
  elements.startButton.disabled = state.running;
  elements.chooseFolderButton.disabled = state.running;
  elements.openFolderButton.disabled = !state.outputDir;
}

async function hydrateDefaults() {
  const defaultOutputDir = await window.pesuDesktop.getDefaultOutputDir();
  state.outputDir = defaultOutputDir;
  elements.outputDirInput.value = defaultOutputDir;
  syncButtons();
}

elements.chooseFolderButton.addEventListener('click', async () => {
  const outputDir = await window.pesuDesktop.chooseOutputDir();
  if (!outputDir) {
    return;
  }

  state.outputDir = outputDir;
  elements.outputDirInput.value = outputDir;
  appendLog(`Output folder selected: ${outputDir}`);
  syncButtons();
});

elements.openFolderButton.addEventListener('click', async () => {
  if (!state.outputDir) {
    setStatus('Folder needed', 'Choose an output directory before opening it.');
    return;
  }

  const result = await window.pesuDesktop.openOutputDir(state.outputDir);
  if (!result.ok) {
    setStatus('Open failed', result.error || 'Could not open the output folder.');
    return;
  }

  appendLog(`Opened output folder: ${state.outputDir}`);
});

elements.startButton.addEventListener('click', async () => {
  const username = elements.usernameInput.value.trim();
  const password = elements.passwordInput.value;
  const outputDir = elements.outputDirInput.value.trim();

  if (!username || !password || !outputDir) {
    setStatus('Missing details', 'Username, password, and output folder are all required.');
    return;
  }

  setCounts({ downloaded: 0, failed: 0, skipped: 0 });
  elements.logList.innerHTML = '';
  elements.progressMessage.textContent = 'Launching Playwright and opening PESU Academy...';
  appendLog('Starting downloader run...');

  try {
    await window.pesuDesktop.startDownload({
      outputDir,
      password,
      username,
    });
  } catch (error) {
    setStatus('Run failed', error.message || String(error));
  }
});

window.pesuDesktop.onLog((event) => {
  appendLog(event.line || event.message, event.level || 'info');
});

window.pesuDesktop.onProgress((event) => {
  if (event.counts) {
    setCounts(event.counts);
  }

  if (event.message) {
    elements.progressMessage.textContent = event.message;
  } else if (event.item?.filePath) {
    elements.progressMessage.textContent = event.item.filePath;
  }
});

window.pesuDesktop.onRunState((event) => {
  state.running = Boolean(event.running);
  if (event.outputDir) {
    state.outputDir = event.outputDir;
    elements.outputDirInput.value = event.outputDir;
  }

  syncButtons();

  if (event.running) {
    setStatus('Running', 'Chromium is open and the downloader is processing courses.');
    return;
  }

  if (event.success) {
    setStatus(
      'Complete',
      `Finished. Downloaded ${event.counts.downloaded}, skipped ${event.counts.skipped}, failed ${event.counts.failed}.`
    );
    elements.progressMessage.textContent = 'Run finished.';
    elements.passwordInput.value = '';
    appendLog('Downloader run finished successfully.');
    return;
  }

  if (event.error) {
    setStatus('Failed', event.error);
    elements.progressMessage.textContent = event.error;
    appendLog(`Run failed: ${event.error}`, 'error');
  }
});

hydrateDefaults().catch((error) => {
  setStatus('Startup failed', error.message || String(error));
});

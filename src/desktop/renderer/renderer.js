const elements = {
  chooseFolderButton: document.getElementById('chooseFolderButton'),
  clearAllButton: document.getElementById('clearAllButton'),
  courseProgress: document.getElementById('courseProgress'),
  customDelayField: document.getElementById('customDelayField'),
  customDelayInput: document.getElementById('customDelayInput'),
  discoverButton: document.getElementById('discoverButton'),
  downloadedCount: document.getElementById('downloadedCount'),
  failedCount: document.getElementById('failedCount'),
  logList: document.getElementById('logList'),
  openFolderButton: document.getElementById('openFolderButton'),
  outputDirInput: document.getElementById('outputDirInput'),
  passwordInput: document.getElementById('passwordInput'),
  progressBarFill: document.getElementById('progressBarFill'),
  progressBarWrap: document.getElementById('progressBarWrap'),
  progressMessage: document.getElementById('progressMessage'),
  selectAllButton: document.getElementById('selectAllButton'),
  selectionPanel: document.getElementById('selectionPanel'),
  selectionTree: document.getElementById('selectionTree'),
  skippedCount: document.getElementById('skippedCount'),
  speedSelect: document.getElementById('speedSelect'),
  startButton: document.getElementById('startButton'),
  statusBadge: document.getElementById('statusBadge'),
  statusText: document.getElementById('statusText'),
  stopButton: document.getElementById('stopButton'),
  technicalToggle: document.getElementById('technicalToggle'),
  unitProgress: document.getElementById('unitProgress'),
  usernameInput: document.getElementById('usernameInput'),
};

// Lines from the engine that a non-technical user actually cares about. Anything
// that doesn't match (selectors, fingerprints, page dumps) is treated as a
// technical detail and hidden unless "Show technical details" is enabled.
// Errors and warnings are always treated as milestones so problems surface.
const MILESTONE_PATTERNS = [
  /starting pesu/i,
  /automation speed/i,
  /login/i,
  /sign[- ]?in/i,
  /detected courses/i,
  /course candidate/i,
  /course identified/i,
  /detected units/i,
  /unit tabs detected/i,
  /opening (intended|actual) unit/i,
  /saved pdf/i,
  /skip existing file/i,
  /run summary/i,
  /finished pesu/i,
  /downloader (started|finished)/i,
  /stop requested/i,
  /fail/i,
  /error/i,
  /refus/i,
  /wrong-unit/i,
  /could not/i,
  /unable to/i,
  /no pdf/i,
  /no slide table/i,
  /warning/i,
];

function isMilestone(message) {
  return MILESTONE_PATTERNS.some((pattern) => pattern.test(String(message || '')));
}

function applyTechnicalVisibility() {
  const showTechnical = Boolean(elements.technicalToggle.checked);
  elements.logList.classList.toggle('hide-technical', !showTechnical);
}

const state = {
  counts: {
    downloaded: 0,
    failed: 0,
    skipped: 0,
  },
  catalog: null,
  outputDir: '',
  running: false,
};

function appendLog(message, level = 'info', { technical = false } = {}) {
  const row = document.createElement('div');
  row.className = `log-entry log-entry-${level}`;
  if (technical) {
    row.classList.add('log-technical');
  }
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
  elements.discoverButton.disabled = state.running;
  elements.openFolderButton.disabled = !state.outputDir;
  elements.stopButton.disabled = !state.running;
  elements.speedSelect.disabled = state.running;
  elements.customDelayInput.disabled = state.running;
}

function setAllSelectionCheckboxes(checked) {
  elements.selectionTree
    .querySelectorAll('input[type="checkbox"]')
    .forEach((checkbox) => {
      checkbox.checked = checked;
    });
}

// Render the discovered course/unit catalog as a checkbox tree.
function renderSelectionTree(catalog) {
  elements.selectionTree.innerHTML = '';

  if (!catalog || !catalog.length) {
    elements.selectionPanel.hidden = true;
    return;
  }

  for (const course of catalog) {
    const courseEl = document.createElement('div');
    courseEl.className = 'selection-course';

    const header = document.createElement('label');
    header.className = 'selection-course-header';
    const courseCheckbox = document.createElement('input');
    courseCheckbox.type = 'checkbox';
    courseCheckbox.checked = true;
    courseCheckbox.className = 'course-checkbox';
    courseCheckbox.dataset.code = course.code || course.label || '';
    const courseText = document.createElement('span');
    courseText.textContent = `${course.code ? `${course.code} - ` : ''}${course.title || course.label}`;
    header.appendChild(courseCheckbox);
    header.appendChild(courseText);
    courseEl.appendChild(header);

    const unitsWrap = document.createElement('div');
    unitsWrap.className = 'selection-units';

    const units = (course.units || []).filter((unit) => unit.number != null);
    if (!units.length) {
      const note = document.createElement('p');
      note.className = 'selection-note';
      note.textContent = course.error
        ? `⚠ Needs manual retry — could not read units (${course.error}). Selecting it re-attempts the whole course during download.`
        : 'No units detected. The whole course will be downloaded if selected.';
      unitsWrap.appendChild(note);
    } else {
      for (const unit of units) {
        const unitLabel = document.createElement('label');
        unitLabel.className = 'selection-unit';
        const unitCheckbox = document.createElement('input');
        unitCheckbox.type = 'checkbox';
        unitCheckbox.checked = true;
        unitCheckbox.className = 'unit-checkbox';
        unitCheckbox.dataset.number = String(unit.number);
        const unitText = document.createElement('span');
        unitText.textContent = `Unit ${unit.number}: ${unit.text}`;
        unitLabel.appendChild(unitCheckbox);
        unitLabel.appendChild(unitText);
        unitsWrap.appendChild(unitLabel);
      }
    }

    courseCheckbox.addEventListener('change', () => {
      unitsWrap.querySelectorAll('.unit-checkbox').forEach((checkbox) => {
        checkbox.checked = courseCheckbox.checked;
      });
    });

    courseEl.appendChild(unitsWrap);
    elements.selectionTree.appendChild(courseEl);
  }

  elements.selectionPanel.hidden = false;
}

// Build a normalized selection object from the current checkbox tree.
// Returns null when nothing was discovered (=> download everything), or an
// object with a possibly-empty `courses` array.
function buildSelectionFromTree() {
  if (!state.catalog) {
    return null;
  }

  const courses = [];
  elements.selectionTree.querySelectorAll('.selection-course').forEach((courseEl) => {
    const courseCheckbox = courseEl.querySelector('.course-checkbox');
    const unitCheckboxes = Array.from(courseEl.querySelectorAll('.unit-checkbox'));
    const key = courseCheckbox.dataset.code;

    if (!unitCheckboxes.length) {
      if (courseCheckbox.checked) {
        courses.push({ key, units: null });
      }
      return;
    }

    const checkedUnits = unitCheckboxes
      .filter((checkbox) => checkbox.checked)
      .map((checkbox) => Number(checkbox.dataset.number));

    if (!checkedUnits.length) {
      return;
    }

    const allChecked = checkedUnits.length === unitCheckboxes.length;
    courses.push({ key, units: allChecked ? null : checkedUnits });
  });

  return { courses };
}

function isCustomSpeed() {
  return elements.speedSelect.value === 'custom';
}

function syncCustomDelayVisibility() {
  elements.customDelayField.hidden = !isCustomSpeed();
}

function resolveSpeedSelection() {
  if (isCustomSpeed()) {
    return { delayMs: elements.customDelayInput.value };
  }
  return { speed: elements.speedSelect.value };
}

elements.speedSelect.addEventListener('change', syncCustomDelayVisibility);
elements.technicalToggle.addEventListener('change', applyTechnicalVisibility);

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

elements.discoverButton.addEventListener('click', async () => {
  const username = elements.usernameInput.value.trim();
  const password = elements.passwordInput.value;

  if (!username || !password) {
    setStatus('Missing details', 'Enter your username and password before discovering courses.');
    return;
  }

  elements.logList.innerHTML = '';
  elements.progressMessage.textContent = 'Opening PESU Academy to list your courses...';
  appendLog('Discovering your courses and units...');

  try {
    const catalog = await window.pesuDesktop.discoverCourses({ username, password });
    state.catalog = catalog;
    renderSelectionTree(catalog);
    setStatus('Discovered', `Found ${catalog.length} course(s). Pick what to download, then Start.`);
    appendLog(`Discovery complete: ${catalog.length} course(s) found.`);
  } catch (error) {
    setStatus('Discovery failed', error.message || String(error));
    appendLog(`Discovery failed: ${error.message || String(error)}`, 'error');
  }
});

elements.selectAllButton.addEventListener('click', () => setAllSelectionCheckboxes(true));
elements.clearAllButton.addEventListener('click', () => setAllSelectionCheckboxes(false));

elements.startButton.addEventListener('click', async () => {
  const username = elements.usernameInput.value.trim();
  const password = elements.passwordInput.value;
  const outputDir = elements.outputDirInput.value.trim();

  if (!username || !password || !outputDir) {
    setStatus('Missing details', 'Username, password, and output folder are all required.');
    return;
  }

  // If the user discovered and chose a subset, honor it. Empty selection after
  // discovery means they cleared everything — ask them to pick something.
  const selection = buildSelectionFromTree();
  if (selection && !selection.courses.length) {
    setStatus('Nothing selected', 'Select at least one course or unit, or clear the discovery list to download everything.');
    return;
  }

  const speedSelection = resolveSpeedSelection();

  setCounts({ downloaded: 0, failed: 0, skipped: 0 });
  elements.logList.innerHTML = '';
  elements.progressBarWrap.hidden = true;
  elements.progressBarFill.style.width = '0%';
  elements.courseProgress.textContent = 'Course —';
  elements.unitProgress.textContent = 'Unit —';
  elements.progressMessage.textContent = 'Launching Playwright and opening PESU Academy...';
  appendLog('Starting downloader run...');

  try {
    await window.pesuDesktop.startDownload({
      ...speedSelection,
      outputDir,
      password,
      selection,
      username,
    });
  } catch (error) {
    setStatus('Run failed', error.message || String(error));
  }
});

elements.stopButton.addEventListener('click', async () => {
  elements.stopButton.disabled = true;
  appendLog('Stop requested. Waiting for the current step to finish...');
  const result = await window.pesuDesktop.stopDownload();
  if (!result || !result.ok) {
    setStatus('Stop failed', (result && result.error) || 'Could not stop the run.');
  }
});

window.pesuDesktop.onLog((event) => {
  const level = event.level || 'info';
  const text = event.line || event.message || '';
  // Engine messages: errors always show; otherwise hide non-milestone detail.
  const technical = level !== 'error' && !isMilestone(event.message || text);
  appendLog(text, level, { technical });
});

function updateProgressBar(nav) {
  if (!nav || !nav.courseTotal) {
    return;
  }

  elements.progressBarWrap.hidden = false;
  elements.courseProgress.textContent = `Course ${nav.courseIndex}/${nav.courseTotal}`;
  elements.unitProgress.textContent = nav.unitTotal
    ? `Unit ${nav.unitIndex}/${nav.unitTotal}`
    : 'Unit —';

  const unitFraction = nav.unitTotal ? nav.unitIndex / nav.unitTotal : 0;
  const overall = ((nav.courseIndex - 1) + unitFraction) / nav.courseTotal;
  const percent = Math.max(0, Math.min(100, Math.round(overall * 100)));
  elements.progressBarFill.style.width = `${percent}%`;
}

window.pesuDesktop.onProgress((event) => {
  if (event.counts) {
    setCounts(event.counts);
  }

  if (event.nav) {
    updateProgressBar(event.nav);
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

  // Discovery phase: no counts; the catalog is returned via the discover() call.
  if (event.phase === 'discovery') {
    if (event.running) {
      setStatus('Discovering', 'Chromium is open and listing your courses and units.');
    } else if (event.error) {
      setStatus('Discovery failed', event.error);
      appendLog(`Discovery failed: ${event.error}`, 'error');
    }
    return;
  }

  if (event.running) {
    setStatus('Running', 'Chromium is open and the downloader is processing courses.');
    return;
  }

  if (event.success && event.counts) {
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
    elements.passwordInput.value = '';
    appendLog(`Run failed: ${event.error}`, 'error');
  }
});

syncCustomDelayVisibility();
applyTechnicalVisibility();
hydrateDefaults().catch((error) => {
  setStatus('Startup failed', error.message || String(error));
});

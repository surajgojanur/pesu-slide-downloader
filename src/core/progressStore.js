const { ensureDir, loadJson, now, saveJson } = require('./fileUtils');

function createProgressStore({ progressFile, onProgress }) {
  ensureDir(require('path').dirname(progressFile));

  const baseState = loadJson(progressFile, {
    downloaded: {},
    failed: {},
    history: [],
    lastUpdated: null,
  });

  baseState.downloaded ||= {};
  baseState.failed ||= {};
  baseState.history ||= [];

  const summary = {
    downloaded: 0,
    skipped: 0,
    failed: 0,
  };

  function persist() {
    baseState.lastUpdated = now();
    saveJson(progressFile, baseState);
  }

  function emit(extra = {}) {
    if (typeof onProgress === 'function') {
      onProgress({
        counts: { ...summary },
        ...extra,
      });
    }
  }

  function recordDownloaded(key, value) {
    const status = value.status || 'downloaded';
    baseState.downloaded[key] = value;
    baseState.history.push({
      key,
      status,
      recordedAt: now(),
      filePath: value.filePath,
      source: value.source,
    });

    if (status === 'skipped-existing') {
      summary.skipped += 1;
    } else {
      summary.downloaded += 1;
    }

    persist();
    emit({
      item: {
        key,
        ...value,
      },
      status,
    });
  }

  function recordFailed(key, value) {
    const status = value.status || 'failed';
    baseState.failed[key] = value;
    baseState.history.push({
      key,
      status,
      recordedAt: now(),
      reason: value.reason,
    });
    summary.failed += 1;
    persist();
    emit({
      item: {
        key,
        ...value,
      },
      status,
    });
  }

  function note(message, extra = {}) {
    emit({
      message,
      ...extra,
    });
  }

  function snapshot() {
    return {
      counts: { ...summary },
      progress: baseState,
    };
  }

  persist();
  emit({ message: 'Progress initialized' });

  return {
    note,
    recordDownloaded,
    recordFailed,
    snapshot,
  };
}

module.exports = {
  createProgressStore,
};

const fs = require('fs');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function now() {
  return new Date().toISOString();
}

function sanitizeName(value, fallback = 'Untitled') {
  const text = String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.+$/, '');

  return text || fallback;
}

function loadJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function saveJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

module.exports = {
  ensureDir,
  loadJson,
  now,
  sanitizeName,
  saveJson,
};

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BROWSER_NOT_INSTALLED_MESSAGE = 'Browser not installed. Please reinstall app.';

function fileExists(targetPath) {
  try {
    return Boolean(targetPath) && fs.existsSync(targetPath);
  } catch {
    return false;
  }
}

function directoryHasChromiumBundle(browserRoot) {
  if (!fileExists(browserRoot)) {
    return false;
  }

  const children = fs.readdirSync(browserRoot, { withFileTypes: true });
  return children.some((entry) => entry.isDirectory() && /^chromium-\d+/.test(entry.name));
}

function requirePlaywright(browserRoot) {
  if (browserRoot) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = browserRoot;
  } else {
    delete process.env.PLAYWRIGHT_BROWSERS_PATH;
  }

  return require('playwright');
}

function findSystemChromiumExecutable() {
  if (process.platform === 'linux') {
    const candidates = [
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/snap/bin/chromium',
    ];

    for (const candidate of candidates) {
      if (fileExists(candidate)) {
        return candidate;
      }
    }

    const whichResult = spawnSync('bash', ['-lc', 'command -v chromium || command -v chromium-browser || command -v google-chrome || command -v google-chrome-stable'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    const resolved = whichResult.stdout.trim();
    if (resolved) {
      return resolved;
    }
  }

  if (process.platform === 'darwin') {
    const candidates = [
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ];

    for (const candidate of candidates) {
      if (fileExists(candidate)) {
        return candidate;
      }
    }
  }

  if (process.platform === 'win32') {
    const roots = [
      process.env.LOCALAPPDATA,
      process.env.PROGRAMFILES,
      process.env['PROGRAMFILES(X86)'],
    ].filter(Boolean);

    const suffixes = [
      ['Chromium', 'Application', 'chrome.exe'],
      ['Google', 'Chrome', 'Application', 'chrome.exe'],
    ];

    for (const root of roots) {
      for (const suffix of suffixes) {
        const candidate = path.join(root, ...suffix);
        if (fileExists(candidate)) {
          return candidate;
        }
      }
    }
  }

  return null;
}

function resolveBundledBrowserRoot(options = {}) {
  if (options.playwrightBrowsersPath) {
    return path.resolve(options.playwrightBrowsersPath);
  }

  if (options.isPackaged) {
    return path.join(options.resourcesPath, 'playwright-browsers');
  }

  return path.join(options.appRoot, 'playwright-browsers');
}

function resolveChromiumLaunchConfig(options = {}) {
  const bundledBrowserRoot = resolveBundledBrowserRoot(options);

  if (directoryHasChromiumBundle(bundledBrowserRoot)) {
    const { chromium } = requirePlaywright(bundledBrowserRoot);
    const executablePath = chromium.executablePath();
    if (fileExists(executablePath)) {
      return {
        browserRoot: bundledBrowserRoot,
        chromium,
        executablePath,
        source: options.isPackaged ? 'bundled-playwright' : 'project-playwright',
      };
    }
  }

  const { chromium } = requirePlaywright(null);
  const defaultExecutablePath = chromium.executablePath();
  if (fileExists(defaultExecutablePath)) {
    return {
      browserRoot: null,
      chromium,
      executablePath: defaultExecutablePath,
      source: options.isPackaged ? 'playwright-cache' : 'playwright-default',
    };
  }

  const systemExecutablePath = findSystemChromiumExecutable();
  if (fileExists(systemExecutablePath)) {
    return {
      browserRoot: null,
      chromium,
      executablePath: systemExecutablePath,
      source: 'system-chromium',
    };
  }

  const error = new Error(BROWSER_NOT_INSTALLED_MESSAGE);
  error.code = 'PLAYWRIGHT_BROWSER_MISSING';
  throw error;
}

module.exports = {
  BROWSER_NOT_INSTALLED_MESSAGE,
  resolveChromiumLaunchConfig,
};

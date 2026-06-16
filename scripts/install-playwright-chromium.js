#!/usr/bin/env node

const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const browsersPath = path.join(projectRoot, 'playwright-browsers');
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';

// When npm runs this as the "postinstall" hook we don't want a download failure
// (offline, proxy, etc.) to abort the whole `npm install`. When the user runs it
// explicitly via `npm run playwright:install`, a failure should be a hard error.
const isPostinstall = process.env.npm_lifecycle_event === 'postinstall';

console.log('Installing the managed Chromium browser for Playwright...');
console.log('  This is a one-time download of roughly 150 MB and may take a few minutes.');
console.log(`  Target: ${browsersPath}`);

const result = spawnSync(npxCommand, ['playwright', 'install', 'chromium'], {
  cwd: projectRoot,
  env: {
    ...process.env,
    PLAYWRIGHT_BROWSERS_PATH: browsersPath,
  },
  stdio: 'inherit',
});

function warnManualStep(reason) {
  console.warn('');
  console.warn('-----------------------------------------------------------------------');
  console.warn(`WARNING: the Chromium download did not complete (${reason}).`);
  console.warn('The app cannot run until Chromium is installed.');
  console.warn('When you are back online, finish the setup by running:');
  console.warn('    npm run playwright:install');
  console.warn('-----------------------------------------------------------------------');
}

if (result.error) {
  if (isPostinstall) {
    warnManualStep(result.error.message);
    process.exitCode = 0;
    return;
  }
  throw result.error;
}

if (result.status && result.status !== 0) {
  if (isPostinstall) {
    warnManualStep(`exit code ${result.status}`);
    process.exitCode = 0;
    return;
  }
  process.exitCode = result.status;
  return;
}

console.log('Chromium is ready.');
process.exitCode = 0;

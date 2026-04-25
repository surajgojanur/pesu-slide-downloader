#!/usr/bin/env node

const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const browsersPath = path.join(projectRoot, 'playwright-browsers');
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const result = spawnSync(npxCommand, ['playwright', 'install', 'chromium'], {
  cwd: projectRoot,
  env: {
    ...process.env,
    PLAYWRIGHT_BROWSERS_PATH: browsersPath,
  },
  stdio: 'inherit',
});

if (result.error) {
  throw result.error;
}

process.exitCode = result.status ?? 1;

#!/usr/bin/env node

const path = require('path');
const dotenv = require('dotenv');
const { createPESUAgent } = require('../src/core/pesuAgent');

const ROOT_DIR = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(ROOT_DIR, '.env'), quiet: true });

async function main() {
  const agent = createPESUAgent({
    headless: false,
    outputDir: path.join(ROOT_DIR, 'downloads', 'PESU_Academy'),
    workspaceDir: ROOT_DIR,
  });

  await agent.run({
    appRoot: ROOT_DIR,
    isPackaged: false,
    password: process.env.PESU_PASSWORD,
    playwrightBrowsersPath: path.join(ROOT_DIR, 'playwright-browsers'),
    resourcesPath: process.resourcesPath,
    username: process.env.PESU_USERNAME,
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

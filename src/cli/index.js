#!/usr/bin/env node

const path = require('path');
const dotenv = require('dotenv');
const { createPESUAgent } = require('../core/pesuAgent');
const { parseSpeedOption, SPEED_PRESETS } = require('../core/unitTools');

const ROOT_DIR = path.resolve(__dirname, '../..');
dotenv.config({ path: path.join(ROOT_DIR, '.env'), quiet: true });

function parseArgs(argv) {
  const parsed = {
    headless: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
      continue;
    }

    if (arg === '--headless') {
      parsed.headless = true;
      continue;
    }

    if (arg === '--username' && next) {
      parsed.username = next;
      index += 1;
      continue;
    }

    if (arg.startsWith('--username=')) {
      parsed.username = arg.slice('--username='.length);
      continue;
    }

    if (arg === '--password' && next) {
      parsed.password = next;
      index += 1;
      continue;
    }

    if (arg.startsWith('--password=')) {
      parsed.password = arg.slice('--password='.length);
      continue;
    }

    if ((arg === '--output' || arg === '--outputDir') && next) {
      parsed.outputDir = next;
      index += 1;
      continue;
    }

    if (arg.startsWith('--output=')) {
      parsed.outputDir = arg.slice('--output='.length);
      continue;
    }

    if (arg.startsWith('--outputDir=')) {
      parsed.outputDir = arg.slice('--outputDir='.length);
      continue;
    }

    if (arg === '--speed' && next) {
      parsed.speed = next;
      index += 1;
      continue;
    }

    if (arg.startsWith('--speed=')) {
      parsed.speed = arg.slice('--speed='.length);
      continue;
    }

    if (arg === '--delay-ms' && next) {
      parsed.delayMs = next;
      index += 1;
      continue;
    }

    if (arg.startsWith('--delay-ms=')) {
      parsed.delayMs = arg.slice('--delay-ms='.length);
    }
  }

  return parsed;
}

function printHelp() {
  process.stdout.write(
    [
      'Usage: npm run cli -- [options]',
      '',
      'Options:',
      '  --username <value>     PESU username (defaults to PESU_USERNAME from .env)',
      '  --password <value>     PESU password (defaults to PESU_PASSWORD from .env)',
      '  --output <dir>         Download root directory',
      '  --headless             Run Chromium headless',
      `  --speed <preset>       Automation speed: ${Object.keys(SPEED_PRESETS).join(' | ')}`,
      `                         (${Object.entries(SPEED_PRESETS).map(([k, v]) => `${k}=${v}ms`).join(', ')})`,
      '  --delay-ms <number>    Custom action delay in ms (0-60000, overrides --speed)',
      '  --help                 Show this help text',
      '',
    ].join('\n')
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const outputDir = path.resolve(args.outputDir || path.join(ROOT_DIR, 'downloads', 'PESU_Academy'));

  let speed;
  try {
    speed = parseSpeedOption({ speed: args.speed, delayMs: args.delayMs });
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`Automation speed: ${speed.label}\n`);

  const agent = createPESUAgent({
    actionDelayMs: speed.actionDelayMs,
    headless: args.headless,
    outputDir,
    speedLabel: speed.label,
    workspaceDir: ROOT_DIR,
  });

  const counts = await agent.run({
    appRoot: ROOT_DIR,
    isPackaged: false,
    password: args.password || process.env.PESU_PASSWORD,
    playwrightBrowsersPath: path.join(ROOT_DIR, 'playwright-browsers'),
    resourcesPath: process.resourcesPath,
    username: args.username || process.env.PESU_USERNAME,
  });

  process.stdout.write(
    `Summary: downloaded=${counts.downloaded}, skipped=${counts.skipped}, failed=${counts.failed}\n`
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

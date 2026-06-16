#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { createPESUAgent } = require('../core/pesuAgent');
const { parseSpeedOption, SPEED_PRESETS, buildSelectionFromCli } = require('../core/unitTools');

const ROOT_DIR = path.resolve(__dirname, '../..');
const { version: APP_VERSION } = require('../../package.json');
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

    if (arg === '--version' || arg === '-v') {
      parsed.version = true;
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
      continue;
    }

    if (arg === '--course' && next) {
      parsed.course = next;
      index += 1;
      continue;
    }

    if (arg.startsWith('--course=')) {
      parsed.course = arg.slice('--course='.length);
      continue;
    }

    if (arg === '--unit' && next) {
      parsed.unit = next;
      index += 1;
      continue;
    }

    if (arg.startsWith('--unit=')) {
      parsed.unit = arg.slice('--unit='.length);
      continue;
    }

    if (arg === '--list') {
      parsed.list = true;
      continue;
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
      '  --course <list>        Only download these courses (codes or names, comma-separated)',
      '  --unit <list>          Only download these unit numbers (e.g. "1,2,3")',
      '  --list                 Discover and print all courses and units, then exit',
      '  --version              Show the version and exit',
      '  --help                 Show this help text',
      '',
      'Examples:',
      '  npm run cli -- --list',
      '  npm run cli -- --course "UQ25CA651B" --unit "1,2"',
      '  npm run cli -- --course "Algorithms,Network Security"',
      '',
    ].join('\n')
  );
}

// Confirm credentials are present and the output directory is writable before
// we bother launching a browser, so the user gets a clear, early message.
function validateRunInputs({ username, password, outputDir }) {
  const errors = [];

  if (!username) {
    errors.push(
      'Missing PESU username. Set PESU_USERNAME in your .env file (copy .env.example to .env) or pass --username <value>.'
    );
  }

  if (!password) {
    errors.push(
      'Missing PESU password. Set PESU_PASSWORD in your .env file (copy .env.example to .env) or pass --password <value>.'
    );
  }

  if (outputDir) {
    try {
      fs.mkdirSync(outputDir, { recursive: true });
      fs.accessSync(outputDir, fs.constants.W_OK);
    } catch (error) {
      errors.push(
        `Output folder is not writable: ${outputDir} (${error.code || error.message}). Choose a different folder with --output <dir>.`
      );
    }
  }

  return errors;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  if (args.version) {
    process.stdout.write(`${APP_VERSION}\n`);
    return;
  }

  const outputDir = path.resolve(args.outputDir || path.join(ROOT_DIR, 'downloads', 'PESU_Academy'));
  const username = args.username || process.env.PESU_USERNAME;
  const password = args.password || process.env.PESU_PASSWORD;

  const inputErrors = validateRunInputs({ username, password, outputDir });
  if (inputErrors.length) {
    process.stderr.write(`Cannot start:\n${inputErrors.map((line) => `  - ${line}`).join('\n')}\n`);
    process.exitCode = 1;
    return;
  }

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

  const runnerConfig = {
    appRoot: ROOT_DIR,
    isPackaged: false,
    password,
    playwrightBrowsersPath: path.join(ROOT_DIR, 'playwright-browsers'),
    resourcesPath: process.resourcesPath,
    username,
  };

  // --list: discover and print the course/unit catalog, then exit.
  if (args.list) {
    const catalog = await agent.discover(runnerConfig);
    process.stdout.write(`\nFound ${catalog.length} course(s):\n\n`);
    for (const course of catalog) {
      process.stdout.write(`${course.code ? `${course.code} - ` : ''}${course.title || course.label}\n`);
      if (course.error) {
        process.stdout.write(`  (could not read units: ${course.error})\n`);
      } else if (!course.units.length) {
        process.stdout.write('  (no units detected)\n');
      } else {
        for (const unit of course.units) {
          process.stdout.write(`  - Unit ${unit.number ?? '?'}: ${unit.text}\n`);
        }
      }
      process.stdout.write('\n');
    }
    process.stdout.write('Re-run with --course / --unit to download a subset.\n');
    return;
  }

  const selection = buildSelectionFromCli(args.course, args.unit);
  if (selection) {
    process.stdout.write(
      `Selection: ${selection.courses
        .map((entry) => `${entry.key}${entry.units && entry.units.length ? ` [units ${entry.units.join(',')}]` : ''}`)
        .join(' | ')}\n`
    );
  }

  const counts = await agent.run({ ...runnerConfig, selection });

  process.stdout.write(
    `Summary: downloaded=${counts.downloaded}, skipped=${counts.skipped}, failed=${counts.failed}\n`
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

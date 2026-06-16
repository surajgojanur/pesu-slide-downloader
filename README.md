# PESU Academy Slide Downloader

> A desktop app and CLI that logs into [PESU Academy](https://www.pesuacademy.com/),
> walks through every course and unit, and saves the lecture slide PDFs into a
> clean, course/unit-organised folder on your computer.

PESU Academy serves slides one class at a time through a single-page interface:
you open a course, switch to a unit tab, click a class, open the slide viewer,
and save the PDF — then repeat for hundreds of classes. This project automates
that entire loop with a real Chromium browser driven by **Playwright**, wrapped
in a friendly **Electron** desktop UI for non-technical students (and a CLI for
power users).

---

## Table of Contents

- [Features](#features)
- [Tech Stack & Requirements](#tech-stack--requirements)
- [Installation & Setup](#installation--setup)
- [Running the App](#running-the-app)
  - [Desktop (recommended)](#desktop-recommended)
  - [CLI](#cli)
  - [Tests](#tests)
  - [Packaged builds](#packaged-builds)
- [Environment Variables](#environment-variables)
- [Automation Speed](#automation-speed)
- [Output Format](#output-format)
- [Project Structure](#project-structure)
- [How It Works](#how-it-works)
- [Troubleshooting](#troubleshooting)
- [Security & Privacy](#security--privacy)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)
- [Disclaimer](#disclaimer)

For a deep technical reference (module-by-module breakdown, data flow, function
catalogue), see **[DOCUMENTATION.md](./DOCUMENTATION.md)**.

---

## Features

- **One-click automated login** to PESU Academy using credentials supplied at runtime.
- **Automatic course discovery** from the *My Courses* table.
- **Dynamic, adaptive unit detection** — reads the live DOM instead of relying on hard-coded selectors, so it tolerates UI variations (`Unit 1`, `Unit-2`, `UNIT III`, `Module 4`, …).
- **Slide-to-PDF extraction** across multiple viewer styles (direct links, `loadIframe(...)` handlers, glyphicon "eye" viewers, `blob:` PDFs, popups, and Playwright download events).
- **Verified unit activation** — proves the correct unit is loaded (by active tab, heading, and a content fingerprint) before saving any PDF, guarding against the SPA "wrong unit" bug.
- **Resume / skip-existing** — files already on disk are skipped, so interrupted runs continue where they left off.
- **Organised output** mirroring the PESU `Course / Unit / Class.pdf` hierarchy.
- **Adjustable automation speed** (Fast / Normal / Slow / Safe / custom delay) for flaky connections.
- **Live progress** — streaming log, plus downloaded / skipped / failed counters, and a Stop button.
- **Credential redaction** in all logs.
- **Cross-platform packaging** configured for Linux (validated), Windows, and macOS.

---

## Tech Stack & Requirements

| Area | Technology |
| --- | --- |
| Language / runtime | Node.js (CommonJS), **Node 18+** required (uses the built-in global `fetch`) |
| Browser automation | [Playwright](https://playwright.dev/) `^1.59` driving managed Chromium |
| Desktop shell | [Electron](https://www.electronjs.org/) `^41` |
| Packaging | [electron-builder](https://www.electron.build/) `^26` (AppImage / deb / nsis / dmg) |
| Config | [dotenv](https://github.com/motdotla/dotenv) `^17` (CLI only) |
| Tests | Dependency-free Node assertion runner (`node:assert`) |

**Prerequisites**

- Node.js 18 or newer and npm.
- A PESU Academy account.
- Internet access (login, navigation, and PDF retrieval all hit the live site).
- On Linux, the usual Chromium runtime libraries (electron-builder/Playwright pull most in; a system Chromium is used as a last-resort fallback).

---

## Installation & Setup

```bash
# 1. Clone the repository
git clone <your-fork-url> pesu-slide-downloader
cd pesu-slide-downloader

# 2. Install dependencies
#    The "postinstall" hook automatically downloads the managed Chromium
#    bundle into ./playwright-browsers via Playwright.
npm install

# 3. (Optional) re-run the browser install explicitly if step 2 was skipped
npm run playwright:install

# 4. (CLI only) create your .env from the template
cp .env.example .env
# then edit .env and set PESU_USERNAME and PESU_PASSWORD
```

The managed Chromium bundle is intentionally vendored into `./playwright-browsers`
so packaged desktop builds don't depend on a separately installed system browser.

---

## Running the App

### Desktop (recommended)

```bash
npm run desktop
```

Then, in the window:

1. Enter your PESU **username** and **password** (kept in memory for this run only).
2. Click **Browse** to choose a download folder (defaults to `~/Downloads/PESU_Academy`).
3. Pick an **Automation speed** (Fast / Normal / Slow / Safe), or `Custom delay…` for an exact value in ms.
4. Click **Start Download**. A real Chromium window opens and the run begins.
5. Watch the **Live Log** and the Downloaded / Skipped / Failed counters.
6. Use **Stop** to cancel cleanly, or **Open Folder** to view results.

### CLI

The CLI reads credentials from `.env` (or flags) and drives the same core engine.

```bash
npm run cli                       # uses PESU_USERNAME / PESU_PASSWORD from .env
npm run cli -- --headless         # run Chromium headless
npm run cli -- --speed safe       # slowest, most reliable preset
npm run cli -- --delay-ms 1800    # custom inter-action delay (overrides --speed)
npm run cli -- --output ~/slides  # custom output directory
npm run cli -- --help             # full flag reference
```

| Flag | Description |
| --- | --- |
| `--username <value>` | PESU username (default: `PESU_USERNAME` from `.env`) |
| `--password <value>` | PESU password (default: `PESU_PASSWORD` from `.env`) |
| `--output <dir>` / `--outputDir <dir>` | Download root directory |
| `--headless` | Run Chromium without a visible window |
| `--speed <fast\|normal\|slow\|safe>` | Automation speed preset |
| `--delay-ms <0-60000>` | Custom action delay in ms (overrides `--speed`) |
| `--help`, `-h` | Show help |

A legacy wrapper, `npm run pesu:agent`, runs the same core with fixed defaults
and is kept for backwards compatibility.

> **Note:** `npm run pesu` and `npm run pesu:debug` run `scripts/pesu-download-slides.js`,
> an older standalone prototype that prompts for manual login. The maintained
> path is the desktop app and `npm run cli`.

### Tests

```bash
npm test
```

This runs two dependency-free suites with no browser required:

- `tests/unit.test.js` — pure helpers (unit parsing, fingerprinting, speed parsing, duplicate detection).
- `tests/simulation.test.js` — an in-memory mock of the PESU SPA that drives the **real** navigation code to prove each unit's slides land in the correct folder, even under the adversarial "sticky active tab" / "Back to Units resets to Unit 1" conditions.

### Packaged builds

```bash
npm run build:linux   # AppImage (validated)
npm run build:win     # NSIS installer (configured, needs validation)
npm run build:mac     # DMG (configured, needs signing + validation)
```

Artifacts are written to `./dist`. The Chromium bundle in `playwright-browsers`
is included as an extra resource so the installed app is self-contained.

---

## Environment Variables

All variables are optional for the desktop app (it uses its UI). The CLI and the
`pesu:agent` script read `PESU_USERNAME` / `PESU_PASSWORD` from `.env`. See
[`.env.example`](./.env.example) for a copy-paste template.

| Variable | Used by | Default | Description |
| --- | --- | --- | --- |
| `PESU_USERNAME` | CLI, `pesu:agent` | — | PESU login, default when `--username` is omitted. |
| `PESU_PASSWORD` | CLI, `pesu:agent` | — | PESU password, default when `--password` is omitted. |
| `PESU_AGENT_DELAY_MS` | core downloader | `800` (or `1400` if `PWDEBUG`) | Inter-action delay in ms. Overridden by the CLI/desktop speed settings. |
| `PWDEBUG` | Playwright, npm scripts | unset | Enables Playwright's inspector and bumps the default delay to 1400 ms. |
| `PLAYWRIGHT_BROWSERS_PATH` | Playwright / browser resolver | auto | Where to find the managed Chromium bundle. Normally set automatically. |

---

## Automation Speed

Both the desktop UI and CLI control how long the downloader pauses between browser
actions. Slower speeds are more reliable on flaky connections or when PESU updates
unit content slowly through AJAX.

| Preset | Action delay |
| --- | --- |
| `fast` | 250 ms |
| `normal` | 800 ms (default) |
| `slow` | 1400 ms |
| `safe` | 2200 ms |
| custom | any value 0–60000 ms (`--delay-ms` or "Custom delay…") |

Invalid values produce a clear error and a non-zero exit code.

---

## Output Format

Downloads mirror the PESU hierarchy:

```text
<output-dir>/
  UQ25CA651B - Algorithms Analysis and Design/
    Unit 01 - Introduction, Analysis Framework and Sorting Techniques/
      01 - Introduction.pdf
      02 - Recurrence Relations.pdf
    Unit 02 - Searching and Graph Problems/
      01 - ...
```

- Course folder: `<CourseCode> - <Course Title>`
- Unit folder: `Unit NN - <Unit Name>`
- File: `NN - <Class Title>.pdf` (with `(Slide NN)` suffix when a class has multiple slide assets)

Existing files are skipped, enabling safe restart/resume.

---

## Project Structure

```text
pesu-slide-downloader/
├── package.json                 # Scripts, deps, electron-builder config
├── .env.example                 # Environment template (copy to .env)
├── README.md                    # This file
├── DOCUMENTATION.md             # Deep technical reference
├── CHANGELOG.md                 # Version history
│
├── src/
│   ├── core/                    # Browser-agnostic automation engine
│   │   ├── downloader.js        # Main Playwright pipeline & PESU traversal (~2600 LOC)
│   │   ├── browserResolver.js   # Resolves the right Chromium binary (dev vs packaged vs system)
│   │   ├── pesuAgent.js         # Thin factory wrapping runPESUDownloader + requestStop
│   │   ├── unitTools.js         # Pure helpers: unit identity, fingerprints, speed parsing
│   │   ├── progressStore.js     # Progress persistence + UI progress events
│   │   ├── logger.js            # Structured logging with credential redaction
│   │   └── fileUtils.js         # ensureDir / sanitizeName / JSON load+save / timestamps
│   │
│   ├── cli/
│   │   └── index.js             # CLI entrypoint: arg parsing → core engine
│   │
│   └── desktop/                 # Electron application
│       ├── main.js              # Main process: window, IPC handlers, run lifecycle
│       ├── preload.js           # contextBridge API exposed to the renderer
│       └── renderer/            # Front-end (no framework)
│           ├── index.html       # UI layout
│           ├── renderer.js      # UI logic, event wiring, log/progress rendering
│           └── styles.css       # Styling
│
├── scripts/
│   ├── install-playwright-chromium.js   # Installs Chromium into ./playwright-browsers
│   ├── pesu-agent.js                    # Legacy core wrapper (env-credential run)
│   └── pesu-download-slides.js          # Original standalone prototype (manual login)
│
├── tests/
│   ├── unit.test.js             # Pure-logic unit tests
│   └── simulation.test.js       # In-memory SPA simulation of the navigation logic
│
├── memory/                      # Runtime/diagnostic state (not part of releases)
│   ├── pesu-progress.json       # Downloaded/failed/history ledger
│   ├── pesu-learned-selectors.json   # Selectors that worked, cached for future runs
│   └── pesu-notes.md            # Append-only operator notes/log
│
└── playwright-browsers/         # Vendored managed Chromium bundle (git-ignored)
```

Generated at runtime and git-ignored: `downloads/`, `logs/`, `screenshots/`,
`debug/`, `dist/`, `.chromium-profile/`, `.tmp-downloads/`, `node_modules/`,
`.env`.

---

## How It Works

```text
 UI / CLI ──► pesuAgent.run() ──► runPESUDownloader()
                                      │
                                      ▼
   browserResolver → launch persistent Chromium (Playwright)
                                      │
        login → My Courses → for each course:
                                      │
              discover units → for each unit:
                  openUnitVerified()  (prove the right unit is active)
                       │
                  for each class row:
                       ensureUnitActive() → open slide → find PDF source
                       → directDownload() / saveBlob() / Playwright download
                       → write Course/Unit/NN - Title.pdf  (skip if exists)
                       → return to unit table
                                      │
                       progressStore + logger stream events back to the UI
```

Key reliability mechanism: PESU swaps unit content via AJAX and its "Back to Units"
control silently resets to Unit 1. The downloader re-discovers units with fresh
selectors on every transition and refuses to save slides until it can **prove**
(via active-tab signal, heading match, or a row/source content fingerprint) that
the intended unit is actually loaded — failing loudly with a debug bundle rather
than saving the wrong unit's slides. Full details in
[DOCUMENTATION.md](./DOCUMENTATION.md).

---

## Troubleshooting

- **Unit 2/3/4 downloads Unit 1 again** — the original SPA bug, now guarded by verified unit activation. If you still see it, run in `safe` speed and inspect the latest `debug/*-unit-activation-failed-*.{png,html,json}` bundle.
- **"Could not prove Unit NN became active"** — PESU didn't switch units in time. Re-run in `slow` or `safe`. The run continues with the remaining units rather than saving wrong content.
- **"Unit source fingerprint matches previous unit"** — two units produced identical PDF sources; the downloader refused to count them. Re-run slower and check the debug bundle.
- **"Browser not installed"** — run `npm run playwright:install` to (re)download the Chromium bundle.
- **"No slide table could be inferred"** — a unit had no detectable slides table (e.g. video-only units). This is recorded as a failure for that unit and the run moves on.
- **Login fails / sign-in page stays** — double-check credentials; a `debug/login-failed-*` bundle is captured.

Logs are written to `logs/pesu-download.log`; per-step diagnostics (screenshot +
HTML + JSON) go to `debug/`.

---

## Security & Privacy

- Credentials are never persisted by the app — they live in memory for the active run only.
- No data is sent anywhere except directly to PESU Academy; everything runs locally.
- All logs redact your username and password if they ever appear in a message.
- `.env` is git-ignored and excluded from packaged builds.

---

## Roadmap

- **Course/Unit selection UI** — checkboxes to download only chosen courses/units.
- **Better progress UX** — true progress bar, per-download retry actions.
- **Performance** — controlled parallel downloads, fewer redundant reloads.
- **Packaging** — signed Windows `.exe` and macOS `.dmg`, icons and branding.
- **Reliability** — broader retry/recovery, more viewer-variant coverage.

---

## Contributing

Contributions should preserve the layered separation of concerns:

- `src/core` — automation and runtime logic (no Electron/CLI specifics).
- `src/desktop` — Electron integration and UI.
- `src/cli` — command-line workflows.

Suggested workflow:

1. `npm install` and `npm run playwright:install`.
2. Reproduce the issue via the desktop app or `npm run cli`.
3. Keep changes localized to the correct layer.
4. Run `npm test` (and at least one real runtime path) before opening a PR.

---

## License

ISC. See [`package.json`](./package.json).

---

## Disclaimer

This project is intended for educational use by PESU students. It automates
actions a user could otherwise perform manually through the PESU Academy
interface. Users are responsible for operating it consistently with institutional
policies and platform usage expectations.

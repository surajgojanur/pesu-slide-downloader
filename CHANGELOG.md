# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

_Nothing yet._

---

## [1.1.0] — 2026-06-16

Adds course/unit selection, a set of UX improvements, and cross-platform fixes.

### Added

**Course & unit selection**
- Discovery phase (`discoverCatalog` in `src/core/downloader.js`) that logs in, lists every course, and opens each course just far enough to read its unit tabs — downloads nothing. Exposed on the agent as `agent.discover(...)`.
- Normalized, serializable selection model and pure helpers in `src/core/unitTools.js` (`parseCsvList`, `parseUnitNumbers`, `buildSelectionFromCli`, `courseMatchesKey`, `isCourseSelected`, `selectedUnitsForCourse`, `isUnitSelected`), with full unit-test coverage.
- Run loop now filters by selection: unselected courses are never opened, units are filtered per course, and progress totals reflect the selection.
- **CLI:** `--course <list>`, `--unit <list>` (digits/roman, comma-separated), and `--list` (discover and print the catalog, then exit). `--unit` alone applies across all courses via a wildcard.
- **Desktop:** a **Discover Courses & Units** button plus a checkbox tree (course checkbox toggles its units, with Select all / Clear); the chosen subset is passed to the run. New `pesu:discover` IPC channel; `pesu:start` now accepts a `selection` payload.

**UX**
- Friendly-log mode in the desktop UI: only milestone messages show by default, with a **Show technical details** toggle (errors always shown).
- Progress bar showing **Course X/Y · Unit X/Y**, driven by structured `nav` progress events from the engine.
- Friendly, early CLI credential validation pointing to `.env` / flags.
- Pre-flight writable-output-directory checks (CLI and desktop).
- `--version` / `-v` CLI flag; `engines: { node: ">=18" }` in `package.json`.
- Postinstall now prints a download size/time notice and fails gracefully (warns instead of aborting `npm install`) when run as a `postinstall` hook.
- Deprecation banner when running the legacy `npm run pesu` prototype.

**Docs**
- `DOCUMENTATION.md` — deep technical reference (architecture, module breakdown, data flow, IPC contract, known issues).
- `.env.example` — documented template for all environment variables.

### Changed
- `--no-sandbox` is now applied conditionally (Linux only) via `app.commandLine.appendSwitch` instead of being hard-coded in the `desktop` npm script.
- Windows-incompatible `PWDEBUG=1` npm scripts now use `cross-env`.
- "Browser not installed" error now tells the user to run `npm run playwright:install`.
- Desktop password field is cleared on failure as well as on success.
- Rewrote `README.md` with full setup, env table, project tree, selection workflow, and usage docs; filled in `package.json` `keywords` and `author` metadata.

### Fixed
- Bare roman numerals (`--unit "I,II,III"`) are now parsed correctly.

---

## [1.0.0] — 2026-04-26

First production-ready release: a self-contained desktop app and CLI that
download PESU Academy slide PDFs into a course/unit-organised local archive.

### Added

**Core engine (`src/core`)**
- `runPESUDownloader` Playwright pipeline: automated login, course discovery from
  the *My Courses* table, adaptive unit detection, slide-detail handling, and PDF
  retrieval.
- Adaptive page observation (`observePage`) that reasons over live DOM headings,
  clickable choices, tables, dialogs, and forms instead of hard-coded selectors.
- **Verified unit activation** to fix the "Unit 2/3/4 re-downloads Unit 1" SPA bug:
  fresh per-transition unit discovery, slide-table fingerprinting, multi-signal
  activation proof (active tab / heading / content change), per-row re-assertion
  after "Back to Units", and a duplicate-source guard.
- Multiple PDF source strategies: immediate iframe/embed/object sources,
  `loadIframe(...)` / glyphicon "eye" viewers, direct anchors, Playwright download
  events, popups, and same-tab navigations; cookie-authenticated `fetch`, `blob:`
  capture, and skip-existing/resume behaviour.
- Navigation recovery (`recoverCourseUnitContext`, `returnToUnitTable`) for
  `about:blank` and failed-return cases.
- Cancellation support via `requestStop` / `throwIfStopRequested`.
- `browserResolver` — bundled → Playwright-cache → system Chromium resolution for
  dev and packaged builds.
- `unitTools` — pure helpers for unit identity (arabic/roman/keyword), fingerprints,
  speed parsing, and duplicate-source detection.
- `progressStore` (ledger + UI events), `logger` (with credential redaction),
  `fileUtils`, and the `pesuAgent` factory.

**Desktop app (`src/desktop`)**
- Electron main process with IPC for folder selection, opening the output folder,
  start, and cooperative stop; context-isolated `preload` bridge; and a
  framework-free renderer with live log, counters, and automation-speed selector
  (including custom delay).

**CLI (`src/cli`)**
- Flag-driven entrypoint (`--username/--password/--output/--headless/--speed/--delay-ms`)
  with `.env` defaults via dotenv.

**Automation speed**
- Presets `fast` (250ms) / `normal` (800ms, default) / `slow` (1400ms) / `safe`
  (2200ms) plus custom `--delay-ms` (0–60000), surfaced in both UI and CLI with
  validation.

**Packaging & tooling**
- electron-builder config for Linux (AppImage/deb, validated), Windows (nsis),
  and macOS (dmg); managed Chromium bundled as an extra resource and
  asar-unpacked.
- `scripts/install-playwright-chromium.js` (runs on `postinstall`).
- Dependency-free test suites: `tests/unit.test.js` (pure helpers) and
  `tests/simulation.test.js` (in-memory PESU SPA driving the real navigation code,
  including the adversarial sticky-tab case).

### Known limitations
- Processes the entire account; no per-course/unit selection yet.
- Detection depends on PESU's current UI structure.
- `scripts/pesu-download-slides.js` remains as an unmaintained standalone
  prototype (manual login) superseded by `src/core`.

---

## [0.1.0] — 2026-04-25

### Added
- Initial commit: PESU adaptive slide downloader agent (the standalone
  `scripts/pesu-download-slides.js` prototype with manual login and self-contained
  course/unit/slide discovery).

[Unreleased]: #unreleased
[1.1.0]: #110--2026-06-16
[1.0.0]: #100--2026-04-26
[0.1.0]: #010--2026-04-25

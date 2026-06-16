# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `DOCUMENTATION.md` — deep technical reference (architecture, module breakdown, data flow, IPC contract, known issues).
- `.env.example` — documented template for all environment variables.

### Changed
- Rewrote `README.md` with full setup, env table, project tree, and usage docs.
- Filled in `package.json` `keywords` and `author` metadata.

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
[1.0.0]: #100--2026-04-26
[0.1.0]: #010--2026-04-25
